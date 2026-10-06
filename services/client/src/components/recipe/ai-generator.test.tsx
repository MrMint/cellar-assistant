/**
 * The ai-generator's success line and read-back (parity gaps #11, #12).
 *
 * `useQuery` is swapped for a stub so each test can hand `GeneratedRecipe`
 * the state a real read-back would end in — a typed error, a transport
 * error, or still loading — without a server.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

type QueryState = {
  data?: unknown;
  fetching: boolean;
  error?: { message: string; graphQLErrors?: { message: string }[] };
};
let state: QueryState = { fetching: true };

const realUrql = { ...(await import("urql")) };
mock.module("urql", () => ({
  ...realUrql,
  useQuery: () => [state, () => {}],
}));
mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/recipes/ai-generator",
  useSearchParams: () => new URLSearchParams(),
}));

const { GeneratedRecipe } = await import("./AIRecipeGenerator");
const { recipeCreatedLine } = await import("./adapter");

const render = () =>
  renderToStaticMarkup(<GeneratedRecipe recipeId="r1" />).replace(
    /<style[^>]*>[^<]*<\/style>/g,
    "",
  );

describe("the success line (gap #11)", () => {
  test("restores 'with M ingredients' (82450ad1 RecipePhotoProcessor.tsx:185)", () => {
    assert.equal(
      recipeCreatedLine(4),
      "Successfully created 1 recipe with 4 ingredients",
    );
  });

  test("before the read-back answers, no count rather than a wrong one", () => {
    assert.equal(recipeCreatedLine(null), "Successfully created 1 recipe");
  });
});

describe("GeneratedRecipe read-back (gap #12)", () => {
  test("a typed error says the recipe could not be loaded, with its message", () => {
    state = {
      fetching: false,
      data: {
        me: { id: "me" },
        recipe: {
          __typename: "ForbiddenError",
          code: "FORBIDDEN",
          reason: null,
          message: "You may not see this recipe.",
        },
      },
    };
    const html = render();
    assert.match(html, /The new recipe could not be loaded/);
    assert.match(html, /You may not see this recipe\./);
  });

  test("a failed request says so too, instead of rendering nothing", () => {
    state = {
      fetching: false,
      error: {
        message: "[Network] Failed to fetch",
        graphQLErrors: [],
      },
    };
    const html = render();
    assert.match(html, /The new recipe could not be loaded/);
    assert.match(html, /Failed to fetch/);
  });

  test("still loading: nothing yet, and no error", () => {
    state = { fetching: true };
    assert.equal(render(), "");
  });
});
