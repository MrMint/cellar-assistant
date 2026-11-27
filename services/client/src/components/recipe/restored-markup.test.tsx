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
import { stripStyleBlocks, stripTags } from "@/test-support/markup";

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
const { RecipeGroupSearch } = await import("../search/RecipeGroupSearch");

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});
const render = (node: ReactNode) =>
  stripStyleBlocks(
    renderToStaticMarkup(<Provider value={client}>{node}</Provider>),
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

describe("RecipeDetails: the name's heading level (X21)", () => {
  test("h1 where the recipe is the page", () => {
    const page = render(<RecipeDetails recipe={recipe} titleLevel="h1" />);
    assert.match(page, /<h1[^>]*>Negroni</);
    assert.doesNotMatch(page, /<h[23][^>]*>Negroni</);
  });
});

describe("RecipeDetails (Recipes-Page)", () => {
  const html = render(<RecipeDetails recipe={recipe} viewerId="me" />);

  test("the name, then one meta line in the app's difficulty words", () => {
    assert.match(html, /<h2[^>]*>Negroni</);
    assert.match(stripTags(html), /Cocktail · Easy · 5\u202Fmin/);
    assert.doesNotMatch(html, /Very Easy|Very Hard|minutes/);
    assert.match(html, />Bitter and sweet\.</);
  });

  test("the hero is the kit's recipe face, with Back and More on discs", () => {
    assert.match(
      html,
      /data-slot="recipe-plate"[^>]*data-recipe-type="cocktail"[^>]*role="img" aria-label="Negroni"/,
    );
    assert.match(html, /data-face="recipe"/);
    assert.doesNotMatch(html, /data-next-image/);
    assert.match(html, /<button[^>]*aria-label="More actions"/);
  });

  test("other versions are rows that link to each one", () => {
    assert.match(html, />Other versions</);
    assert.match(html, /href="\/recipes\/r0"[^>]*>Classic Negroni/);
    assert.match(html, /href="\/recipes\/r2"[^>]*>Sbagliato/);
    assert.match(html, />v3</);
  });

  test("ingredients: fractions, item link, optional chip, note", () => {
    assert.match(html, />Ingredients</);
    assert.match(html, />1½ oz</);
    assert.match(html, /href="\/wines\/w1"/);
    assert.match(html, />2019 Vermouth</);
    assert.match(html, />½ oz</);
    assert.match(html, />Optional</);
    assert.doesNotMatch(html, />garnish</);
    assert.match(html, />Any orange</);
    // With no availability in the fixture (a signed-out read): no lines.
    assert.doesNotMatch(html, /data-availability/);
  });

  test("Love, Want to try, and the bar's verdict with Make it · n missing", () => {
    const signedIn = render(
      <RecipeDetails
        recipe={{
          ...recipe,
          is_loved: true,
          is_want_to_try: false,
          makeability: {
            status: "ONE_AWAY",
            missing: ["Campari"],
            substituteCount: 0,
          },
        }}
        viewerId="me"
      />,
    );
    assert.match(signedIn, /aria-label="Negroni: loved — tap to remove"/);
    assert.match(signedIn, /data-slot="heart"[^>]*data-state="on"/);
    assert.match(stripTags(signedIn), /Want to try/);
    assert.match(signedIn, /data-makeability="one_away"/);
    assert.match(stripTags(signedIn), /One bottle away/);
    assert.match(signedIn, /href="\/recipes\/bar"[^>]*>Your bar</);
    assert.match(stripTags(signedIn), /Make it· 1 missing/);
  });

  test("method: numbered steps, type chip, equipment, time", () => {
    assert.match(html, />Method</);
    assert.match(html, />Stir with ice\.</);
    assert.match(html, />mix</);
    assert.match(html, />Mixing glass</);
    assert.match(html, />1\u202Fmin</);
  });

  test("reviews: Write a review, and others' reviews with grey stars", () => {
    assert.match(html, />Reviews</);
    assert.match(html, />Write a review</);
    assert.match(html, />Bo</);
    assert.match(html, /data-slot="stars" data-tone="other"/);
    assert.doesNotMatch(html, /No reviews yet/);
  });

  test("the viewer's own review is theirs to edit or delete, and only theirs", () => {
    const own = render(<RecipeDetails recipe={recipe} viewerId="u2" />);
    assert.match(own, /data-slot="my-review"/);
    assert.match(own, />Edit</);
    assert.match(own, /aria-label="Delete your review"/);
    assert.doesNotMatch(own, />Write a review</);
    // Someone else's review never offers Edit or Delete to this viewer.
    assert.doesNotMatch(html, /Delete your review/);
  });

  test("no reviews: one line and the one action", () => {
    const empty = render(
      <RecipeDetails recipe={{ ...recipe, recipe_reviews: [] }} />,
    );
    assert.match(empty, />No reviews yet</);
    assert.match(empty, />Write a review</);
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

  test("a row: the photo, the name, one line in the app's words, one line of description", () => {
    assert.match(html, /src="https:\/\/example.test\/n.jpg"/);
    assert.match(html, /<h3[^>]*>.*Negroni/);
    assert.match(stripTags(html), /Gin · Easy · 3\u202Fmin/);
    assert.match(html, />Equal parts\.</);
    assert.match(html, />3 versions</);
    assert.doesNotMatch(html, /★|Featured:|\+1 more/);
  });

  test("no photo: the kit's recipe face", () => {
    const plain = render(
      <RecipeGroupCard
        recipeGroup={{
          id: "g2",
          name: "Daiquiri",
          category: "cocktail",
          base_spirit: null,
          tags: [],
          canonical_recipe: null,
          recipes_aggregate: { aggregate: { count: 1 } },
        }}
      />,
    );
    assert.match(plain, /data-face="recipe"/);
    assert.doesNotMatch(plain, /versions?</);
  });
});

describe("RecipeGroupSearch (Recipes-Browse)", () => {
  const html = render(
    <RecipeGroupSearch
      initialEdges={[]}
      initialEndCursor={null}
      initialHasNextPage={false}
      initialTotalCount={0}
      between={<p>Between</p>}
    />,
  );

  test("the search field, All recipes, the kind chip and spirit chips", () => {
    assert.match(html, /placeholder="Search recipes"/);
    assert.doesNotMatch(html, /[Rr]ecipe [Gg]roups/);
    assert.match(html, />All recipes</);
    assert.match(html, /data-slot="filter-chip"[^>]*aria-haspopup="dialog"/);
    assert.match(stripTags(html), /All kinds/);
    assert.match(html, />Gin</);
    // With no term, the index's own sections sit under the field.
    assert.match(html, /<p>Between<\/p>/);
  });

  test("nothing at all: the empty state, with no action to clear", () => {
    assert.match(html, />No recipes yet</);
    assert.doesNotMatch(html, />Clear filters</);
  });

  test("a term: its results, no index sections, the kit's no-match wording", () => {
    const searched = render(
      <RecipeGroupSearch
        initialQuery="zzz"
        initialEdges={[]}
        initialTotalCount={0}
        between={<p>Between</p>}
      />,
    );
    assert.doesNotMatch(searched, /Between/);
    assert.match(searched, />Results</);
    assert.match(searched, /No recipe matches “zzz”/);
    assert.match(searched, />Clear search</);
  });
});

describe("RecipeVersionsTab (Recipes-Browse 16–20)", () => {
  const original = {
    ...recipe,
    created_at: "2026-01-02T03:04:05.000Z",
    created_by_user: { id: "u1", displayName: "Ada" },
    upvotes: 0,
    downvotes: 0,
    netScore: 0,
    userVote: null,
  };
  const variation = {
    ...original,
    id: "r2",
    name: "Sbagliato",
    version: 3,
    created_at: "2026-03-02T03:04:05.000Z",
    created_by_user: { id: "u2", displayName: "Bo" },
    // Drops the orange peel and doubles the vermouth.
    ingredients: [{ ...recipe.ingredients[0], id: "i9", quantity: 3 }],
    upvotes: 3,
    downvotes: 1,
    netScore: 2,
    userVote: "upvote" as const,
  };
  const html = (viewerId: string | null) =>
    render(
      <RecipeVersionsTab
        groupId="g1"
        communityPickId="r2"
        viewerId={viewerId}
        recipes={[variation, original]}
      />,
    );

  test("the original first, each card linking to its version", () => {
    const page = html("u3");
    const first = page.indexOf(">Negroni<");
    const second = page.indexOf(">Sbagliato<");
    assert.ok(first >= 0 && first < second, "the original leads");
    assert.match(page, /href="\/recipes\/r1"/);
    assert.match(page, /href="\/recipes\/r2"/);
    assert.match(page, /By Ada · /);
  });

  test("MC-pick: the community pick label sits on the pick", () => {
    const page = html("u3");
    assert.match(
      page,
      /data-pick="true"[\s\S]*>Sbagliato<[\s\S]*>Community pick</,
    );
    assert.equal(page.match(/>Community pick</g)?.length, 1);
  });

  test("what a version changes is marked, and a dropped one says No", () => {
    const page = html("u3");
    assert.match(page, />No orange peel</);
    const changed = page.match(/data-changed="true"/g)?.length ?? 0;
    assert.equal(changed, 2, "the new amount and the dropped peel");
  });

  test("Up and Down for someone else's version; your vote is pressed", () => {
    const page = html("u1");
    const tag = (name: string) =>
      page.match(new RegExp(`<button[^>]*aria-label="${name}"[^>]*>`))?.[0] ??
      "";
    assert.match(tag("Upvote Sbagliato"), /aria-pressed="true"/);
    assert.match(tag("Downvote Sbagliato"), /aria-pressed="false"/);
    assert.match(page, />\+2</);
  });

  test("authors see no vote buttons on their own version", () => {
    const page = html("u1");
    assert.doesNotMatch(page, /aria-label="Upvote Negroni"/);
    assert.match(page, />No votes yet</);
    const other = html("u2");
    assert.doesNotMatch(other, /aria-label="Upvote Sbagliato"/);
    assert.match(other, />3 up · 1 down</);
  });
});

describe("RecipeDetails for its author (X15)", () => {
  const html = (overrides: Partial<Recipe>) =>
    render(
      <RecipeDetails
        recipe={{ ...recipe, created_by_id: "me", ...overrides }}
        viewerId="me"
      />,
    );

  test("a draft says the AI read it, that only you see it, and leads to the review", () => {
    const page = html({ is_draft: true, privacy: "PRIVATE" });
    assert.match(page, /data-ai-draft="suggested"/);
    assert.match(page, /Only you see it until you save it/);
    assert.match(page, /href="\/recipes\/r1\/edit"[^>]*>Review draft</);
    // A draft is not made or reviewed yet.
    assert.doesNotMatch(page, /data-testid="make-it"|Write a review/);
  });

  test("a saved recipe says who can see it, with the way to change it", () => {
    const page = html({ is_draft: false, privacy: "PRIVATE" });
    assert.match(stripTags(page), /Only you can see it/);
    assert.match(page, /href="\/recipes\/r1\/edit"[^>]*>Change</);
    assert.match(stripTags(html({ privacy: "PUBLIC" })), /Everyone can see it/);
    assert.doesNotMatch(page, /data-ai-draft=/);
  });

  test("someone else's recipe draws neither", () => {
    const page = render(
      <RecipeDetails
        recipe={{ ...recipe, created_by_id: "author", privacy: "PUBLIC" }}
        viewerId="me"
      />,
    );
    assert.doesNotMatch(page, /Review draft|can see it|>Change</);
  });
});
