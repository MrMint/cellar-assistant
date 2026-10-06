/**
 * The recipe aggregates' GraphQL surface — B6. Exercised against a stub
 * sidecar (`../testing.ts`), the pattern `tier-list.test.ts` uses: this proves
 * the resolvers marshal arguments and results correctly, not that the actors
 * are correct — that is `recipe-actor.test.ts` and `recipe-group-actor.test.ts`
 * against real Postgres.
 */
import { ConflictError } from "@cellar-assistant/contracts";
import { execute, parse } from "graphql";
import { describe, expect, it } from "vitest";
import { stubSidecar, testContext } from "../testing.ts";
import { schema } from "./index.ts";

const run = (document: string, context: ReturnType<typeof testContext>) =>
  execute({ schema, document: parse(document), contextValue: context });

const viewer = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "test@test.com",
  emailVerified: true,
  role: "user" as const,
};

const RECIPE_ID = "22222222-2222-4222-8222-222222222222";
const GROUP_ID = "33333333-3333-4333-8333-333333333333";
const WINE_ID = "44444444-4444-4444-8444-444444444444";
const GENERIC_ID = "55555555-5555-4555-8555-555555555555";
const OTHER_RECIPE_ID = "66666666-6666-4666-8666-666666666666";

const recipeDto = (id = RECIPE_ID, name = "Negroni") => ({
  id,
  name,
  description: null,
  type: "cocktail" as const,
  createdById: viewer.id,
  recipeGroupId: GROUP_ID,
  canonicalRecipeId: null,
  difficultyLevel: 2,
  prepTimeMinutes: 5,
  servingSize: 1,
  imageUrl: null,
  version: 1,
  ingredientCount: 2,
  instructionCount: 1,
  createdAt: "2026-09-08T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:00.000Z",
});

const groupDto = {
  id: GROUP_ID,
  name: "Negroni",
  description: null,
  category: "cocktail" as const,
  baseSpirit: "gin",
  tags: ["bitter"],
  imageUrl: null,
  createdById: viewer.id,
  canonicalRecipeId: RECIPE_ID,
  recipeCount: 2,
  createdAt: "2026-09-08T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:00.000Z",
};

const pageOf = <T>(nodes: readonly T[]) => ({
  entries: nodes.map((node, index) => ({ cursor: `offset:${index}`, node })),
  hasNextPage: false,
  hasPreviousPage: false,
  totalCount: nodes.length,
});

