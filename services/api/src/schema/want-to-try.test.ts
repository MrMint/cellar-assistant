/**
 * X08's GraphQL surface against a stub sidecar: `Viewer.wantToTry`,
 * `Item.isWantToTry` / `Recipe.isWantToTry` and `setWantToTry`. The behaviour
 * (idempotence, owner-only, the place half on `user_place_interactions`) is
 * `user-actor.test.ts` against real Postgres; this proves the wiring — the
 * viewer's own actor, one batched state call, and the one-target rule.
 */
import { ForbiddenError, ValidationError } from "@cellar-assistant/contracts";
import { execute, parse } from "graphql";
import { describe, expect, it } from "vitest";
import { stubSidecar, testContext } from "../testing.ts";
import { schema } from "./index.ts";
import { targetFromInput } from "./want-to-try.ts";

const run = (document: string, context: ReturnType<typeof testContext>) =>
  execute({ schema, document: parse(document), contextValue: context });

const viewer = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "test@test.com",
  emailVerified: true,
  role: "user" as const,
};
const WINE = "22222222-2222-4222-8222-222222222222";
const RECIPE = "33333333-3333-4333-8333-333333333333";
const PLACE = "44444444-4444-4444-8444-444444444444";

const wine = {
  id: WINE,
  name: "A Wine",
  description: null,
  createdAt: "2026-10-08T00:00:00.000Z",
  updatedAt: "2026-10-08T00:00:00.000Z",
  createdById: viewer.id,
  barcodeCode: null,
  country: "FRANCE",
  type: "WINE" as const,
  vintage: "2019-01-01",
  variety: "PINOT_NOIR",
  region: "Burgundy",
  style: "RED",
  alcoholContentPercentage: 13.5,
};

const recipe = {
  id: RECIPE,
  name: "Negroni",
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
  ingredientCount: 2,
  instructionCount: 1,
  createdAt: "2026-10-08T00:00:00.000Z",
  updatedAt: "2026-10-08T00:00:00.000Z",
};

const page = <T>(nodes: readonly T[]) => ({
  entries: nodes.map((node, index) => ({ cursor: `offset:${index}`, node })),
  hasNextPage: false,
  hasPreviousPage: false,
  totalCount: nodes.length,
});

