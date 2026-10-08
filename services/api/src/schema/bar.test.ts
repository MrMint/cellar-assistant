/**
 * X14's GraphQL surface (`bar.ts`) against a stub sidecar: availability and
 * makeability judged from the viewer's own inventory (read once per request),
 * Love, the Bar pantry, What can I make and "Cocktails with this". The actor
 * halves are `bar-actor.test.ts` and `user-actor.test.ts` against Postgres.
 */
import type {
  BarInventory,
  RecipeIngredientDto,
  WhatCanIMakeDto,
} from "@cellar-assistant/contracts";
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
const SPIRIT_ID = "44444444-4444-4444-8444-444444444444";
const GENERIC_ID = "55555555-5555-4555-8555-555555555555";

const recipeDto = {
  id: RECIPE_ID,
  name: "Manhattan",
  description: null,
  type: "cocktail" as const,
  createdById: viewer.id,
  recipeGroupId: null,
  canonicalRecipeId: null,
  difficultyLevel: 2,
  prepTimeMinutes: 5,
  servingSize: 1,
  imageUrl: null,
  version: 1,
  ingredientCount: 3,
  instructionCount: 1,
  createdAt: "2026-09-08T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:00.000Z",
};

const ingredient = (
  id: string,
  overrides: Partial<RecipeIngredientDto>,
): RecipeIngredientDto => ({
  id,
  recipeId: RECIPE_ID,
  ref: { type: "GENERIC", id: GENERIC_ID },
  quantity: null,
  unit: null,
  isOptional: false,
  substitutionNotes: null,
  createdAt: null,
  role: null,
  kind: null,
  quantityText: null,
  brandMentioned: null,
  ...overrides,
});

const manhattan: RecipeIngredientDto[] = [
  ingredient("i1", {
    kind: "rye",
    role: "base",
    quantity: 2,
    unit: "oz",
  }),
  ingredient("i2", {
    kind: "sweet_vermouth",
    role: "modifier",
    quantityText: "3/4 oz",
  }),
  ingredient("i3", { kind: "aromatic_bitters", role: "bitters" }),
  ingredient("i4", { kind: "cherries", role: "garnish" }),
];

const inventory: BarInventory = {
  pantry: ["aromatic_bitters"],
  bottles: [
    {
      cellarItemId: "ci-1",
      cellarId: "c-1",
      itemType: "SPIRIT",
      itemId: SPIRIT_ID,
      name: "Buffalo Trace",
      kind: "bourbon",
      percentageRemaining: 60,
      opened: true,
    },
  ],
};

const pageOf = <T>(nodes: readonly T[]) => ({
  entries: nodes.map((node, index) => ({ cursor: `offset:${index}`, node })),
  hasNextPage: false,
  hasPreviousPage: false,
  totalCount: nodes.length,
});

