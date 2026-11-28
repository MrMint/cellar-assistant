/**
 * Render tests for the restored brand components, asserting the **old**
 * markup (`82450ad1:src/components/brand/*`), server-rendered the way the
 * first paint is. A brand with no logo shows a monogram plate, not the old
 * `cellar1.png` (H-3, L22); `next/image` stays stubbed so any raster shows.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { stripStyleBlocks, textOf } from "@/test-support/markup";

mock.module("next/image", () => ({
  default: (props: { alt: string }) => (
    <span data-next-image="art" data-alt={props.alt} />
  ),
}));

const { BrandCard } = await import("./BrandCard");
const { BrandDetails } = await import("./BrandDetails");

const render = (node: Parameters<typeof renderToStaticMarkup>[0]) =>
  stripStyleBlocks(renderToStaticMarkup(node));

const card = {
  id: "b1",
  name: "Vietti",
  description: "Barolo producer",
  logo_url: null,
  brand_type: "tea_house",
  item_count: 7,
};

describe("BrandCard (restored)", () => {
  test("monogram plate, type chip, linked title, description, item count", () => {
    const html = render(<BrandCard brand={card} href="/brands/b1" />);
    assert.match(
      html,
      /^(?:<[^>]+>)+<span data-slot="brand-plate"/,
      "plate first",
    );
    assert.match(html, /data-slot="brand-plate"[^>]*>(?:<[^>]+>)*V</);
    assert.doesNotMatch(html, /data-next-image/);
    assert.match(html, /data-slot="brand-plate"[\s\S]*>Tea House</);
    assert.match(html, /href="\/brands\/b1"/);
    assert.match(html, /href="\/brands\/b1"[^>]*>(?:<[^>]+>)*Vietti</);
    assert.match(html, /Barolo producer/);
    assert.match(html, />7 items</);
    assert.doesNotMatch(html, /places/);
  });

  test("a logo is a plain img, not /_next/image", () => {
    const html = render(
      <BrandCard
        brand={{ ...card, logo_url: "https://logos.test/v.png" }}
        href="/brands/b1"
      />,
    );
    assert.match(html, /<img[^>]*src="https:\/\/logos.test\/v.png"/);
    assert.match(html, /alt="Vietti logo"/);
  });

  test('X23: one item is "1 item"; no type, no chip', () => {
    const html = render(
      <BrandCard
        brand={{ ...card, item_count: 1, brand_type: null }}
        href="/brands/b1"
      />,
    );
    assert.match(html, />1 item</);
    assert.doesNotMatch(html, /data-slot="brand-type-chip"/);
  });

  test("no count when the API gave none", () => {
    const html = render(
      <BrandCard
        brand={{ ...card, item_count: undefined }}
        href="/brands/b1"
      />,
    );
    assert.doesNotMatch(html, /items</);
  });
});

describe("BrandDetails: About and Places under the shelf (C1)", () => {
  const brand = {
    id: "b1",
    name: "Vietti",
    description: "Barolo producer",
    logo_url: null,
    brand_type: "winery",
    parent_brand: { id: "b0", name: "Krause", brand_type: "manufacturer" },
    child_brands: [{ id: "b2", name: "Vietti Moscato", brand_type: "winery" }],
    item_brands: [],
    place_brands: [
      {
        id: "pb1",
        relationship_type: "owned_by",
        place: { id: "p1", name: "Cantina" },
      },
    ],
  };

  test("About: plate, type chip, parent link, child chips; no Since (X23)", () => {
    const html = render(<BrandDetails brand={brand} />);
    assert.match(html, /data-slot="brand-plate"[^>]*>(?:<[^>]+>)*V</);
    assert.doesNotMatch(html, /data-next-image/);
    assert.match(html, /<h2[^>]*>About<\/h2>/);
    assert.doesNotMatch(html, /Since/);
    assert.match(html, />Winery</);
    assert.match(html, /Part of/);
    assert.match(html, /href="\/brands\/b0"/);
    assert.match(html, /Makers it owns/);
    assert.match(html, /href="\/brands\/b2"/);
  });

  test("places with their relationship and count", () => {
    const html = render(<BrandDetails brand={brand} placeTotal={3} />);
    assert.match(html, /Places<span[^>]*>3<\/span><\/h2>/);
    assert.match(html, /href="\/places\/p1"/);
    assert.match(html, />Owned By</);
  });

  test("nothing to say: neither section is drawn", () => {
    const html = render(
      <BrandDetails
        brand={{
          ...brand,
          description: null,
          brand_type: null,
          place_brands: [],
          parent_brand: null,
          child_brands: [],
        }}
      />,
    );
    assert.doesNotMatch(html, /About|Places/);
  });
});

describe("BrandDetailsClient: the shelf and no silent caps (gaps #6, #7)", async () => {
  const { Client, Provider } = await import("urql");
  const { BrandDetailsClient } = await import("./BrandDetailsClient");
  const client = new Client({
    url: "http://test.invalid/graphql",
    exchanges: [],
  });
  const renderClient = (props: Parameters<typeof BrandDetailsClient>[0]) =>
    render(
      <Provider value={client}>{<BrandDetailsClient {...props} />}</Provider>,
    );

  const brand = {
    id: "b1",
    name: "Demo Brewing",
    brandType: "brewery",
    createdAt: "2019-06-01T00:00:00Z",
    parentBrand: null,
  };
  const page = <T,>(rows: T[], hasNextPage: boolean, totalCount: number) => ({
    rows,
    endCursor: hasNextPage ? "next" : null,
    hasNextPage,
    totalCount,
  });
  const home = { id: "c1", name: "Home" };
  // Fourteen beers, three of them in Home.
  const links = Array.from({ length: 14 }, (_, index) => ({
    id: `l${index}`,
    isPrimary: false,
    item: { id: `b${index}`, type: "BEER" as const, name: `Ale ${index}` },
    tile: {
      key: `l${index}`,
      itemId: `b${index}`,
      type: "BEER" as const,
      name: `Ale ${index}`,
      maker: "Demo Brewing",
      style: "Pale ale",
      photoUrl: null,
      plate: null,
      rating: null,
      favorite: false,
      href: `/beers/b${index}`,
      cellars: index < 3 ? [home] : [],
    },
  }));
  const children = Array.from({ length: 24 }, (_, index) => ({
    id: `c${index}`,
    name: `Child ${index}`,
    brandType: "winery",
  }));
  const places = Array.from({ length: 20 }, (_, index) => ({
    id: `pb${index}`,
    relationshipType: "serves",
    place: { id: `p${index}`, name: `Place ${index}` },
  }));

  test("the shelf: the name, kind and count, All · In Home, a tile per drink", () => {
    const html = renderClient({
      brand,
      initialItems: page(links, false, 14),
      initialChildren: page(children, false, 24),
      initialPlaces: page(places, false, 20),
    });
    const text = textOf(html);
    assert.match(html, /<h1[^>]*>Demo Brewing<\/h1>/);
    assert.match(text, /Beer · 14 drinks/);
    assert.match(html, /aria-label="Show"/);
    assert.match(text, /In Home/);
    assert.equal([...html.matchAll(/data-slot="brand-tile"/g)].length, 14);
    assert.equal([...html.matchAll(/>In Home</g)].length, 4); // segment + 3 badges
    assert.doesNotMatch(html, />Show more</);
  });

  test("sub-brands and places past the first page offer Show more, under each list", () => {
    const html = renderClient({
      brand,
      initialItems: page(links, false, 14),
      initialChildren: page(children, true, 30),
      initialPlaces: page(places, true, 45),
    });
    assert.equal([...html.matchAll(/>Show more</g)].length, 2);
    const owns = html.indexOf("Makers it owns");
    const placesHeading = html.indexOf(">Places<");
    const first = html.indexOf(">Show more<");
    const second = html.indexOf(">Show more<", first + 1);
    assert.ok(owns < first && first < placesHeading);
    assert.ok(placesHeading < second);
  });

  test("an item read the server could not finish still offers Show more", () => {
    const html = renderClient({
      brand,
      initialItems: page(links, true, 40),
      initialChildren: page(children, false, 24),
      initialPlaces: page(places, false, 20),
    });
    assert.equal([...html.matchAll(/>Show more</g)].length, 1);
    assert.match(textOf(html), /40 drinks/);
  });
});