describe("Viewer.wantToTry (X08)", () => {
  it("lists items, recipes and places from the viewer's own actor, with one state call", async () => {
    const { invoke, calls } = stubSidecar({
      "UserActor.wantToTry": () =>
        page([
          {
            target: { kind: "ITEM", item: { type: "WINE", id: WINE } },
            savedAt: "2026-10-08T03:00:00.000Z",
          },
          {
            target: { kind: "RECIPE", recipeId: RECIPE },
            savedAt: "2026-10-08T02:00:00.000Z",
          },
          {
            target: { kind: "PLACE", placeId: PLACE },
            savedAt: "2026-10-08T01:00:00.000Z",
          },
        ]),
      "ItemActor.get": () => wine,
      "RecipeActor.get": () => recipe,
      "UserActor.wantToTryStates": () => [`wine:${WINE}`, `recipe:${RECIPE}`],
    });
    const result = await run(
      `{ me { wantToTry(first: 10, kinds: [ITEM, RECIPE, PLACE]) {
           totalCount
           edges { node {
             kind key savedAt
             item { id name isWantToTry }
             recipe { id name isWantToTry }
             place { id }
           } }
         } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    const me = result.data?.me as
      | { wantToTry: { totalCount: number; edges: { node: unknown }[] } }
      | undefined;
    const list = me?.wantToTry ?? { totalCount: 0, edges: [] };
    expect(list.totalCount).toBe(3);
    expect(list.edges.map((edge) => edge.node)).toEqual([
      {
        kind: "ITEM",
        key: `wine:${WINE}`,
        savedAt: "2026-10-08T03:00:00.000Z",
        item: { id: WINE, name: "A Wine", isWantToTry: true },
        recipe: null,
        place: null,
      },
      {
        kind: "RECIPE",
        key: `recipe:${RECIPE}`,
        savedAt: "2026-10-08T02:00:00.000Z",
        item: null,
        recipe: { id: RECIPE, name: "Negroni", isWantToTry: true },
        place: null,
      },
      {
        kind: "PLACE",
        key: `place:${PLACE}`,
        savedAt: "2026-10-08T01:00:00.000Z",
        item: null,
        recipe: null,
        place: { id: PLACE },
      },
    ]);

    const list_ = calls.find((call) => call.method === "wantToTry");
    expect(list_).toMatchObject({ actorType: "UserActor", actorId: viewer.id });
    expect(list_?.args[2]).toEqual(["ITEM", "RECIPE", "PLACE"]);
    // Items and recipes share one batched call.
    const states = calls.filter((call) => call.method === "wantToTryStates");
    expect(states).toHaveLength(1);
    expect(states[0]?.args[1]).toEqual([
      { kind: "ITEM", item: { type: "WINE", id: WINE } },
      { kind: "RECIPE", recipeId: RECIPE },
    ]);
  });

  it("passes null for omitted kinds, so it survives the wire", async () => {
    const { invoke, calls } = stubSidecar({
      "UserActor.wantToTry": () => page([]),
    });
    const result = await run(
      "{ me { wantToTry(first: 5) { totalCount } } }",
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls[0]?.args[2]).toBeNull();
  });

  it("Item.isWantToTry is false for an anonymous viewer, with no state call", async () => {
    const { invoke, calls } = stubSidecar({ "ItemActor.get": () => wine });
    const result = await run(
      `{ item(type: WINE, id: "${WINE}") {
           ... on QueryItemSuccess { data { isWantToTry } }
         } }`,
      testContext(invoke),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.item).toEqual({ data: { isWantToTry: false } });
    expect(calls.some((call) => call.method === "wantToTryStates")).toBe(false);
  });
});

describe("setWantToTry (X08)", () => {
  it("sends one target and the wanted state to the viewer's own actor", async () => {
    const { invoke, calls } = stubSidecar({
      "UserActor.setWantToTry": (_id, _ctx, target) => ({
        target,
        wantToTry: true,
        changed: true,
      }),
      "UserActor.wantToTryStates": () => [`wine:${WINE}`],
      "ItemActor.get": () => wine,
    });
    const result = await run(
      `mutation { setWantToTry(target: { itemType: WINE, itemId: "${WINE}" }, wantToTry: true) {
         __typename
         ... on SetWantToTryPayload { wantToTry changed kind key item { id isWantToTry } recipe { id } place { id } }
       } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.setWantToTry).toEqual({
      __typename: "SetWantToTryPayload",
      wantToTry: true,
      changed: true,
      kind: "ITEM",
      key: `wine:${WINE}`,
      item: { id: WINE, isWantToTry: true },
      recipe: null,
      place: null,
    });
    const set = calls.find((call) => call.method === "setWantToTry");
    expect(set).toMatchObject({ actorType: "UserActor", actorId: viewer.id });
    expect(set?.args.slice(1)).toEqual([
      { kind: "ITEM", item: { type: "WINE", id: WINE } },
      true,
    ]);
  });

  it("puts a refusal on the result union, not in `errors`", async () => {
    const { invoke } = stubSidecar({
      "UserActor.setWantToTry": () => {
        throw new ForbiddenError("nope");
      },
    });
    const result = await run(
      `mutation { setWantToTry(target: { placeId: "${PLACE}" }, wantToTry: false) {
         __typename ... on ActorError { message }
       } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.setWantToTry).toMatchObject({
      __typename: "ForbiddenError",
    });
  });

  it("is Forbidden for an anonymous viewer before any actor call", async () => {
    const { invoke, calls } = stubSidecar({});
    const result = await run(
      `mutation { setWantToTry(target: { recipeId: "${RECIPE}" }, wantToTry: true) { __typename } }`,
      testContext(invoke),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.setWantToTry).toEqual({ __typename: "ForbiddenError" });
    expect(calls).toEqual([]);
  });
});

describe("targetFromInput", () => {
  it("reads each kind of target", () => {
    expect(targetFromInput({ itemType: "TEA", itemId: WINE })).toEqual({
      kind: "ITEM",
      item: { type: "TEA", id: WINE },
    });
    expect(targetFromInput({ recipeId: RECIPE })).toEqual({
      kind: "RECIPE",
      recipeId: RECIPE,
    });
    expect(targetFromInput({ placeId: PLACE, itemType: null })).toEqual({
      kind: "PLACE",
      placeId: PLACE,
    });
  });

  it("refuses none, two, or half an item", () => {
    for (const input of [
      {},
      { recipeId: RECIPE, placeId: PLACE },
      { itemType: "WINE" as const, itemId: WINE, placeId: PLACE },
      { itemId: WINE },
      { itemType: "WINE" as const },
    ]) {
      expect(() => targetFromInput(input)).toThrow(ValidationError);
    }
  });
});
