/**
 * The recipe adapters, pinned against the props `82450ad1`'s recipe
 * components expected and what the new API returns.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  applyVoteSnapshot,
  formatNetScore,
  formatSpirit,
  ingredientItemHref,
  nextVoteState,
  type RecipeDetailsNode,
  type RecipeVersionData,
  type RecipeVoteState,
  recipeDetailsFromNode,
  recipeGroupCardFromNode,
  reviewFromNode,
  reviewTextForSave,
  sortVersions,
  stageProgress,
  variationsFromGroup,
  versionFromNodes,
} from "./adapter";

const details = (
  overrides: Partial<RecipeDetailsNode> = {},
): RecipeDetailsNode => ({
  __typename: "Recipe",
  id: "r1",
  name: "Negroni",
  description: "Bitter and sweet.",
  type: "cocktail",
  difficultyLevel: 2,
  prepTimeMinutes: 5,
  servingSize: 1,
  imageUrl: null,
  version: 2,
  recipeGroupId: "g1",
  canonicalRecipeId: "r0",
  createdAt: "2026-01-02T03:04:05.000Z",
  createdBy: { id: "u1", displayName: "Ada", avatarUrl: null },
  ingredients: {
    edges: [
      {
        node: {
          id: "i1",
          quantity: 1.5,
          unit: "oz",
          isOptional: false,
          substitutionNotes: null,
          refType: "WINE",
          item: {
            __typename: "Wine",
            id: "w1",
            name: "Vermouth",
            type: "WINE",
            vintage: "2019-01-01",
          },
          genericItem: null,
        },
      },
      {
        node: {
          id: "i2",
          quantity: null,
          unit: null,
          isOptional: true,
          substitutionNotes: "Any orange",
          refType: "GENERIC",
          item: null,
          genericItem: {
            id: "gi",
            name: "Orange peel",
            category: "garnish",
            subcategory: null,
            kind: "ingredient",
          },
        },
      },
    ],
  },
  instructions: {
    edges: [
      {
        node: {
          id: "s1",
          stepNumber: 1,
          instructionText: "Stir with ice.",
          instructionType: "mix",
          equipmentNeeded: "Mixing glass",
          timeMinutes: 1,
        },
      },
    ],
  },
  ...overrides,
});

const group = {
  id: "g1",
  name: "Negroni",
  recipeCount: 3,
  canonicalRecipeId: "r0",
  canonicalRecipe: { id: "r0", name: "Classic Negroni", type: "cocktail" },
  recipes: {
    edges: [
      { node: { id: "r0", name: "Classic Negroni", version: 1 } },
      { node: { id: "r1", name: "Negroni", version: 2, difficultyLevel: 2 } },
      { node: { id: "r2", name: "Sbagliato", version: 3, difficultyLevel: 1 } },
    ],
  },
};

describe("recipeDetailsFromNode → the old RecipeDetailsItem", () => {
  const recipe = recipeDetailsFromNode(details(), { group, reviews: [] });

  test("scalars in the old snake_case", () => {
    assert.equal(recipe.type, "cocktail");
    assert.equal(recipe.difficulty_level, 2);
    assert.equal(recipe.prep_time_minutes, 5);
    assert.equal(recipe.serving_size, 1);
    assert.equal(recipe.version, 2);
    assert.equal(recipe.image_url, null);
  });

  test("one item column over six types; the wine keeps its vintage year", () => {
    assert.deepEqual(recipe.ingredients[0], {
      id: "i1",
      quantity: 1.5,
      unit: "oz",
      is_optional: false,
      substitution_notes: null,
      item: { id: "w1", name: "Vermouth", type: "WINE", vintage: "2019" },
      generic_item: null,
    });
    assert.deepEqual(recipe.ingredients[1]?.generic_item, {
      id: "gi",
      name: "Orange peel",
      category: "garnish",
      subcategory: null,
      item_type: "ingredient",
    });
  });

  test("instructions in step order, old field names", () => {
    assert.deepEqual(recipe.instructions, [
      {
        id: "s1",
        step_number: 1,
        instruction_text: "Stir with ice.",
        instruction_type: "mix",
        equipment_needed: "Mixing glass",
        time_minutes: 1,
      },
    ]);
  });

  test("variations come from the group: canonical named, the rest as chips", () => {
    assert.deepEqual(recipe.canonical_recipe, {
      id: "r0",
      name: "Classic Negroni",
      type: "cocktail",
    });
    assert.deepEqual(
      recipe.recipe_variations?.map((v) => v.id),
      ["r2"],
    );
  });
});

describe("variationsFromGroup", () => {
  test("the canonical itself has no 'Variation of'", () => {
    const own = variationsFromGroup("r0", group);
    assert.equal(own.canonical_recipe, null);
    assert.deepEqual(
      own.recipe_variations?.map((v) => v.id),
      ["r1", "r2"],
    );
  });

  test("no group, no variations card", () => {
    assert.deepEqual(variationsFromGroup("r1", null), {
      canonical_recipe: null,
      recipe_variations: [],
    });
  });
});

describe("recipeGroupCardFromNode → the old RecipeGroupCardData", () => {
  test("canonical summary and the old aggregate shape", () => {
    const card = recipeGroupCardFromNode({
      __typename: "RecipeGroup",
      id: "g1",
      name: "Negroni",
      description: null,
      category: "cocktail",
      baseSpirit: "GIN",
      tags: ["bitter"],
      imageUrl: "https://example.test/group.jpg",
      recipeCount: 3,
      canonicalRecipeId: "r0",
      canonicalRecipe: {
        id: "r0",
        name: "Classic Negroni",
        description: "Equal parts.",
        difficultyLevel: 1,
        prepTimeMinutes: 3,
        servingSize: 1,
        imageUrl: null,
      },
    });
    assert.deepEqual(card.recipes_aggregate, { aggregate: { count: 3 } });
    assert.equal(card.base_spirit, "GIN");
    assert.equal(card.canonical_recipe?.difficulty_level, 1);
    assert.equal(
      card.canonical_recipe?.image_url,
      "https://example.test/group.jpg",
      "the group's picture stands in for a canonical without one",
    );
  });

  test("no votes, no canonical: the card has no summary", () => {
    const card = recipeGroupCardFromNode({
      __typename: "RecipeGroup",
      id: "g2",
      name: "Daiquiri",
      description: "Rum, lime, sugar.",
      category: "cocktail",
      baseSpirit: null,
      tags: [],
      imageUrl: null,
      recipeCount: 2,
      canonicalRecipeId: null,
      canonicalRecipe: null,
    });
    assert.equal(card.canonical_recipe, null);
  });
});

describe("reviews", () => {
  test("author via RecipeReview.user; plain text becomes Lexical state", () => {
    const review = reviewFromNode({
      __typename: "RecipeReview",
      id: "rv",
      userId: "u2",
      score: 4.5,
      text: "Lovely",
      createdAt: "2026-02-03T00:00:00.000Z",
      user: { id: "u2", displayName: "Bo", avatarUrl: null },
    });
    assert.equal(review.user.displayName, "Bo");
    assert.equal(review.user.avatarUrl, "");
    assert.equal(review.score, 4.5);
    assert.match(review.text ?? "", /"text":"Lovely"/);
  });

  test("a text-only review keeps no score; a missing author still gets a row", () => {
    const review = reviewFromNode({
      __typename: "RecipeReview",
      id: "rv",
      userId: "gone",
      score: null,
      text: null,
      createdAt: "2026-02-03T00:00:00.000Z",
      user: null,
    });
    assert.equal(review.score, undefined);
    assert.equal(review.text, null);
    assert.equal(review.user.displayName, "Unknown user");
  });

  test("an emptied editor is not text", () => {
    const empty = JSON.stringify({
      root: { children: [{ children: [], type: "paragraph" }], type: "root" },
    });
    assert.equal(reviewTextForSave(empty), undefined);
    assert.equal(reviewTextForSave(undefined), undefined);
    const words = JSON.stringify({
      root: {
        children: [{ children: [{ text: "Good" }], type: "paragraph" }],
        type: "root",
      },
    });
    assert.equal(reviewTextForSave(words), words);
  });
});

describe("votes (G27)", () => {
  const votes = {
    __typename: "Recipe" as const,
    id: "r1",
    netScore: 1,
    upvotes: 2,
    downvotes: 1,
    myVote: "upvote" as const,
  };

  test("versionFromNodes carries the four vote fields and the author", () => {
    const version = versionFromNodes(details(), votes);
    assert.equal(version.upvotes, 2);
    assert.equal(version.downvotes, 1);
    assert.equal(version.netScore, 1);
    assert.equal(version.userVote, "upvote");
    assert.equal(version.created_by_user?.displayName, "Ada");
    assert.equal(version.created_at, "2026-01-02T03:04:05.000Z");
  });

  test("the old handleVote arithmetic: same arrow withdraws, the other moves", () => {
    const start: RecipeVoteState = {
      upvotes: 2,
      downvotes: 1,
      netScore: 1,
      userVote: "upvote",
    };
    assert.deepEqual(nextVoteState(start, "upvote"), {
      upvotes: 1,
      downvotes: 1,
      netScore: 0,
      userVote: null,
    });
    assert.deepEqual(nextVoteState(start, "downvote"), {
      upvotes: 1,
      downvotes: 2,
      netScore: -1,
      userVote: "downvote",
    });
    assert.deepEqual(
      nextVoteState({ ...start, userVote: null }, "upvote").upvotes,
      3,
    );
  });

  test("a poll snapshot re-sorts the tabs: net score, then oldest", () => {
    const a = versionFromNodes(
      details({ id: "a", createdAt: "2026-01-01T00:00:00Z" }),
      {
        ...votes,
        id: "a",
        netScore: 0,
        upvotes: 0,
        downvotes: 0,
        myVote: null,
      },
    );
    const b = versionFromNodes(
      details({ id: "b", createdAt: "2026-01-02T00:00:00Z" }),
      {
        ...votes,
        id: "b",
        netScore: 0,
        upvotes: 0,
        downvotes: 0,
        myVote: null,
      },
    );
    assert.deepEqual(
      sortVersions([b, a]).map((v: RecipeVersionData) => v.id),
      ["a", "b"],
      "a tie goes to the older version",
    );
    const after = sortVersions(
      applyVoteSnapshot(
        [a, b],
        new Map([
          ["b", { upvotes: 1, downvotes: 0, netScore: 1, userVote: "upvote" }],
        ]),
      ),
    );
    assert.deepEqual(
      after.map((v) => v.id),
      ["b", "a"],
    );
    assert.equal(after[0]?.userVote, "upvote");
  });

  test("score labels", () => {
    assert.equal(formatNetScore(3), "+3");
    assert.equal(formatNetScore(0), "0");
    assert.equal(formatNetScore(-2), "-2");
  });
});

describe("small pieces", () => {
  test("item links for every type", () => {
    assert.equal(ingredientItemHref({ id: "x", type: "SAKE" }), "/sakes/x");
    assert.equal(ingredientItemHref({ id: "x", type: "WINE" }), "/wines/x");
  });

  test("the old card's spirit label", () => {
    assert.equal(formatSpirit("BRANDY_COGNAC"), "Brandy Cognac");
    assert.equal(formatSpirit(null), null);
  });

  test("photo job stages as a real percentage", () => {
    assert.equal(stageProgress("EXTRACT"), 20);
    assert.equal(stageProgress("RECIPE"), 100);
    assert.equal(stageProgress("UNKNOWN"), 0);
  });

  test("details with no group or reviews still render the old shape", () => {
    const recipe = recipeDetailsFromNode(details({ type: "food" }));
    assert.equal(recipe.type, "food");
    assert.deepEqual(recipe.recipe_reviews, []);
    assert.deepEqual(recipe.recipe_variations, []);
  });
});
