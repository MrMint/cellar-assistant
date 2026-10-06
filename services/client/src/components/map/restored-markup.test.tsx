/**
 * Render tests for the restored map/place/scan/discovery components,
 * asserting the **old** markup and copy (`82450ad1:src/components/map/*`).
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, Provider } from "urql";
import { NextImageConfig, optimizedSrc } from "../../test-support/next-image";

mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/map",
  useSearchParams: () => new URLSearchParams(),
}));

const { PlaceMenuItems } = await import("./places/PlaceMenuItems");
const { GoogleAttribution } = await import("./places/GoogleAttribution");
const { DuplicatePlaceCheck } = await import("./places/DuplicatePlaceCheck");
const { GooglePlaceSuggestions } = await import(
  "./places/GooglePlaceSuggestions"
);
const { PlaceDetailsContent } = await import("./places/PlaceDetailsContent");
const { CreatePlaceForm } = await import("./places/CreatePlaceForm");
const { ScanHistory } = await import("./scanning/ScanHistory");
const { DiscoveryDashboard } = await import("./discovery/DiscoveryDashboard");
const { menuItemFrom } = await import("./adapter");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const render = (node: ReactNode) =>
  renderToStaticMarkup(<Provider value={client}>{node}</Provider>).replace(
    /<style[^>]*>[^<]*<\/style>/g,
    "",
  );

const matched = menuItemFrom({
  id: "l1",
  name: "Kubota Junmai",
  description: "Crisp",
  price: 14,
  menuCategory: "Sake",
  detectedItemType: "sake",
  extractedAttributes: { region: "Niigata" },
  matchedItem: {
    id: "s1",
    type: "sake",
    item: { id: "s1", name: "Kubota Senju" },
  },
});
const unmatched = menuItemFrom({
  id: "l2",
  name: "House Red",
  menuCategory: null,
  detectedItemType: "wine",
});

describe("PlaceMenuItems (restored)", () => {
  test("lines by category, the old match badges, price and actions", () => {
    const html = render(
      <PlaceMenuItems placeId="p1" menuItems={[matched, unmatched]} />,
    );
    assert.match(html, />Sake</);
    assert.match(html, />Other</);
    assert.match(html, /Matched to: Kubota Senju/);
    assert.match(html, /\$14/);
    assert.match(html, /region: Niigata/);
    assert.match(html, /View Details/);
    // A matched line's "Add to Cellar" opens the item; an unmatched one has
    // no pretend button and no promise that adding creates an item.
    assert.match(html, /href="\/sakes\/s1"[^>]*>.*Add to Cellar/s);
    assert.equal(html.match(/Add to Cellar/g)?.length, 1);
    assert.match(html, /New item - not yet matched/);
    assert.doesNotMatch(html, /will be created when added/);
  });

  test("empty state", () => {
    assert.match(
      render(<PlaceMenuItems placeId="p1" menuItems={[]} />),
      /No menu items available/,
    );
  });

  test("Load more under the list while lines remain past the first page", () => {
    const more = render(
      <PlaceMenuItems
        placeId="p1"
        menuItems={[matched]}
        hasMore
        onLoadMore={() => {}}
      />,
    );
    assert.match(more, />Load more</);
    const done = render(
      <PlaceMenuItems
        placeId="p1"
        menuItems={[matched]}
        hasMore={false}
        onLoadMore={() => {}}
      />,
    );
    assert.doesNotMatch(done, /Load more/);
    assert.match(
      render(
        <PlaceMenuItems
          placeId="p1"
          menuItems={[matched]}
          loadMoreError="The server did not answer."
        />,
      ),
      /The server did not answer\./,
    );
  });
});

describe("GoogleAttribution", () => {
  test("Powered by Google plus the attribution blocks the terms require", () => {
    const html = render(
      <GoogleAttribution
        enrichment={{
          googlePlaceId: "g",
          name: "Bar",
          formattedAddress: null,
          rating: null,
          userRatingsTotal: null,
          priceLevel: null,
          website: null,
          phone: null,
          openingHours: null,
          types: [],
          businessStatus: null,
          editorialSummary: null,
          attributions: ["<b>Yelp</b>"],
        }}
        photos={[
          {
            id: "ph",
            url: null,
            displayOrder: 0,
            attributions: [{ displayName: "Ann Author" }],
          },
        ]}
      />,
    );
    assert.match(html, /Powered by Google · Yelp · Photos: Ann Author/);
    assert.equal(render(<GoogleAttribution enrichment={null} />), "");
  });
});

describe("create place (restored)", () => {
  test("DuplicatePlaceCheck copy", () => {
    const html = render(
      <DuplicatePlaceCheck
        duplicates={[
          {
            id: "d",
            name: "Rusty Barrel",
            primary_category: "bar",
            street_address: "1 Main",
            locality: "Madison",
            similarity: 0.9,
            distance_m: 10,
          },
        ]}
        onSelectExisting={() => {}}
        onConfirmNew={() => {}}
      />,
    );
    assert.match(html, /We found similar places nearby/);
    assert.match(html, /This is it/);
    assert.match(html, /None of these — create new place/);
  });

  test("GooglePlaceSuggestions copy", () => {
    const html = render(
      <GooglePlaceSuggestions
        places={[
          {
            googlePlaceId: "g",
            name: "Rusty Barrel",
            address: "1 Main St",
            types: ["bar"],
            location: { latitude: 0, longitude: 0 },
          },
        ]}
        loading={false}
        onSelect={() => {}}
        onDismiss={() => {}}
      />,
    );
    assert.match(html, /We found these places nearby/);
    assert.match(html, /Rusty Barrel/);
  });

  test("the old form: labels, address chips and Add Place", () => {
    const html = render(<CreatePlaceForm latitude={43.07} longitude={-89.4} />);
    for (const label of [
      "Name \\*",
      "Categories \\*",
      "Street Address",
      "City",
      "State/Region",
      "Postal Code",
      "Country Code",
      "Phone",
      "Website",
      "Description \\(optional\\)",
    ]) {
      assert.match(html, new RegExp(`>${label}<`), label);
    }
    assert.match(html, /43\.07000, -89\.40000/);
    assert.match(html, /Loading address\.\.\./);
    assert.match(html, />Add Place</);
  });
});

describe("drawer content (restored)", () => {
  test("header, actions, menu and attribution", () => {
    const html = render(
      <PlaceDetailsContent
        place={{
          id: "p1",
          name: "Rusty Barrel",
          primary_category: "bar",
          categories: ["bar", "pub"],
          street_address: "1 Main",
          locality: "Madison",
          rating: 4.4,
        }}
        userInteraction={{ is_favorite: true, is_visited: false }}
        menuItems={[matched]}
        loadingDetails={false}
        hasMenuItems
        userId=""
        variant="desktop"
        onClose={() => {}}
        refetch={() => {}}
        setInteraction={async () => null}
        enrichment={null}
        googlePhotos={[]}
      />,
    );
    assert.match(html, /href="\/places\/p1"/);
    assert.match(html, /Rusty Barrel/);
    assert.match(html, /4\.4/);
    assert.match(html, /1 Main, Madison/);
    assert.match(html, /Directions/);
    assert.match(html, /Saved/);
    assert.match(html, /Menu Items/);
    assert.match(html, /Kubota Junmai/);
    assert.doesNotMatch(html, /Load more/);
    assert.match(html, /aria-label="Close place details"/);
  });

  test("the mirrored photo goes through /_next/image, as the old Nhost one did", () => {
    const photo =
      "https://files.test/cellar-files/place-photo/p.jpg?X-Amz-Signature=1";
    const html = renderToStaticMarkup(
      <NextImageConfig>
        <Provider value={client}>
          <PlaceDetailsContent
            place={{
              id: "p1",
              name: "Rusty Barrel",
              primary_category: "bar",
              categories: [],
              street_address: null,
              locality: null,
              rating: null,
            }}
            userInteraction={null}
            menuItems={[]}
            loadingDetails={false}
            hasMenuItems={false}
            userId=""
            variant="desktop"
            onClose={() => {}}
            refetch={() => {}}
            setInteraction={async () => null}
            enrichment={null}
            googlePhotos={[
              { id: "ph", url: photo, displayOrder: 0, attributions: [] },
            ]}
          />
        </Provider>
      </NextImageConfig>,
    );
    // `fill` + the old `sizes`: the browser picks a width from the srcset,
    // and the largest configured width is the fallback `src`.
    assert.ok(html.includes(`src="${optimizedSrc(photo, 1080)}"`), html);
    assert.ok(html.includes(`${optimizedSrc(photo, 400)} 400w`));
    assert.match(html, /sizes="\(max-width: 600px\) 100vw, 720px"/);
    assert.ok(!html.includes(`src="${photo}"`));
  });
});

describe("drawer menu badge counts every line, not the loaded page", () => {
  test("totalCount in the chip, Load more below", () => {
    const html = render(
      <PlaceDetailsContent
        place={{
          id: "p1",
          name: "Rusty Barrel",
          primary_category: "bar",
          categories: [],
          street_address: null,
          locality: null,
          rating: null,
        }}
        userInteraction={null}
        menuItems={[matched, unmatched]}
        menuItemCount={240}
        hasMoreMenuItems
        onLoadMoreMenuItems={() => {}}
        loadingDetails={false}
        hasMenuItems
        userId=""
        variant="desktop"
        onClose={() => {}}
        refetch={() => {}}
        setInteraction={async () => null}
        enrichment={null}
        googlePhotos={[]}
      />,
    );
    assert.match(html, /Menu Items<\/[^>]+>.*?>240</s);
    assert.match(html, />Load more</);
  });
});

describe("scans and discoveries (restored)", () => {
  test("ScanHistory starts on the old spinner", () => {
    assert.match(render(<ScanHistory />), /MuiCircularProgress/);
  });

  test("DiscoveryDashboard starts on the old spinner", () => {
    assert.match(render(<DiscoveryDashboard />), /MuiCircularProgress/);
  });
});
