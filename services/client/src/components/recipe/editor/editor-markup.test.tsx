/**
 * X15's screens, rendered: the draft editor's match chips and privacy
 * control, the Bar page's drafts and recipes, and the words a failed read
 * is told in. (The Loved page's recipes are X18's half of Loved:
 * `favorites/loved-recipes.test.ts`.)
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Client, Provider } from "urql";

mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/recipes/r1/edit",
  useSearchParams: () => new URLSearchParams(),
}));

const { RecipeEditor } = await import("./RecipeEditor");
const { MyRecipes } = await import("./MyRecipes");
const { readFailureCopy } = await import("./RecipeComposer");
const { blankForm, formFromRecipe } = await import("./recipe-draft");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
/** React's text-boundary comments dropped, so assertions read as text. */
const render = (node: ReactNode) =>
  renderToStaticMarkup(<Provider value={client}>{node}</Provider>).replace(
    /<!-- -->/g,
    "",
  );

const draft = formFromRecipe({
  name: "Negroni",
  type: "cocktail",
  description: null,
  privacy: "PRIVATE",
  isDraft: true,
  ingredients: [
    {
      id: "row-gin",
      quantity: 1,
      unit: "oz",
      quantityText: null,
      amount: "1 oz",
      isOptional: false,
      substitutionNotes: null,
      role: "base",
      kind: "gin",
      kindLabel: "Gin",
      brandMentioned: null,
      item: { id: "i1", name: "Casa Noble Tequila", type: "SPIRIT" },
      genericItem: null,
    },
    {
      id: "row-campari",
      quantity: 1,
      unit: "oz",
      quantityText: null,
      amount: "1 oz",
      isOptional: false,
      substitutionNotes: null,
      role: null,
      kind: null,
      kindLabel: null,
      brandMentioned: null,
      item: { id: "i2", name: "Campari", type: "SPIRIT" },
      genericItem: null,
    },
  ],
  steps: [
    {
      id: "s1",
      instructionText: "Stir.",
      instructionType: null,
      equipmentNeeded: null,
      timeMinutes: null,
    },
  ],
});

describe("RecipeEditor — a draft (X15)", () => {
  const html = render(
    <RecipeEditor mode="edit" recipeId="r1" isDraft initial={draft} />,
  );

  test("says the AI read it and that nothing is shared until it is saved", () => {
    assert.match(html, />Review draft</);
    assert.match(html, /Nothing is shared until\s+you do\./);
  });

  test("each catalog match wears the AI mark with Keep and Not this", () => {
    assert.equal(html.match(/data-ai-draft="suggested"/g)?.length, 3);
    assert.match(html, /aria-label="Keep Casa Noble Tequila"/);
    assert.match(html, /aria-label="Not Casa Noble Tequila"/);
    // Two waiting: one tap keeps them all, deliberately.
    assert.match(html, />Keep all 2</);
  });

  test("private first, said in a sentence; the save is the brass button", () => {
    assert.match(
      html,
      /role="radio" aria-checked="true"[^>]*>(<[^>]+>)*Private</,
    );
    assert.match(html, /Only you can see this recipe\./);
    assert.match(html, /type="submit"[^>]*>(<[^>]+>)*Save recipe</);
  });
});

describe("RecipeEditor — Type (X15)", () => {
  const html = render(<RecipeEditor mode="new" initial={blankForm()} />);

  test("a blank recipe with no AI marks and nothing to discard", () => {
    assert.match(html, />New recipe</);
    assert.doesNotMatch(html, /data-ai-draft=/);
    assert.match(html, /aria-label="Ingredient 1"/);
    assert.match(html, /aria-label="Step 1"/);
  });
});

describe("MyRecipes — the top of the Bar (X15)", () => {
  test("drafts lead to the editor; your recipes say who sees them", () => {
    const html = render(
      <MyRecipes
        rows={[
          {
            id: "d1",
            name: "From a photo",
            privacy: "PRIVATE",
            isDraft: true,
            ingredientCount: 4,
          },
          {
            id: "m1",
            name: "House sour",
            privacy: "FRIENDS",
            isDraft: false,
            ingredientCount: 1,
          },
        ]}
      />,
    );
    assert.match(html, /aria-label="Your drafts"/);
    assert.match(html, /href="\/recipes\/d1\/edit"[^>]*>From a photo</);
    assert.match(html, /Read by AI · 4 ingredients · check it to save/);
    assert.match(html, /aria-label="Your recipes"/);
    assert.match(html, /href="\/recipes\/m1"[^>]*>House sour</);
    assert.match(html, /Friends · 1 ingredient/);
    // Recipes-Browse 01: "Yours 1", each row led by the recipe face.
    assert.match(html, />Yours 1</);
    assert.match(html, /data-slot="recipe-thumb"/);
  });

  test("Show all counts every published recipe, not the first page", () => {
    const rows = ["a", "b", "c", "d"].map((id) => ({
      id,
      name: `Recipe ${id}`,
      privacy: "PRIVATE",
      isDraft: false,
      ingredientCount: 2,
    }));
    const html = render(<MyRecipes rows={rows} publishedTotal={27} />);
    assert.match(html, /Show all 27/);
    assert.doesNotMatch(html, /Recipe d</);
  });

  test("Drafts counts every draft, with Show all past the first page (F-109)", () => {
    const rows = ["a", "b"].map((id) => ({
      id,
      name: `Draft ${id}`,
      privacy: "PRIVATE",
      isDraft: true,
      ingredientCount: 2,
    }));
    const html = render(<MyRecipes rows={rows} draftsTotal={25} />);
    assert.match(html, />Drafts 25</);
    assert.match(html, /Show all 25/);
  });

  test("a failed drafts read says so, with Try again (F-109)", () => {
    const html = render(<MyRecipes rows={[]} draftsFailure="You're offline" />);
    assert.match(html, /aria-label="Your drafts"/);
    assert.match(html, /role="alert"/);
    assert.match(html, /Couldn(?:'|&#x27;)t load your drafts/);
    assert.match(html, />Try again</);
  });

  test("nothing at all when you have written nothing", () => {
    assert.equal(render(<MyRecipes rows={[]} />), "");
  });
});

describe("readFailureCopy", () => {
  test("a read that found no recipe says so, for a photo and for text", () => {
    const reason =
      "no recipe could be read from the photo for job j. Nothing has been created";
    assert.equal(
      readFailureCopy(reason, "photo").title,
      "No recipe in that photo",
    );
    assert.equal(readFailureCopy(reason, "photo").kind, "nothing-read");
    assert.equal(
      readFailureCopy(reason, "paste").title,
      "No recipe in that text",
    );
  });

  test("anything else is a plain failure that saved nothing", () => {
    const copy = readFailureCopy("the provider timed out", "photo");
    assert.equal(copy.kind, "retryable");
    assert.match(copy.message, /^Nothing was saved\./);
  });

  test("a failure after the job wrote the recipe row never says nothing was saved", () => {
    const copy = readFailureCopy("the provider timed out", "photo", true);
    assert.equal(copy.title, "Reading stopped part-way");
    assert.doesNotMatch(copy.message, /Nothing was saved/);
    assert.match(copy.message, /draft only you can see/);
  });
});