describe("recipe query", () => {
  it("resolves a recipe by id, including ingredientCount (what replaces recipe_summary)", async () => {
    const { invoke, calls } = stubSidecar({
      "RecipeActor.get": () => recipeDto(),
    });
    const result = await run(
      `{ recipe(id: "${RECIPE_ID}") { __typename ... on Recipe { id name type ingredientCount instructionCount } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.recipe).toEqual({
      __typename: "Recipe",
      id: RECIPE_ID,
      name: "Negroni",
      type: "cocktail",
      ingredientCount: 2,
      instructionCount: 1,
    });
    expect(calls[0]).toMatchObject({
      actorType: "RecipeActor",
      actorId: RECIPE_ID,
      method: "get",
    });
  });
});

describe("RecipeIngredient", () => {
  it("resolves item and genericItem as siblings, never both", async () => {
    const { invoke, calls } = stubSidecar({
      "RecipeActor.get": () => recipeDto(),
      "RecipeActor.ingredients": () =>
        pageOf([
          {
            id: "77777777-7777-4777-8777-777777777777",
            recipeId: RECIPE_ID,
            ref: { type: "WINE", id: WINE_ID },
            quantity: 30,
            unit: "ml",
            isOptional: false,
            substitutionNotes: null,
            createdAt: "2026-09-08T00:00:00.000Z",
          },
          {
            id: "88888888-8888-4888-8888-888888888888",
            recipeId: RECIPE_ID,
            ref: { type: "GENERIC", id: GENERIC_ID },
            quantity: null,
            unit: "dash",
            isOptional: true,
            substitutionNotes: "or orange bitters",
            createdAt: "2026-09-08T00:00:00.000Z",
          },
        ]),
      "ItemActor.get": (actorId: string) => ({
        id: actorId.split(":")[1],
        type: "WINE",
        name: "Sweet Vermouth",
        description: null,
        createdAt: "2026-09-08T00:00:00.000Z",
        updatedAt: "2026-09-08T00:00:00.000Z",
        createdById: viewer.id,
        barcodeCode: null,
        country: "Italy",
        vintage: null,
        variety: null,
        region: null,
        style: "RED",
        alcoholContentPercentage: 16,
      }),
      "ItemActor.getGeneric": (actorId: string) => ({
        id: actorId.split(":")[1],
        name: "Angostura bitters",
        category: "bitters",
        subcategory: null,
        kind: "ingredient",
        description: null,
        isSubstitutable: true,
        createdById: viewer.id,
        createdAt: "2026-09-08T00:00:00.000Z",
        updatedAt: "2026-09-08T00:00:00.000Z",
      }),
    });

    const result = await run(
      `{
        recipe(id: "${RECIPE_ID}") {
          ... on Recipe {
            ingredients(first: 10) {
              totalCount
              edges { node { refType unit isOptional item { id name } genericItem { id name kind } } }
            }
          }
        }
      }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    const recipe = result.data?.recipe as
      | { ingredients: { edges: { node: Record<string, unknown> }[] } }
      | undefined;
    const edges = recipe?.ingredients.edges ?? [];

    expect(edges[0]?.node).toEqual({
      refType: "WINE",
      unit: "ml",
      isOptional: false,
      item: { id: WINE_ID, name: "Sweet Vermouth" },
      genericItem: null,
    });
    expect(edges[1]?.node).toEqual({
      refType: "GENERIC",
      unit: "dash",
      isOptional: true,
      item: null,
      genericItem: {
        id: GENERIC_ID,
        name: "Angostura bitters",
        kind: "ingredient",
      },
    });

    // The item went through `ItemActor`'s six-type key space, the generic one
    // through its seventh (`generic:`).
    const itemCalls = calls.filter((call) => call.actorType === "ItemActor");
    expect(
      itemCalls.map((call) => `${call.method} ${call.actorId}`).sort(),
    ).toEqual([`get wine:${WINE_ID}`, `getGeneric generic:${GENERIC_ID}`]);
  });
});

describe("recipeGroup query", () => {
  it("batches its versions through the Recipe DataLoader and resolves the canonical", async () => {
    const loaded: string[] = [];
    const { invoke, calls } = stubSidecar({
      "RecipeGroupActor.get": () => groupDto,
      "RecipeGroupActor.recipes": () => pageOf([RECIPE_ID, OTHER_RECIPE_ID]),
      "RecipeActor.get": (actorId: string) => {
        loaded.push(actorId);
        return recipeDto(
          actorId,
          actorId === RECIPE_ID ? "Classic" : "House style",
        );
      },
    });

    const result = await run(
      `{
        recipeGroup(id: "${GROUP_ID}") {
          ... on RecipeGroup {
            id name category baseSpirit tags recipeCount
            canonicalRecipe { id name }
            recipes(first: 10) { totalCount edges { node { id name } } }
          }
        }
      }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.recipeGroup).toEqual({
      id: GROUP_ID,
      name: "Negroni",
      category: "cocktail",
      baseSpirit: "gin",
      tags: ["bitter"],
      recipeCount: 2,
      canonicalRecipe: { id: RECIPE_ID, name: "Classic" },
      recipes: {
        totalCount: 2,
        edges: [
          { node: { id: RECIPE_ID, name: "Classic" } },
          { node: { id: OTHER_RECIPE_ID, name: "House style" } },
        ],
      },
    });

    // §1.5: one batch, N parallel entity-actor calls — the canonical and the
    // list share a load, so the canonical is not fetched twice.
    expect(loaded.slice().sort()).toEqual([RECIPE_ID, OTHER_RECIPE_ID]);
    expect(
      calls.filter(
        (call) => call.method === "get" && call.actorType === "RecipeActor",
      ),
    ).toHaveLength(2);
  });
});

describe("mutations", () => {
  it("setRecipeIngredients passes the full list through, generic items included", async () => {
    const { invoke, calls } = stubSidecar({
      "RecipeActor.setIngredients": () => [],
      "RecipeActor.get": () => recipeDto(),
    });
    const result = await run(
      `mutation {
        setRecipeIngredients(
          recipeId: "${RECIPE_ID}"
          ingredients: [
            { ref: { type: WINE, id: "${WINE_ID}" }, quantity: 30, unit: "ml" }
            { newGenericItem: { name: "Campari", category: "liqueur", kind: spirit }, isOptional: true }
          ]
        ) {
          __typename
          ... on RecipeIngredientsPayload { recipeId ingredients(first: 10) { totalCount } }
        }
      }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.setRecipeIngredients).toEqual({
      __typename: "RecipeIngredientsPayload",
      recipeId: RECIPE_ID,
      ingredients: { totalCount: 0 },
    });
    expect(calls[0]).toMatchObject({
      actorType: "RecipeActor",
      actorId: RECIPE_ID,
      method: "setIngredients",
    });
    expect(calls[0]?.args[1]).toEqual({
      ingredients: [
        {
          ref: { type: "WINE", id: WINE_ID },
          quantity: 30,
          unit: "ml",
          isOptional: null,
          substitutionNotes: null,
        },
        {
          newGenericItem: {
            name: "Campari",
            category: "liqueur",
            kind: "spirit",
            subcategory: null,
            description: null,
            isSubstitutable: null,
          },
          quantity: null,
          unit: null,
          isOptional: true,
          substitutionNotes: null,
        },
      ],
    });
  });

  it("setRecipeInstructions sends the ordered list and never a step number", async () => {
    const { invoke, calls } = stubSidecar({
      "RecipeActor.setInstructions": () => [],
      "RecipeActor.get": () => recipeDto(),
    });
    await run(
      `mutation {
        setRecipeInstructions(
          recipeId: "${RECIPE_ID}"
          instructions: [
            { instructionText: "Stir with ice", instructionType: mix }
            { instructionText: "Garnish", instructionType: garnish, timeMinutes: 1 }
          ]
        ) { __typename }
      }`,
      testContext(invoke, viewer),
    );
    expect(calls[0]?.args[1]).toEqual({
      instructions: [
        {
          instructionText: "Stir with ice",
          instructionType: "mix",
          equipmentNeeded: null,
          timeMinutes: null,
        },
        {
          instructionText: "Garnish",
          instructionType: "garnish",
          equipmentNeeded: null,
          timeMinutes: 1,
        },
      ],
    });
  });

  it("review mutations address RecipeActor by the recipe and the review by id", async () => {
    const review = {
      id: "99999999-9999-4999-8999-999999999999",
      recipeId: RECIPE_ID,
      userId: viewer.id,
      score: 4,
      text: "good",
      createdAt: "2026-09-08T00:00:00.000Z",
      updatedAt: "2026-09-08T00:00:00.000Z",
    };
    const { invoke, calls } = stubSidecar({
      "RecipeActor.addReview": () => review,
      "RecipeActor.updateReview": () => ({ ...review, score: 2.5 }),
      "RecipeActor.deleteReview": () => ({ id: review.id }),
    });

    const added = await run(
      `mutation { addRecipeReview(recipeId: "${RECIPE_ID}", input: { score: 4, text: "good" }) { __typename ... on RecipeReview { id score } } }`,
      testContext(invoke, viewer),
    );
    expect(added.errors).toBeUndefined();
    expect(added.data?.addRecipeReview).toEqual({
      __typename: "RecipeReview",
      id: review.id,
      score: 4,
    });

    const updated = await run(
      `mutation { updateRecipeReview(recipeId: "${RECIPE_ID}", reviewId: "${review.id}", input: { score: 2.5 }) { __typename ... on RecipeReview { score } } }`,
      testContext(invoke, viewer),
    );
    expect(updated.data?.updateRecipeReview).toEqual({
      __typename: "RecipeReview",
      score: 2.5,
    });

    const deleted = await run(
      `mutation { deleteRecipeReview(recipeId: "${RECIPE_ID}", reviewId: "${review.id}") { __typename ... on DeletedRecipeReview { id } } }`,
      testContext(invoke, viewer),
    );
    expect(deleted.data?.deleteRecipeReview).toEqual({
      __typename: "DeletedRecipeReview",
      id: review.id,
    });

    expect(calls.map((call) => call.method)).toEqual([
      "addReview",
      "updateReview",
      "deleteReview",
    ]);
    // `args[0]` is the bound `ctx` (§8.2); the method's own arguments follow.
    expect(calls[1]?.args.slice(1)).toEqual([review.id, { score: 2.5 }]);
  });

  it("voteOnRecipe reaches RecipeGroupActor, not RecipeActor", async () => {
    const { invoke, calls } = stubSidecar({
      "RecipeGroupActor.vote": () => ({
        vote: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          recipeId: RECIPE_ID,
          userId: viewer.id,
          voteType: "upvote",
          createdAt: "2026-09-08T00:00:00.000Z",
          updatedAt: "2026-09-08T00:00:00.000Z",
        },
        group: groupDto,
        netScore: 1,
        canonicalChanged: true,
      }),
    });
    const result = await run(
      `mutation {
        voteOnRecipe(recipeGroupId: "${GROUP_ID}", recipeId: "${RECIPE_ID}", voteType: upvote) {
          __typename
          ... on RecipeVotePayload {
            netScore canonicalChanged
            vote { voteType userId }
            group { id canonicalRecipeId }
          }
        }
      }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.voteOnRecipe).toEqual({
      __typename: "RecipeVotePayload",
      netScore: 1,
      canonicalChanged: true,
      vote: { voteType: "upvote", userId: viewer.id },
      group: { id: GROUP_ID, canonicalRecipeId: RECIPE_ID },
    });
    expect(calls[0]).toMatchObject({
      actorType: "RecipeGroupActor",
      actorId: GROUP_ID,
      method: "vote",
    });
    expect(calls[0]?.args[1]).toEqual({
      recipeId: RECIPE_ID,
      voteType: "upvote",
    });
  });

  it("removeRecipeVote takes no user id — there is no way to name another user's vote", async () => {
    const { invoke, calls } = stubSidecar({
      "RecipeGroupActor.removeVote": () => ({
        recipeId: RECIPE_ID,
        userId: viewer.id,
        canonicalChanged: false,
      }),
    });
    const result = await run(
      `mutation { removeRecipeVote(recipeGroupId: "${GROUP_ID}", recipeId: "${RECIPE_ID}") { __typename ... on RemovedRecipeVote { recipeId userId canonicalChanged } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls[0]?.args.slice(1)).toEqual([RECIPE_ID]);

    const field = schema
      .getMutationType()
      ?.getFields()
      ?.removeRecipeVote?.args.map((arg) => arg.name);
    expect(field).toEqual(["recipeGroupId", "recipeId"]);
  });
});

/* -------------------------------------------------------------------------- */
/* A7d item 4: netScore and myVote                                             */
/* -------------------------------------------------------------------------- */

describe("Recipe.netScore / Recipe.myVote (A7d item 4)", () => {
  const summary = (
    recipeId: string,
    upvotes: number,
    downvotes: number,
    myVote: "upvote" | "downvote" | null,
  ) => ({
    recipeId,
    upvotes,
    downvotes,
    netScore: upvotes - downvotes,
    myVote,
  });

  it("batches a page of versions into one RecipeGroupActor call per group", async () => {
    const { invoke, calls } = stubSidecar({
      "RecipeGroupActor.get": () => groupDto,
      "RecipeGroupActor.recipes": () => pageOf([RECIPE_ID, OTHER_RECIPE_ID]),
      "RecipeActor.get": (actorId) => recipeDto(actorId, `v-${actorId}`),
      "RecipeGroupActor.voteSummaries": () => [
        summary(RECIPE_ID, 3, 1, "upvote"),
        summary(OTHER_RECIPE_ID, 0, 2, null),
      ],
    });

    const result = await run(
      `{ recipeGroup(id: "${GROUP_ID}") { __typename ... on RecipeGroup {
           recipes(first: 10) { edges { node {
             id netScore myVote upvotes downvotes
           } } }
         } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    const group = result.data?.recipeGroup as {
      recipes: { edges: { node: unknown }[] };
    };
    expect(group.recipes.edges.map((edge) => edge.node)).toEqual([
      {
        id: RECIPE_ID,
        netScore: 2,
        myVote: "upvote",
        upvotes: 3,
        downvotes: 1,
      },
      {
        id: OTHER_RECIPE_ID,
        netScore: -2,
        myVote: null,
        upvotes: 0,
        downvotes: 2,
      },
    ]);

    // The N+1 this field exists to remove: two versions and four tally
    // fields (UI parity G27 added `upvotes`/`downvotes`), and `voteSummaries`
    // is reached **once** — not per recipe, and since wave C not per field
    // either: the four loaders share one memoised call per group. It carries
    // both ids, which is the property that stops it scaling with the page.
    // `RecipeGroupActor` takes one turn at a time, so per-recipe or
    // per-field calls would have run in series.
    const summaryCalls = calls.filter(
      (call) => call.method === "voteSummaries",
    );
    expect(summaryCalls).toHaveLength(1);
    for (const call of summaryCalls) {
      expect(call.actorType).toBe("RecipeGroupActor");
      expect(call.actorId).toBe(GROUP_ID);
      // `args[0]` is the `Ctx` every actor method takes; the ids follow.
      expect(call.args[1]).toEqual([RECIPE_ID, OTHER_RECIPE_ID]);
    }
  });

  it("answers 0 and null for an ungrouped recipe, with no sidecar hop", async () => {
    const { invoke, calls } = stubSidecar({
      "RecipeActor.get": () => ({ ...recipeDto(), recipeGroupId: null }),
    });
    const result = await run(
      `{ recipe(id: "${RECIPE_ID}") { __typename ... on Recipe { netScore myVote } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.recipe).toEqual({
      __typename: "Recipe",
      netScore: 0,
      myVote: null,
    });
    // `recipe_group_id` is nullable and ON DELETE SET NULL, so this is a real
    // state, not a defensive branch — and it must not cost a call.
    expect(calls.filter((call) => call.method === "voteSummaries")).toEqual([]);
  });

  it("answers 0 and null for an anonymous viewer, with no sidecar hop (G27)", async () => {
    const { invoke, calls } = stubSidecar({
      "RecipeActor.get": () => recipeDto(),
    });
    const result = await run(
      `{ recipe(id: "${RECIPE_ID}") { __typename ... on Recipe {
           netScore myVote upvotes downvotes
         } } }`,
      testContext(invoke, null),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.recipe).toEqual({
      __typename: "Recipe",
      netScore: 0,
      myVote: null,
      upvotes: 0,
      downvotes: 0,
    });
    // `voteSummaries` would only refuse an anonymous ctx; asking is a wasted
    // turn on a single-activation actor.
    expect(calls.filter((call) => call.method === "voteSummaries")).toEqual([]);
  });

  it("memoises per group and recipe set: two groups on one page are two calls, not eight", async () => {
    const OTHER_GROUP = "77777777-7777-4777-8777-777777777777";
    const { invoke, calls } = stubSidecar({
      "RecipeActor.get": (actorId) =>
        actorId === OTHER_RECIPE_ID
          ? { ...recipeDto(OTHER_RECIPE_ID), recipeGroupId: OTHER_GROUP }
          : recipeDto(actorId),
      "RecipeGroupActor.voteSummaries": (_id, _ctx, ids) =>
        (ids as string[]).map((id) => summary(id, 1, 0, null)),
    });
    const result = await run(
      `{
        a: recipe(id: "${RECIPE_ID}") { ... on Recipe { upvotes downvotes netScore myVote } }
        b: recipe(id: "${OTHER_RECIPE_ID}") { ... on Recipe { upvotes downvotes netScore myVote } }
      }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    const summaryCalls = calls.filter(
      (call) => call.method === "voteSummaries",
    );
    expect(summaryCalls.map((call) => call.actorId).sort()).toEqual(
      [GROUP_ID, OTHER_GROUP].sort(),
    );
  });

  it("degrades to 0/null when the group call fails, rather than nulling the recipe", async () => {
    const { invoke } = stubSidecar({
      "RecipeActor.get": () => recipeDto(),
      "RecipeGroupActor.voteSummaries": () => {
        throw new Error("sidecar refused the invocation");
      },
    });
    const result = await run(
      `{ recipe(id: "${RECIPE_ID}") { __typename ... on Recipe { id netScore myVote } } }`,
      testContext(invoke, viewer),
    );
    // `netScore: Int!` is non-null, so a thrown loader would null `Recipe` and
    // propagate to the root. A vote tally is a decoration on a versions list;
    // losing it must not lose the recipe.
    expect(result.errors).toBeUndefined();
    expect(result.data?.recipe).toEqual({
      __typename: "Recipe",
      id: RECIPE_ID,
      netScore: 0,
      myVote: null,
    });
  });
});

/* -------------------------------------------------------------------------- */
/* A7d item 7: the two deletes                                                 */
/* -------------------------------------------------------------------------- */

describe("deleteRecipe / deleteRecipeGroup (A7d item 7)", () => {
  it("deleteRecipe maps onto RecipeActor.delete", async () => {
    const { invoke, calls } = stubSidecar({
      "RecipeActor.delete": (actorId) => ({ id: actorId }),
    });
    const result = await run(
      `mutation { deleteRecipe(recipeId: "${RECIPE_ID}") {
         __typename ... on DeletedRecipe { id } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.deleteRecipe).toEqual({
      __typename: "DeletedRecipe",
      id: RECIPE_ID,
    });
    expect(calls[0]).toMatchObject({
      actorType: "RecipeActor",
      actorId: RECIPE_ID,
      method: "delete",
    });
  });

  it("deleteRecipeGroup surfaces the non-empty refusal as a union member", async () => {
    const { invoke } = stubSidecar({
      "RecipeGroupActor.delete": () => {
        throw new ConflictError("still has 2 recipe(s)");
      },
    });
    const result = await run(
      `mutation { deleteRecipeGroup(recipeGroupId: "${GROUP_ID}") {
         __typename
         ... on DeletedRecipeGroup { id }
         ... on ConflictError { code message } } }`,
      testContext(invoke, viewer),
    );
    // The point of `errors: {}`: "you must empty it first" is a value in
    // `data`, not a top-level error with `data: null`.
    expect(result.errors).toBeUndefined();
    expect(result.data?.deleteRecipeGroup).toMatchObject({
      __typename: "ConflictError",
      code: "CONFLICT",
    });
  });
});