describe("recipe availability (D9)", () => {
  it("judges every ingredient from one inventory read, and formats amounts once", async () => {
    const { invoke, calls } = stubSidecar({
      "RecipeActor.get": () => recipeDto,
      "RecipeActor.ingredients": () => pageOf(manhattan),
      "BarActor.inventory": () => inventory,
    });
    const result = await run(
      `{ recipe(id: "${RECIPE_ID}") { ... on Recipe {
          ingredients(first: 10) { edges { node {
            kind kindLabel role amount
            availability { status source label via opened }
          } } }
          makeability { status missing substituteCount requiredCount haveCount }
      } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    const recipe = result.data?.recipe as {
      ingredients: { edges: { node: Record<string, unknown> }[] };
      makeability: Record<string, unknown>;
    };
    expect(recipe.ingredients.edges.map((edge) => edge.node)).toEqual([
      {
        kind: "rye",
        kindLabel: "Rye whiskey",
        role: "base",
        amount: "2 oz",
        availability: {
          status: "SUBSTITUTE",
          source: "BOTTLE",
          label: "Buffalo Trace",
          via: "bourbon",
          opened: true,
        },
      },
      {
        kind: "sweet_vermouth",
        kindLabel: "Sweet vermouth",
        role: "modifier",
        amount: "¾ oz",
        availability: {
          status: "MISSING",
          source: null,
          label: null,
          via: null,
          opened: null,
        },
      },
      {
        kind: "aromatic_bitters",
        kindLabel: "Angostura bitters",
        role: "bitters",
        amount: "",
        availability: {
          status: "HAVE",
          source: "PANTRY",
          label: "Angostura bitters",
          via: "aromatic_bitters",
          opened: null,
        },
      },
      {
        kind: "cherries",
        kindLabel: "Cocktail cherries",
        role: "garnish",
        amount: "",
        availability: {
          status: "MISSING",
          source: null,
          label: null,
          via: null,
          opened: null,
        },
      },
    ]);
    expect(recipe.makeability).toEqual({
      status: "ONE_AWAY",
      missing: ["Sweet vermouth"],
      substituteCount: 1,
      requiredCount: 3,
      haveCount: 2,
    });
    // Four availabilities and a makeability, one inventory read.
    expect(calls.filter((call) => call.actorType === "BarActor")).toHaveLength(
      1,
    );
    expect(calls.find((call) => call.actorType === "BarActor")?.actorId).toBe(
      viewer.id,
    );
  });

  it("is null for an anonymous viewer, and reads no bar", async () => {
    const { invoke, calls } = stubSidecar({
      "RecipeActor.get": () => recipeDto,
      "RecipeActor.ingredients": () => pageOf(manhattan),
    });
    const result = await run(
      `{ recipe(id: "${RECIPE_ID}") { ... on Recipe {
          ingredients(first: 10) { edges { node { availability { status } } } }
          makeability { status }
      } } }`,
      testContext(invoke, null),
    );
    const recipe = result.data?.recipe as Record<string, unknown> | undefined;
    if (recipe !== undefined && "makeability" in recipe) {
      expect(recipe.makeability).toBeNull();
    }
    expect(calls.some((call) => call.actorType === "BarActor")).toBe(false);
  });
});

describe("Love (D9)", () => {
  it("reads isLoved in one batch, and toggles through the viewer's own actor", async () => {
    const { invoke, calls } = stubSidecar({
      "RecipeActor.get": () => recipeDto,
      "UserActor.recipeLoveStates": (_id, _ctx, ids) => ids,
      "UserActor.toggleRecipeLove": (_id, _ctx, recipeId) => ({
        recipeId,
        loved: false,
      }),
    });
    const read = await run(
      `{ recipe(id: "${RECIPE_ID}") { ... on Recipe { isLoved } } }`,
      testContext(invoke, viewer),
    );
    expect(read.errors).toBeUndefined();
    expect(read.data?.recipe).toEqual({ isLoved: true });

    const toggled = await run(
      `mutation { toggleRecipeLove(recipeId: "${RECIPE_ID}") {
          __typename ... on ToggleRecipeLovePayload { recipeId loved }
      } }`,
      testContext(invoke, viewer),
    );
    expect(toggled.data?.toggleRecipeLove).toEqual({
      __typename: "ToggleRecipeLovePayload",
      recipeId: RECIPE_ID,
      loved: false,
    });
    const toggle = calls.find((call) => call.method === "toggleRecipeLove");
    expect(toggle?.actorId).toBe(viewer.id);
  });

  it("refuses an anonymous toggle as a typed error", async () => {
    const { invoke } = stubSidecar({});
    const result = await run(
      `mutation { toggleRecipeLove(recipeId: "${RECIPE_ID}") { __typename } }`,
      testContext(invoke, null),
    );
    expect(result.data?.toggleRecipeLove).toEqual({
      __typename: "ForbiddenError",
    });
  });
});

describe("the Bar pantry (D23)", () => {
  it("lists the toggles and which are on", async () => {
    const { invoke } = stubSidecar({
      "UserActor.barPantry": () => ["lime", "simple_syrup"],
    });
    const result = await run(
      `{ barPantry { __typename ... on BarPantry { have kinds } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    const pantry = result.data?.barPantry as {
      have: string[];
      kinds: string[];
    };
    expect(pantry.have).toEqual(["lime", "simple_syrup"]);
    expect(pantry.kinds).toContain("lime");
    expect(pantry.kinds).not.toContain("bourbon");
  });

  it("sets one toggle", async () => {
    const { invoke, calls } = stubSidecar({
      "UserActor.setBarPantryItem": (_id, _ctx, input) => input,
    });
    const result = await run(
      `mutation { setBarPantryItem(kind: lime, have: true) {
          __typename ... on BarPantryEntry { kind label have }
      } }`,
      testContext(invoke, viewer),
    );
    expect(result.data?.setBarPantryItem).toEqual({
      __typename: "BarPantryEntry",
      kind: "lime",
      label: "Limes",
      have: true,
    });
    expect(calls[0]?.args[1]).toEqual({ kind: "lime", have: true });
  });
});

describe("What can I make (G29)", () => {
  it("pages both sections from the viewer's BarActor", async () => {
    const match = (
      id: string,
      name: string,
      status: "MAKE_NOW" | "ONE_AWAY",
    ) => ({
      recipeId: id,
      recipeGroupId: null,
      name,
      makeability: {
        status,
        missing: status === "ONE_AWAY" ? ["Campari"] : [],
        missingKinds: status === "ONE_AWAY" ? (["red_bitter"] as const) : [],
        substituteCount: 0,
        requiredCount: 3,
        haveCount: status === "ONE_AWAY" ? 2 : 3,
      },
    });
    const dto: WhatCanIMakeDto = {
      makeNow: [match(RECIPE_ID, "Manhattan", "MAKE_NOW")],
      oneAway: [match(GENERIC_ID, "Negroni", "ONE_AWAY")],
      makeNowCount: 1,
      oneAwayCount: 1,
      bottleCount: 4,
      pantryCount: 2,
      scanned: 10,
    };
    const { invoke, calls } = stubSidecar({
      "BarActor.whatCanIMake": () => dto,
    });
    const result = await run(
      `{ whatCanIMake(limit: 20) { __typename ... on WhatCanIMake {
          makeNowCount oneBottleAwayCount bottleCount pantryCount scanned
          makeNow(first: 10) { edges { node { recipeId name makeability { status } } } }
          oneBottleAway(first: 10) { edges { node { name makeability { missing } } } }
      } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.whatCanIMake).toMatchObject({
      makeNowCount: 1,
      oneBottleAwayCount: 1,
      bottleCount: 4,
      makeNow: {
        edges: [
          {
            node: {
              recipeId: RECIPE_ID,
              name: "Manhattan",
              makeability: { status: "MAKE_NOW" },
            },
          },
        ],
      },
      oneBottleAway: {
        edges: [
          { node: { name: "Negroni", makeability: { missing: ["Campari"] } } },
        ],
      },
    });
    expect(calls[0]).toMatchObject({
      actorType: "BarActor",
      actorId: viewer.id,
      method: "whatCanIMake",
    });
    expect(calls[0]?.args[1]).toEqual({ limit: 20 });
  });

  it("is a sign-in refusal for an anonymous viewer", async () => {
    const { invoke } = stubSidecar({});
    const result = await run(
      `{ whatCanIMake { __typename } }`,
      testContext(invoke, null),
    );
    expect(result.data?.whatCanIMake).toEqual({ __typename: "ForbiddenError" });
  });
});

describe("Item.cocktails (X14)", () => {
  const spirit = {
    id: SPIRIT_ID,
    name: "Buffalo Trace",
    description: null,
    createdAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
    createdById: viewer.id,
    barcodeCode: null,
    country: null,
    type: "SPIRIT" as const,
    spiritType: "BOURBON",
    style: null,
    vintage: null,
    alcoholContentPercentage: 45,
  };

  it("asks the viewer's BarActor for this item, and pages the recipes", async () => {
    const { invoke, calls } = stubSidecar({
      "ItemActor.get": () => spirit,
      "BarActor.cocktailsFor": () => ({
        kind: "bourbon",
        useItUp: true,
        total: 1,
        recipes: [
          {
            recipeId: RECIPE_ID,
            recipeGroupId: null,
            name: "Old Fashioned",
            makeability: {
              status: "MAKE_NOW",
              missing: [],
              missingKinds: [],
              substituteCount: 0,
              requiredCount: 3,
              haveCount: 3,
            },
          },
        ],
      }),
    });
    const result = await run(
      `{ item(id: "${SPIRIT_ID}", type: SPIRIT) { __typename ... on QueryItemSuccess {
          data { cocktails { kind kindLabel useItUp total
            recipes(first: 5) { edges { node { name makeability { status } } } } } }
      } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.item).toMatchObject({
      data: {
        cocktails: {
          kind: "bourbon",
          kindLabel: "Bourbon",
          useItUp: true,
          total: 1,
          recipes: {
            edges: [
              {
                node: {
                  name: "Old Fashioned",
                  makeability: { status: "MAKE_NOW" },
                },
              },
            ],
          },
        },
      },
    });
    const call = calls.find((entry) => entry.method === "cocktailsFor");
    expect(call?.actorId).toBe(viewer.id);
    expect(call?.args[1]).toEqual({ type: "SPIRIT", id: SPIRIT_ID });
  });
});

describe("Recipe.makeability on a food recipe", () => {
  it("is null — the bar vocabulary is drinks", async () => {
    const { invoke, calls } = stubSidecar({
      "RecipeActor.get": () => ({ ...recipeDto, type: "food" as const }),
    });
    const result = await run(
      `{ recipe(id: "${RECIPE_ID}") { ... on Recipe { makeability { status } } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.recipe).toEqual({ makeability: null });
    expect(calls.some((call) => call.actorType === "BarActor")).toBe(false);
  });
});

describe("Recipe.makeability with nothing required", () => {
  it("is null — a garnish alone is no verdict, never 'You can make this'", async () => {
    const { invoke } = stubSidecar({
      "RecipeActor.get": () => recipeDto,
      "RecipeActor.ingredients": () =>
        pageOf([
          ingredient("g1", { kind: "lemon", role: "garnish" }),
          ingredient("o1", { kind: "egg", role: "other", isOptional: true }),
        ]),
      "BarActor.inventory": () => inventory,
    });
    const result = await run(
      `{ recipe(id: "${RECIPE_ID}") { ... on Recipe { makeability { status } } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.recipe).toEqual({ makeability: null });
  });

  it("names the missing kinds beside the missing names", async () => {
    const { invoke } = stubSidecar({
      "RecipeActor.get": () => recipeDto,
      "RecipeActor.ingredients": () => pageOf(manhattan),
      "BarActor.inventory": () => inventory,
    });
    const result = await run(
      `{ recipe(id: "${RECIPE_ID}") { ... on Recipe {
          makeability { missing missingKinds }
      } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.recipe).toEqual({
      makeability: {
        missing: ["Sweet vermouth"],
        missingKinds: ["sweet_vermouth"],
      },
    });
  });
});

describe("Recipe.makeability names what it cannot place", () => {
  it("by the generic item's own name, not 'An ingredient'", async () => {
    const { invoke, calls } = stubSidecar({
      "RecipeActor.get": () => recipeDto,
      "RecipeActor.ingredients": () =>
        pageOf([
          ingredient("i1", { kind: "rye", role: "base" }),
          ingredient("i2", { kind: null, role: null }),
        ]),
      "BarActor.inventory": () => inventory,
      "ItemActor.getGeneric": () => ({
        id: GENERIC_ID,
        name: "Crème de violette",
      }),
    });
    const result = await run(
      `{ recipe(id: "${RECIPE_ID}") { ... on Recipe {
          makeability { status missing missingKinds }
      } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.recipe).toEqual({
      makeability: {
        status: "ONE_AWAY",
        missing: ["Crème de violette"],
        missingKinds: [],
      },
    });
    // Only the unplaced line is looked up.
    expect(calls.filter((call) => call.method === "getGeneric")).toHaveLength(
      1,
    );
  });
});
