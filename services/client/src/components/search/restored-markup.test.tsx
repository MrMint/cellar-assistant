/**
 * Render tests for the restored `/search` pieces, asserting the **old** markup
 * and copy (`82450ad1:src/components/search/*`) — the Scan and Photo buttons
 * included, image search (G32) being back — and the one deliberate
 * difference, absolute card links.
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
const { NearbyPlaces } = await import("./NearbyPlaces");
const { SearchNearbyPlacesQuery, NEARBY_PLACES_LIMIT } = await import(
  "./queries"
);
const { Greeting, greetingText } = await import("./Greeting");
const { SearchResultGrid } = await import("./SearchResultGrid");

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
  test("an empty box offers the old Scan and Photo buttons, in that order", () => {
    const html = render(<ClientSearchInterface />);
    assert.match(html, /<input/);
    assert.match(text(html), /Scan\s+Photo/);
    // No submit button: the old box navigated on a debounce.
    assert.doesNotMatch(text(html), /\bSearch\b/);
  });

  test("W-12: an empty sheet opens with the box focused, a query's does not", () => {
    assert.match(render(<ClientSearchInterface />), /<input[^>]*autofocus/i);
    assert.doesNotMatch(
      render(<ClientSearchInterface urlQuery="barolo" />),
      /<input[^>]*autofocus/i,
    );
  });

  test("a query swaps both buttons for the round scan and camera icons and adds clear", () => {
    const html = render(<ClientSearchInterface urlQuery="barolo" />);
    assert.match(html, /value="barolo"/);
    assert.match(html, /aria-label="Scan barcode"/);
    assert.match(html, /aria-label="Search by photo"/);
    assert.doesNotMatch(text(html), /Scan\b(?! barcode)/);
    assert.doesNotMatch(text(html), /\bPhoto\b/);
  });
});

describe("Greeting (X01: the viewer's clock, never the server's)", () => {
  test("the server render carries no greeting — the browser supplies it", () => {
    const html = text(render(<Greeting displayName="Jared Prather" />));
    assert.doesNotMatch(html, /Good (morning|afternoon|evening)/);
  });
  test("time of day from the hour, with the first name only", () => {
    const at = (hour: number) => new Date(2026, 9, 5, hour, 30);
    assert.equal(greetingText(at(0), "Jared Prather"), "Good morning, Jared");
    assert.equal(greetingText(at(11), "Jared"), "Good morning, Jared");
    assert.equal(greetingText(at(12), "Jared"), "Good afternoon, Jared");
    assert.equal(greetingText(at(16), "Jared"), "Good afternoon, Jared");
    assert.equal(greetingText(at(17), "Jared"), "Good evening, Jared");
    assert.equal(greetingText(at(23), "Jared"), "Good evening, Jared");
  });
  test("no name, no comma; a blank name is no name", () => {
    const noon = new Date(2026, 9, 5, 12);
    assert.equal(greetingText(noon), "Good afternoon");
    assert.equal(greetingText(noon, "   "), "Good afternoon");
  });
});

describe("SearchResultGrid (restored)", () => {
  test("the old empty message", () => {
    assert.match(text(render(<SearchResultGrid items={[]} />)), /No results/);
  });
});

/** No server-rendered entrance may leave content invisible. */
const assertVisibleAtRest = (html: string) => {
  assert.doesNotMatch(html, /opacity:\s*0[;"]/);
  assert.doesNotMatch(html, /translateY\(10px\)|translateX\(-12px\)/);
};

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
