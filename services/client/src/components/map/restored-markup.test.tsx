/**
 * Render tests for the restored map/place/discovery components, asserting
 * the **old** markup and copy (`82450ad1:src/components/map/*`). The scan
 * components' tests live in `scanning/restored-markup.test.tsx`, beside the
 * files they test, so the place pages and the menu scanner can each be
 * converted without touching the other's test.
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
const { CategoryMultiSelect } = await import("./places/CategoryMultiSelect");
const { DiscoveryDashboard } = await import("./discovery/DiscoveryDashboard");
const { menuItemFrom } = await import("./adapter");
const { LOADING } = await import("../../test-support/markup");

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
    // It renders inside CreatePlaceForm's <form>: a button without
    // type="button" would submit (and create) the place on either choice.
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    assert.equal(buttons.length, 2);
    for (const button of buttons) assert.match(button, /type="button"/);
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
    // Joy's FormControl wired label to input itself; ui/field does not, and
    // the e2e finds every field by its label. Each label must name a control.
    const fors = Array.from(html.matchAll(/<label[^>]*\sfor="([^"]+)"/g));
    assert.equal(fors.length, 10);
    for (const [, id] of fors) {
      assert.match(
        html,
        new RegExp(`<(input|textarea|button)[^>]*\\sid="${id}"`),
        id,
      );
    }
    // The only submit in the form is Add Place.
    assert.deepEqual(html.match(/type="submit"/g), ['type="submit"']);
  });

  test("Categories: a combobox the label names, described by the picks", () => {
    const options = [
      { label: "Wine Bar", value: "wine_bar", tier: "Venues" },
      { label: "Bottle Shop", value: "bottle_shop", tier: "Retail" },
    ];
    const empty = render(
      <CategoryMultiSelect
        id="cats"
        options={options}
        value={[]}
        onChange={() => {}}
        placeholder="Select categories..."
      />,
    );
    assert.match(empty, /<button[^>]*role="combobox"[^>]*>/);
    assert.match(empty, /type="button"/);
    assert.doesNotMatch(empty, /aria-describedby/);
    const picked = render(
      <CategoryMultiSelect
        id="cats"
        options={options}
        value={options}
        onChange={() => {}}
        describedBy="cats-error"
      />,
    );
    assert.match(picked, /aria-describedby="cats-value cats-error"/);
    assert.match(picked, /id="cats-value"[^>]*>.*Wine Bar.*Bottle Shop/);
  });

  test("N22: 'Add it here' arrives with the searched name already in the form", () => {
    const html = render(
      <CreatePlaceForm
        latitude={43.07}
        longitude={-89.4}
        initialName="Copper Lantern"
      />,
    );
    assert.match(html, /value="Copper Lantern"/);
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

  test("N22: Google details on their way are a skeleton, then a calm 'Details pending' — never a spinner with a sentence", () => {
    const props = {
      place: {
        id: "p1",
        name: "Rusty Barrel",
        primary_category: "bar",
        categories: [],
        street_address: null,
        locality: null,
        rating: null,
      },
      userInteraction: null,
      menuItems: [],
      loadingDetails: false,
      hasMenuItems: false,
      userId: "",
      variant: "desktop" as const,
      onClose: () => {},
      refetch: () => {},
      setInteraction: async () => null,
      enrichment: null,
      googlePhotos: [],
    };
    const loading = render(<PlaceDetailsContent {...props} isEnriching />);
    assert.match(loading, /aria-label="Loading details"/);
    assert.doesNotMatch(loading, /Loading additional details/);
    assert.doesNotMatch(loading, /Details pending/);

    const pending = render(<PlaceDetailsContent {...props} detailsPending />);
    assert.match(pending, /Details pending/);
    assert.doesNotMatch(pending, /aria-label="Loading details"/);

    const idle = render(<PlaceDetailsContent {...props} />);
    assert.doesNotMatch(idle, /Details pending|Loading details/);
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

describe("discoveries (restored)", () => {
  test("DiscoveryDashboard starts on the old spinner", () => {
    assert.match(render(<DiscoveryDashboard />), LOADING);
  });
});
