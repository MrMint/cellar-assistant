/**
 * Render tests for the restored brand components, asserting the **old**
 * markup (`82450ad1:src/components/brand/*`), server-rendered the way the
 * first paint is. `next/image` is stubbed: bun imports a `.png` as a path.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/image", () => ({
  default: (props: { alt: string }) => (
    <span data-next-image="art" data-alt={props.alt} />
  ),
}));

const { BrandCard } = await import("./BrandCard");
const { BrandDetails } = await import("./BrandDetails");

const render = (node: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(node).replace(/<style[^>]*>[^<]*<\/style>/g, "");

const card = {
  id: "b1",
  name: "Vietti",
  description: "Barolo producer",
  logo_url: null,
  brand_type: "tea_house",
  item_count: 7,
};

describe("BrandCard (restored)", () => {
  test("placeholder art, type chip, linked title, description, item count", () => {
    const html = render(<BrandCard brand={card} href="/brands/b1" />);
    assert.match(html, /^<div class="MuiCard-root/);
    assert.match(html, /data-alt="Vietti placeholder"/);
    assert.match(html, /MuiChip-root[\s\S]*Tea House/);
    assert.match(html, /href="\/brands\/b1"/);
    assert.match(html, /MuiTypography-title-md[^>]*>Vietti</);
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

describe("BrandDetails (restored)", () => {
  const brand = {
    id: "b1",
    name: "Vietti",
    description: "Barolo producer",
    logo_url: null,
    brand_type: "winery",
    created_at: "2019-06-01T00:00:00Z",
    parent_brand: { id: "b0", name: "Krause", brand_type: "manufacturer" },
    child_brands: [{ id: "b2", name: "Vietti Moscato", brand_type: "winery" }],
    item_brands: [
      {
        id: "l1",
        is_primary: true,
        wine: { id: "w1", name: "Barolo", vintage: "2016" },
      },
      { id: "l2", is_primary: false, sake: { id: "s1", name: "Dassai" } },
    ],
    place_brands: [
      {
        id: "pb1",
        relationship_type: "owned_by",
        place: { id: "p1", name: "Cantina" },
      },
    ],
  };

  test("header: h1 name, Since year, type chip, parent link, child chips", () => {
    const html = render(<BrandDetails brand={brand} />);
    assert.match(html, /<h1[^>]*>Vietti<\/h1>/);
    assert.match(html, /Since 2019/);
    assert.match(html, />Winery</);
    assert.match(html, /Part of:/);
    assert.match(html, /href="\/brands\/b0"/);
    assert.match(html, /Owns brands:/);
    assert.match(html, /href="\/brands\/b2"/);
  });

  test("items grouped by type with the Primary chip; places with relationship", () => {
    const html = render(<BrandDetails brand={brand} itemTotal={30} />);
    assert.match(html, /<h2[^>]*>Associated Items \(30\)<\/h2>/);
    assert.match(html, />wines \(1\)</);
    assert.match(html, />sakes \(1\)</);
    assert.match(html, /href="\/wines\/w1"[\s\S]*2016 Barolo/);
    assert.match(html, /href="\/sakes\/s1"/);
    assert.equal([...html.matchAll(/>Primary</g)].length, 1);
    assert.match(html, /<h2[^>]*>Associated Places \(1\)<\/h2>/);
    assert.match(html, /href="\/places\/p1"/);
    assert.match(html, />Owned By</);
  });

  test("the old empty copy", () => {
    const html = render(
      <BrandDetails
        brand={{
          ...brand,
          item_brands: [],
          place_brands: [],
          parent_brand: null,
          child_brands: [],
        }}
      />,
    );
    assert.match(html, /No items associated with this brand yet\./);
    assert.match(html, /No places associated with this brand yet\./);
    assert.doesNotMatch(html, /Part of:/);
  });
});

describe("BrandDetailsClient: no silent caps (gaps #6, #7)", async () => {
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
    name: "Vietti",
    brandType: "winery",
    createdAt: "2019-06-01T00:00:00Z",
    parentBrand: null,
  };
  const page = <T,>(rows: T[], hasNextPage: boolean, totalCount: number) => ({
    rows,
    endCursor: hasNextPage ? "next" : null,
    hasNextPage,
    totalCount,
  });
  // Thirteen wines and one sake: past the old 12-link first page, the sake
  // would have been missing from the groups until "Show more".
  const links = [
    ...Array.from({ length: 13 }, (_, index) => ({
      id: `l${index}`,
      isPrimary: false,
      item: { id: `w${index}`, type: "WINE" as const, name: `Wine ${index}` },
    })),
    {
      id: "l-sake",
      isPrimary: false,
      item: { id: "s1", type: "SAKE" as const, name: "Dassai" },
    },
  ];
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

  test("groups are built from every item link the server read", () => {
    const html = renderClient({
      brand,
      initialItems: page(links, false, 14),
      initialChildren: page(children, false, 24),
      initialPlaces: page(places, false, 20),
    });
    assert.match(html, />wines \(13\)</);
    assert.match(html, />sakes \(1\)</);
    assert.match(html, /<h2[^>]*>Associated Items \(14\)<\/h2>/);
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
    assert.match(html, /<h2[^>]*>Associated Places \(45\)<\/h2>/);
    // One under the "Owns brands:" chips, one under the place list.
    const owns = html.indexOf("Owns brands:");
    const placesHeading = html.indexOf("Associated Places");
    const first = html.indexOf(">Show more<");
    const second = html.indexOf(">Show more<", first + 1);
    assert.ok(owns < first && first < html.indexOf("Associated Items"));
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
  });
});
