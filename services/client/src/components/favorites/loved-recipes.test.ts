import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  lovedHref,
  lovedKindFromParam,
  lovedRecipesPage,
} from "./loved-recipes";

describe("Loved's halves (X18)", () => {
  test("?kind=recipes is recipes; anything else, or nothing, is drinks", () => {
    assert.equal(lovedKindFromParam("recipes"), "recipes");
    assert.equal(lovedKindFromParam(["recipes", "x"]), "recipes");
    assert.equal(lovedKindFromParam(undefined), "drinks");
    assert.equal(lovedKindFromParam("items"), "drinks");
  });

  test("drinks keep the bare path every old link used", () => {
    assert.equal(lovedHref("drinks"), "/favorites");
    assert.equal(lovedHref("recipes"), "/favorites?kind=recipes");
  });
});

describe("lovedRecipesPage", () => {
  test("rows link to the recipe and say what kind it is", () => {
    const page = lovedRecipesPage({
      __typename: "RecipeConnection",
      totalCount: 2,
      pageInfo: { hasNextPage: false, endCursor: null },
      edges: [
        {
          cursor: "o:0",
          node: {
            __typename: "Recipe",
            id: "r1",
            name: "Negroni",
            type: "cocktail",
            imageUrl: null,
            isLoved: true,
          },
        },
        {
          cursor: "o:1",
          node: {
            __typename: "Recipe",
            id: "r2",
            name: "Risotto",
            type: "food",
            imageUrl: "https://example.test/r.jpg",
            isLoved: true,
          },
        },
      ],
    } as unknown as Parameters<typeof lovedRecipesPage>[0]);
    assert.ok(page.ok);
    if (!page.ok) return;
    assert.equal(page.data.totalCount, 2);
    assert.deepEqual(
      page.data.rows.map((row) => [row.name, row.href, row.description]),
      [
        ["Negroni", "/recipes/r1", "Cocktail"],
        ["Risotto", "/recipes/r2", "Recipe"],
      ],
    );
  });

  test("a refusal is a failure, not an empty list", () => {
    const refused = lovedRecipesPage({
      __typename: "ForbiddenError",
      code: "FORBIDDEN",
      message: "sign in",
    } as unknown as Parameters<typeof lovedRecipesPage>[0]);
    assert.equal(refused.ok, false);
  });
});
