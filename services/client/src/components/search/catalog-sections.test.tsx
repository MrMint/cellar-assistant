/**
 * D1: Recipes and Brands are reached from search. The rows each section
 * shows, and the section markup: three rows, See all into the full page.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/search",
}));

const { brandRows, recipeRows, seeAllHref } = await import(
  "./catalog-sections"
);
const { CatalogSection } = await import("./CatalogSections");
const { Recipe } = await import("@/components/app/icons");
const { textOf } = await import("@/test-support/markup");

describe("recipeRows / brandRows", () => {
  test("a recipe group: its kind, spirit and versions, linked to the group", () => {
    const rows = recipeRows({
      recipeGroups: {
        __typename: "RecipeGroupConnection",
        totalCount: 1,
        edges: [
          {
            node: {
              id: "g1",
              name: "Negroni",
              category: "cocktail",
              baseSpirit: "gin",
              recipeCount: 3,
            },
          },
        ],
      },
    } as never);
    assert.deepEqual(rows, [
      {
        id: "g1",
        title: "Negroni",
        description: "Cocktail · Gin · 3 versions",
        href: "/recipes/groups/g1",
      },
    ]);
  });

  test("a brand: its type and item count, linked to the brand; zero counts hidden", () => {
    const rows = brandRows({
      brandSearch: {
        __typename: "BrandSearchConnection",
        totalCount: 2,
        edges: [
          {
            node: {
              id: "b1",
              brand: {
                id: "b1",
                name: "Ridge Vineyards",
                brandType: "winery",
                itemCount: 1,
              },
            },
          },
          {
            node: {
              id: "b2",
              brand: { id: "b2", name: "New", brandType: null, itemCount: 0 },
            },
          },
        ],
      },
    } as never);
    assert.deepEqual(
      rows.map((row) => [row.title, row.description, row.href]),
      [
        ["Ridge Vineyards", "Winery · 1 item", "/brands/b1"],
        ["New", undefined, "/brands/b2"],
      ],
    );
  });

  test("a failed read is no rows", () => {
    assert.deepEqual(
      recipeRows({
        recipeGroups: { __typename: "InternalError", message: "x" },
      } as never),
      [],
    );
    assert.deepEqual(brandRows(undefined), []);
  });

  test("See all keeps the term", () => {
    assert.equal(
      seeAllHref("recipes", "gin & tonic"),
      "/recipes?q=gin%20%26%20tonic",
    );
    assert.equal(seeAllHref("brands", "ridge"), "/brands?q=ridge");
  });
});

describe("CatalogSection", () => {
  const rows = [
    {
      id: "g1",
      title: "Negroni",
      description: "Cocktail",
      href: "/recipes/groups/g1",
    },
  ];

  test("labelled rows, and See all when there are more than shown", () => {
    const html = renderToStaticMarkup(
      <CatalogSection
        label="Recipes"
        icon={Recipe}
        rows={rows}
        total={7}
        seeAll="/recipes?q=negroni"
      />,
    );
    assert.match(html, /<h2\b[^>]*>Recipes<\/h2>/);
    assert.match(html, /href="\/recipes\/groups\/g1"/);
    assert.match(html, /href="\/recipes\?q=negroni"/);
    assert.match(textOf(html), /See all\s+recipes/);
  });

  test("all of them shown: no See all; none: no section", () => {
    const all = renderToStaticMarkup(
      <CatalogSection
        label="Recipes"
        icon={Recipe}
        rows={rows}
        total={1}
        seeAll="/x"
      />,
    );
    assert.doesNotMatch(all, /See all/);
    const none = renderToStaticMarkup(
      <CatalogSection
        label="Recipes"
        icon={Recipe}
        rows={[]}
        total={0}
        seeAll="/x"
      />,
    );
    assert.equal(none, "");
  });
});
