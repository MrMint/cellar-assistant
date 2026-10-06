/**
 * Render tests for the restored recipe pages, asserting the **old** markup and
 * copy (`82450ad1:src/components/recipe/**`,
 * `82450ad1:src/components/search/RecipeGroupSearch.tsx` and the old
 * `recipes/**` pages).
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
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
  usePathname: () => "/recipes/r1",
  useSearchParams: () => new URLSearchParams(),
}));

const { RecipeDetails } = await import("./RecipeDetails");
const { RecipeGroupCard } = await import("./RecipeGroupCard");
const { RecipeVersionsTab } = await import("./RecipeVersionsTab");
const { RecipePhotoProcessor } = await import("./RecipePhotoProcessor");
const { AIRecipeGenerator } = await import("./AIRecipeGenerator");
const { RecipeGroupSearch } = await import("../search/RecipeGroupSearch");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const render = (node: ReactNode) =>
  renderToStaticMarkup(<Provider value={client}>{node}</Provider>).replace(
    /<style[^>]*>[^<]*<\/style>/g,
    "",
  );

type Recipe = Parameters<typeof RecipeDetails>[0]["recipe"];

const recipe: Recipe = {
  id: "r1",
  name: "Negroni",
  description: "Bitter and sweet.",
  type: "cocktail",
  difficulty_level: 2,
  prep_time_minutes: 5,
  serving_size: 1,
  image_url: null,
  version: 2,
  instructions: [
    {
      id: "s1",
      step_number: 1,
      instruction_text: "Stir with ice.",
      instruction_type: "mix",
      equipment_needed: "Mixing glass",
      time_minutes: 1,
    },
  ],
  ingredients: [
    {
      id: "i1",
      quantity: 1.5,
      unit: "oz",
      is_optional: false,
      item: { id: "w1", name: "Vermouth", type: "WINE", vintage: "2019" },
      generic_item: null,
    },
    {
      id: "i2",
      quantity: 0.5,
      unit: "oz",
      is_optional: true,
      substitution_notes: "Any orange",
      item: null,
      generic_item: { id: "g", name: "Orange peel", category: "garnish" },
    },
  ],
  recipe_reviews: [
    {
      id: "rv",
      userId: "u2",
      score: 4,
      user: { displayName: "Bo", avatarUrl: "" },
      text: null,
      created_at: "2026-02-03T00:00:00.000Z",
    },
  ],
  canonical_recipe: { id: "r0", name: "Classic Negroni", type: "cocktail" },
  recipe_variations: [{ id: "r2", name: "Sbagliato", version: 3 }],
};

describe("RecipeDetails (restored)", () => {
  const html = render(<RecipeDetails recipe={recipe} viewerId="me" />);

  test("the details card: title, subtitle phrases joined with ' • ', chips", () => {
    assert.match(html, /MuiTypography-h3[^>]*>Negroni</);
    assert.match(html, /cocktail • Easy • 5 minutes • Serves 1 • Version 2/);
    assert.match(html, />Easy</);
    assert.match(html, />5 min</);
    assert.match(html, />Serves 1</);
    assert.doesNotMatch(
      html,
      /Add to favorites/,
      "the no-op heart is a deliberate drop",
    );
  });

  test("breadcrumbs carry the recipe name; the header shows the type", () => {
    assert.match(html, />Recipes</);
    assert.match(html, />Negroni</);
  });

  test("the fallback picture and Share Recipe", () => {
    assert.match(html, /data-alt="A cocktail"/);
    assert.match(html, />Share Recipe</);
    assert.match(html, />Share</);
  });

  test("variations card: 'Variation of' and linked chips", () => {
    assert.match(html, /Variation of:/);
    assert.match(html, /href="\/recipes\/r0"[^>]*>Classic Negroni/);
    assert.match(html, /Other variations:/);
    assert.match(html, /href="\/recipes\/r2"/);
    assert.match(html, /Sbagliato v3/);
  });

  test("ingredients: fractions, item link, optional chip, generic category, note", () => {
    assert.match(html, />Ingredients</);
    assert.match(html, />1 1\/2 oz</);
    assert.match(html, /href="\/wines\/w1"/);
    assert.match(html, />2019 Vermouth</);
    assert.match(html, />1\/2 oz</);
    assert.match(html, />Optional</);
    assert.match(html, />garnish</);
    assert.match(html, /Note: Any orange/);
    assert.doesNotMatch(
      html,
      /In your cellar|Not in cellar|View substitutions/,
    );
  });

  test("instructions: numbered chip, type chip, equipment, time", () => {
    assert.match(html, />Instructions</);
    assert.match(html, />Stir with ice\.</);
    assert.match(html, />mix</);
    assert.match(html, /Equipment: Mixing glass/);
    assert.match(html, /Time: 1m/);
  });

  test("reviews: the add box and the accordion with its author", () => {
    assert.match(html, /placeholder="Add a review for this recipe\.\.\."/);
    assert.match(html, />Reviews:</);
    assert.match(html, />Bo</);
  });

  test("the viewer's own review turns the add box into an edit", () => {
    const own = render(<RecipeDetails recipe={recipe} viewerId="u2" />);
    assert.match(own, /placeholder="Edit your review of this recipe\.\.\."/);
  });

  test("the canonical wears the old badge", () => {
    const canonical = render(
      <RecipeDetails
        recipe={{ ...recipe, canonical_recipe: null }}
        viewerId="me"
        isCanonical
      />,
    );
    assert.match(canonical, />Preferred</);
  });

  test("no reviews: the old empty line", () => {
    const empty = render(
      <RecipeDetails recipe={{ ...recipe, recipe_reviews: [] }} />,
    );
    assert.match(empty, /No reviews yet! Want to add one\?/);
  });
});

describe("RecipeGroupCard (restored)", () => {
  const html = render(
    <RecipeGroupCard
      href="/recipes/groups/g1"
      recipeGroup={{
        id: "g1",
        name: "Negroni",
        description: "A group.",
        category: "cocktail",
        base_spirit: "GIN",
        tags: ["bitter", "stirred", "classic", "italian"],
        canonical_recipe: {
          id: "r0",
          name: "Classic Negroni",
          description: "Equal parts.",
          difficulty_level: 2,
          prep_time_minutes: 3,
          serving_size: 1,
          image_url: "https://example.test/n.jpg",
        },
        recipes_aggregate: { aggregate: { count: 3 } },
      }}
    />,
  );

  test("links to the group route, not the recipe route", () => {
    assert.match(html, /href="\/recipes\/groups\/g1"/);
  });

  test("the canonical summary renders", () => {
    assert.match(html, /Featured: Classic Negroni/);
    assert.match(html, /Equal parts\./);
    assert.match(html, /★★☆☆☆/);
    assert.match(html, />3m</);
    assert.match(html, /Serves 1/);
    assert.match(html, /src="https:\/\/example.test\/n.jpg"/);
  });

  test("category, spirit, versions, three tags and '+1 more'", () => {
    assert.match(html, />cocktail</);
    assert.match(html, />Gin</);
    assert.match(html, />3 versions</);
    assert.match(html, />classic</);
    assert.doesNotMatch(html, />italian</);
    assert.match(html, /\+1 more/);
  });
});

describe("RecipeGroupSearch (restored)", () => {
  const html = render(
    <RecipeGroupSearch
      initialEdges={[]}
      initialEndCursor={null}
      initialHasNextPage={false}
      initialTotalCount={0}
    />,
  );

  test("the search card and its filters", () => {
    assert.match(html, />Search Recipe Groups</);
    assert.match(
      html,
      /placeholder="Search by recipe name, description, or tags\.\.\."/,
    );
    assert.match(html, /aria-label="Category"/);
    assert.match(html, /aria-label="Base Spirit"/);
  });

  test("the empty state", () => {
    assert.match(html, />No recipe groups found</);
    assert.match(html, /Try adjusting your search criteria or filters/);
    assert.match(html, />Clear Filters</);
  });
});

describe("RecipeVersionsTab (restored)", () => {
  const version = {
    ...recipe,
    created_at: "2026-01-02T03:04:05.000Z",
    created_by_user: { id: "u1", displayName: "Ada" },
  };
  const html = render(
    <RecipeVersionsTab
      groupId="g1"
      canonicalRecipeId="r1"
      recipes={[
        {
          ...version,
          id: "r2",
          name: "Sbagliato",
          version: 3,
          upvotes: 0,
          downvotes: 1,
          netScore: -1,
          userVote: null,
        },
        {
          ...version,
          upvotes: 3,
          downvotes: 1,
          netScore: 2,
          userVote: "upvote",
        },
      ]}
    />,
  );

  test("tabs best-first, with score and the 'Preferred' badge", () => {
    const first = html.indexOf("Negroni");
    const second = html.indexOf("Sbagliato");
    assert.ok(first >= 0 && first < second, "net score orders the tabs");
    assert.match(html, /Score: \+2/);
    assert.match(html, /Score: -1/);
    assert.match(html, />Preferred</);
  });

  test("the selected panel: vote card, counts, net score, recipe info", () => {
    assert.match(html, />Community Preferred</);
    assert.match(html, />Community Vote</);
    assert.match(html, /aria-label="Upvote Negroni"/);
    assert.match(html, /aria-label="Downvote Negroni"/);
    assert.match(html, /Net Score: \+2/);
    assert.match(html, />Recipe Info</);
    assert.match(html, /Difficulty:/);
    assert.match(html, /By Ada/);
    assert.match(html, /Created/);
    assert.match(html, />No Image</);
    assert.match(html, />Description</);
    assert.match(html, /Step 1/);
  });
});

describe("AI Recipe Generator (restored)", () => {
  test("the processor card", () => {
    const html = render(<RecipePhotoProcessor />);
    assert.match(html, />AI Recipe Generator</);
    assert.match(html, />Choose Photo</);
    assert.match(html, />Extract Recipes</);
  });

  test("the page, without the invented capability numbers", () => {
    const html = render(<AIRecipeGenerator />);
    assert.match(html, /MuiTypography-h1[^>]*>AI Recipe Generator</);
    assert.match(html, />AI Features</);
    assert.match(html, />Best Results Tips</);
    assert.match(html, />How It Works</);
    assert.match(html, />1. Upload Photo</);
    assert.doesNotMatch(html, /OCR Accuracy|System Capabilities|95%/);
    assert.doesNotMatch(html, /your cellar/);
  });
});
