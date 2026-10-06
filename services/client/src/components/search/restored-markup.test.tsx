/**
 * Render tests for the restored `/search` pieces, asserting the **old** markup
 * and copy (`82450ad1:src/components/search/*`), and the two deliberate
 * differences: no Photo button (G32) and absolute card links.
 *
 * The discovery section (G31, restored): Recent Activity and Nearby Places
 * with the old headings, lines and empty states, and — the robustness fix —
 * nothing on the landing view server-renders hidden (`opacity:0`).
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createRequest, ssrExchange } from "@urql/core";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, Provider } from "urql";

mock.module("next/image", () => ({
  default: (props: { alt: string }) => (
    <span data-next-image="art" data-alt={props.alt} />
  ),
}));
mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/search",
  useSearchParams: () => new URLSearchParams(),
}));

type Geo = {
  location: { latitude: number; longitude: number } | null;
  loading: boolean;
  error: string | null;
};
let geo: Geo = { location: null, loading: true, error: null };
mock.module("@/components/map/hooks/useGeolocation", () => ({
  useGeolocation: () => geo,
}));

const { ClientSearchInterface } = await import("./ClientSearchInterface");
const { RecentActivity } = await import("./RecentActivity");
const { NearbyPlaces } = await import("./NearbyPlaces");
const { SearchNearbyPlacesQuery, NEARBY_PLACES_LIMIT } = await import(
  "./queries"
);
const { Greeting } = await import("./Greeting");
const { SearchResultGrid } = await import("./SearchResultGrid");
const { FadeIn, StaggerIn, StaggerItem } = await import("./AnimateIn");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const render = (node: ReactNode) =>
  renderToStaticMarkup(<Provider value={client}>{node}</Provider>).replace(
    /<style[^>]*>[^<]*<\/style>/g,
    "",
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ");

describe("ClientSearchInterface (restored)", () => {
  test("an empty box offers Scan and nothing else — no Photo (G32)", () => {
    const html = render(<ClientSearchInterface />);
    assert.match(html, /<input/);
    assert.match(text(html), /Scan/);
    assert.doesNotMatch(text(html), /Photo/);
    // No submit button: the old box navigated on a debounce.
    assert.doesNotMatch(text(html), /\bSearch\b/);
  });

  test("a query swaps the Scan button for the round scan icon and adds clear", () => {
    const html = render(<ClientSearchInterface initialQuery="barolo" />);
    assert.match(html, /value="barolo"/);
    assert.match(html, /aria-label="Scan barcode"/);
    assert.doesNotMatch(text(html), /Scan\b(?! barcode)/);
  });
});

describe("Greeting (verbatim)", () => {
  test("time-of-day greeting with the first name", () => {
    const html = text(render(<Greeting displayName="Jared Prather" />));
    assert.match(html, /Good (morning|afternoon|evening), Jared/);
    assert.doesNotMatch(html, /Prather/);
  });
  test("no name, no comma", () => {
    assert.match(
      text(render(<Greeting />)),
      /Good (morning|afternoon|evening)\s*$/,
    );
  });
});

describe("AnimateIn (verbatim)", () => {
  test("renders its children", () => {
    const html = render(
      <FadeIn>
        <StaggerIn>
          <StaggerItem>chip</StaggerItem>
        </StaggerIn>
      </FadeIn>,
    );
    assert.match(html, /chip/);
  });
});

describe("SearchResultGrid (restored)", () => {
  test("the old empty message", () => {
    assert.match(text(render(<SearchResultGrid items={[]} />)), /No results/);
  });
});

/** No server-rendered entrance may leave content invisible (see AnimateIn). */
const assertVisibleAtRest = (html: string) => {
  assert.doesNotMatch(html, /opacity:\s*0[;"]/);
  assert.doesNotMatch(html, /translateY\(10px\)|translateX\(-12px\)/);
};

describe("AnimateIn — visible without JavaScript", () => {
  test("no hidden inline state; the entrance is a CSS animation", () => {
    const html = render(
      <FadeIn>
        <StaggerIn>
          <StaggerItem>chip</StaggerItem>
          <StaggerItem>chip 2</StaggerItem>
        </StaggerIn>
      </FadeIn>,
    );
    assertVisibleAtRest(html);
    assert.equal(html.match(/data-stagger-item/g)?.length, 2);
  });
});

const NOW = "2026-10-05T12:00:00.000Z";
const person = {
  userId: "u2",
  userName: "Fran Friend",
  userAvatar: null,
};

const FEED = [
  {
    kind: "added" as const,
    id: "added-b1",
    timestamp: NOW,
    itemName: "2016 Barolo",
    itemType: "WINE",
    itemImageUrl: "https://files.test/w1?sig",
    itemPlaceholder: null,
    itemHref: "/wines/w1",
    ...person,
    cellarName: "Home",
  },
  {
    kind: "reviewed" as const,
    id: "review-r1",
    timestamp: NOW,
    itemName: "Hazy IPA",
    itemType: "BEER",
    itemHref: "/beers/b1",
    ...person,
    score: 4.5,
    reviewText: null,
  },
  {
    kind: "tier-listed" as const,
    id: "tier-t1",
    timestamp: NOW,
    itemName: "Corner Bar",
    itemType: "PLACE",
    itemHref: "/tier-lists/l1?item=t1",
    ...person,
    tierListName: "Best bars",
    rank: 2,
  },
];

describe("RecentActivity (restored, G31)", () => {
  test("the old heading, filters and one card per entry, linked as before", () => {
    const html = render(<RecentActivity feed={FEED} selectedKinds={[]} />);
    const words = text(html);
    assert.match(words, /Recent Activity/);
    for (const label of ["Added", "Reviews", "Tier Lists"]) {
      assert.match(html, new RegExp(`aria-label="${label}"`));
    }
    assert.match(html, /aria-label="Activity type filters"/);
    assert.match(words, /2016 Barolo/);
    assert.match(words, /Added to Home/);
    assert.match(words, /Rated 4\.5/);
    assert.match(words, /#2 in Best bars/);
    assert.match(html, /href="\/wines\/w1"/);
    assert.match(html, /href="\/tier-lists\/l1\?item=t1"/);
    // The presigned thumbnail through next/image; the others fall back.
    assert.match(html, /data-next-image="art" data-alt="2016 Barolo"/);
    assertVisibleAtRest(html);
  });

  test("no activity and no filter renders nothing, as before", () => {
    assert.equal(render(<RecentActivity feed={[]} selectedKinds={[]} />), "");
  });

  test("a filter with nothing in it says so", () => {
    const words = text(
      render(<RecentActivity feed={[]} selectedKinds={["reviewed"]} />),
    );
    assert.match(words, /Recent Activity/);
    assert.match(words, /No recent activity for the selected filters/);
  });
});

const PLACE = {
  id: "p1",
  name: "Corner Bar",
  primaryCategory: "wine_bar",
  coordinates: [-97.7395, 30.27] as [number, number],
  distanceMeters: 48,
  photoUrl: null,
  rating: 4.6,
  priceLevel: 2,
  openingHours: { open_now: true },
};

describe("NearbyPlaces (restored, G31)", () => {
  test("server data renders the old strip before the browser has a position", () => {
    geo = { location: null, loading: true, error: null };
    const html = render(
      <NearbyPlaces
        initialPlaces={[PLACE]}
        cachedLocation={{ latitude: 30.27, longitude: -97.74 }}
      />,
    );
    const words = text(html);
    assert.match(words, /Nearby Places/);
    assert.match(words, /Corner Bar/);
    assert.match(words, /Wine Bar/);
    assert.match(words, /4\.6/);
    assert.match(words, /\$\$/);
    assert.match(words, /\d+m/);
    assert.match(words, /Open/);
    assert.match(words, /View all on map/);
    assert.match(html, /href="\/map\?placeId=p1"/);
    for (const label of ["Wine", "Beer", "Spirits", "Coffee", "Sake"]) {
      assert.match(html, new RegExp(`aria-label="${label}"`));
    }
    assertVisibleAtRest(html);
  });

  test("no cookie data and no position renders nothing, as before", () => {
    geo = { location: null, loading: false, error: "denied" };
    assert.equal(render(<NearbyPlaces cachedLocation={null} />), "");
  });

  test("a position with nothing near it says so", () => {
    geo = {
      location: { latitude: 30.27, longitude: -97.74 },
      loading: false,
      error: null,
    };
    const variables = {
      location: { lat: 30.27, lng: -97.74 },
      categories: null,
      limit: NEARBY_PLACES_LIMIT,
      first: NEARBY_PLACES_LIMIT,
    };
    const { key } = createRequest(SearchNearbyPlacesQuery, variables);
    const answered = new Client({
      url: "http://test.invalid/graphql",
      exchanges: [
        ssrExchange({
          isClient: true,
          initialState: {
            [key]: {
              data: JSON.stringify({
                me: {
                  __typename: "Viewer",
                  id: "u1",
                  nearbyPlaces: {
                    __typename: "NearbyPlaceConnection",
                    edges: [],
                  },
                },
              }),
            },
          },
        }),
      ],
    });
    const words = text(
      renderToStaticMarkup(
        <Provider value={answered}>
          <NearbyPlaces cachedLocation={null} />
        </Provider>,
      ),
    );
    assert.match(words, /Nearby Places/);
    assert.match(words, /No nearby places found/);
    assert.doesNotMatch(words, /for the selected types/);
  });
});
