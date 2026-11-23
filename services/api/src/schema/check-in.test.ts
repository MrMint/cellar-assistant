/**
 * X02's drink-log surface: `logDrink`, `updateDrinkLog`, `deleteDrinkLog`,
 * `suggestFlavourTags`, `Item.checkIns(scope:)` and the CHECKED_IN feed entry;
 * and X03's follow-ups: `drankAt`, `setDrinkLogCompanions`, `restoreDrinkLog`.
 *
 * Each maps onto one `CheckInActor` (or collection actor) call, addressed by
 * the id the client minted, and no visibility is decided here.
 */
import {
  ForbiddenError,
  itemActorId,
  NotFoundError,
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
const FRIEND = "22222222-2222-4222-8222-222222222222";
const WINE_ID = "33333333-3333-4333-8333-333333333333";
const LOG_ID = "44444444-4444-4444-8444-444444444444";
const PLACE_ID = "55555555-5555-4555-8555-555555555555";

const entry = {
  id: LOG_ID,
  userId: viewer.id,
  createdById: viewer.id,
  item: { type: "WINE" as const, id: WINE_ID } as {
    type: "WINE";
    id: string;
  } | null,
  recipe: null as { id: string } | null,
  score: 4,
  note: "dark cherry",
  tags: ["cherry"],
  placeId: PLACE_ID,
  photoFileId: null,
  companionIds: [FRIEND],
  fromCellar: false,
  createdAt: "2026-10-08T20:00:00.000Z",
  updatedAt: "2026-10-08T20:00:00.000Z",
};

describe("logDrink", () => {
  it("addresses CheckInActor by the client's id and passes only what was given", async () => {
    const { invoke, calls } = stubSidecar({
      "CheckInActor.log": () => ({
        entry,
        rows: [
          { id: LOG_ID, userId: viewer.id },
          { id: "x", userId: FRIEND },
        ],
        cellarItemId: null,
      }),
    });
    const result = await run(
      `mutation { logDrink(id: "${LOG_ID}", input: {
           item: { type: WINE, id: "${WINE_ID}" },
           score: 4, note: "dark cherry", tags: ["Cherry"],
           placeId: "${PLACE_ID}", companionIds: ["${FRIEND}"]
         }) { __typename ... on LoggedDrinkPayload {
           drinkerCount entryIds
           entry { id score note tags isMine canRemove fromCellar
                   place { id } companionIds }
         } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls[0]?.actorId).toBe(LOG_ID);
    expect(calls[0]?.args.slice(1)).toEqual([
      {
        item: { type: "WINE", id: WINE_ID },
        score: 4,
        note: "dark cherry",
        tags: ["Cherry"],
        placeId: PLACE_ID,
        companionIds: [FRIEND],
      },
    ]);
    expect(result.data?.logDrink).toEqual({
      __typename: "LoggedDrinkPayload",
      drinkerCount: 2,
      entryIds: [LOG_ID, "x"],
      entry: {
        id: LOG_ID,
        score: 4,
        note: "dark cherry",
        tags: ["cherry"],
        isMine: true,
        canRemove: true,
        fromCellar: false,
        place: { id: PLACE_ID },
        companionIds: [FRIEND],
      },
    });
  });

  it("surfaces a refusal on the result union", async () => {
    const { invoke } = stubSidecar({
      "CheckInActor.log": () => {
        throw new ForbiddenError("cannot log on behalf of x: not a friend");
      },
    });
    const result = await run(
      `mutation { logDrink(input: { item: { type: WINE, id: "${WINE_ID}" } }) {
           __typename ... on ActorError { code } } }`,
      testContext(invoke, viewer),
    );
    expect(result.data?.logDrink).toEqual({
      __typename: "ForbiddenError",
      code: "FORBIDDEN",
    });
  });
});

describe("ux-c L08 · Made it — a recipe-only log", () => {
  const RECIPE_ID = "66666666-6666-4666-8666-666666666666";
  const recipeEntry = { ...entry, item: null, recipe: { id: RECIPE_ID } };
  const recipeDto = {
    id: RECIPE_ID,
    name: "Negroni",
    description: null,
    type: "cocktail" as const,
    createdById: FRIEND,
    recipeGroupId: "77777777-7777-4777-8777-777777777777",
    canonicalRecipeId: null,
    difficultyLevel: 2,
    prepTimeMinutes: 5,
    servingSize: 1,
    imageUrl: null,
    version: 1,
    ingredientCount: 0,
    instructionCount: 0,
    createdAt: "2026-10-08T20:00:00.000Z",
    updatedAt: "2026-10-08T20:00:00.000Z",
  };

  it("passes recipeId alone, and the entry has a recipe and no item", async () => {
    const { invoke, calls } = stubSidecar({
      "CheckInActor.log": () => ({
        entry: recipeEntry,
        rows: [{ id: LOG_ID, userId: viewer.id }],
        cellarItemId: null,
      }),
      "RecipeActor.get": () => recipeDto,
    });
    const result = await run(
      `mutation { logDrink(id: "${LOG_ID}", input: { recipeId: "${RECIPE_ID}" }) {
           __typename ... on LoggedDrinkPayload {
             entry { id item { id } recipe { id name } } } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls[0]?.args.slice(1)).toEqual([{ recipeId: RECIPE_ID }]);
    expect(result.data?.logDrink).toEqual({
      __typename: "LoggedDrinkPayload",
      entry: {
        id: LOG_ID,
        item: null,
        recipe: { id: RECIPE_ID, name: "Negroni" },
      },
    });
  });

  it("a recipe the viewer can no longer load reads as null, not a field error", async () => {
    const { invoke } = stubSidecar({
      "CheckInActor.get": () => recipeEntry,
      "CheckInActor.update": () => recipeEntry,
      "RecipeActor.get": () => {
        throw new NotFoundError(`recipe ${RECIPE_ID} not found`);
      },
    });
    const result = await run(
      `mutation { updateDrinkLog(id: "${LOG_ID}", input: { note: "x" }) {
           __typename ... on ItemCheckIn { item { id } recipe { id } } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.updateDrinkLog).toEqual({
      __typename: "ItemCheckIn",
      item: null,
      recipe: null,
    });
  });
});

describe("updateDrinkLog / deleteDrinkLog", () => {
  it("update sends a patch, null clearing", async () => {
    const { invoke, calls } = stubSidecar({
      "CheckInActor.update": () => ({ ...entry, score: null }),
    });
    const result = await run(
      `mutation { updateDrinkLog(id: "${LOG_ID}", input: { score: null, tags: [] }) {
           __typename ... on ItemCheckIn { score } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls[0]?.args.slice(1)).toEqual([{ score: null, tags: [] }]);
    expect(result.data?.updateDrinkLog).toEqual({
      __typename: "ItemCheckIn",
      score: null,
    });
  });

  it("delete returns every id removed", async () => {
    const { invoke, calls } = stubSidecar({
      "CheckInActor.remove": () => ({ ids: [LOG_ID, "x"] }),
    });
    const result = await run(
      `mutation { deleteDrinkLog(id: "${LOG_ID}") {
           __typename ... on DeletedDrinkLogPayload { ids } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls[0]?.actorId).toBe(LOG_ID);
    expect(result.data?.deleteDrinkLog).toEqual({
      __typename: "DeletedDrinkLogPayload",
      ids: [LOG_ID, "x"],
    });
  });
});

describe("X03 follow-ups", () => {
  it("logDrink passes drankAt through as an instant", async () => {
    const { invoke, calls } = stubSidecar({
      "CheckInActor.log": () => ({
        entry,
        rows: [{ id: LOG_ID, userId: viewer.id }],
        cellarItemId: null,
      }),
    });
    const result = await run(
      `mutation { logDrink(id: "${LOG_ID}", input: {
           item: { type: WINE, id: "${WINE_ID}" },
           drankAt: "2026-10-01T18:00:00.000Z"
         }) { __typename } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls[0]?.args.slice(1)).toEqual([
      {
        item: { type: "WINE", id: WINE_ID },
        drankAt: "2026-10-01T18:00:00.000Z",
      },
    ]);
  });

  it("setDrinkLogCompanions sends the whole set to the entry's actor", async () => {
    const { invoke, calls } = stubSidecar({
      "CheckInActor.setCompanions": () => ({ ...entry, companionIds: [] }),
    });
    const result = await run(
      `mutation { setDrinkLogCompanions(id: "${LOG_ID}", companionIds: []) {
           __typename ... on ItemCheckIn { companionIds } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls[0]?.actorId).toBe(LOG_ID);
    expect(calls[0]?.args.slice(1)).toEqual([{ companionIds: [] }]);
    expect(result.data?.setDrinkLogCompanions).toEqual({
      __typename: "ItemCheckIn",
      companionIds: [],
    });
  });

  it("restoreDrinkLog answers the ids and the entry put back", async () => {
    const { invoke, calls } = stubSidecar({
      "CheckInActor.restore": () => ({ ids: [LOG_ID, "x"], entry }),
    });
    const result = await run(
      `mutation { restoreDrinkLog(id: "${LOG_ID}") {
           __typename ... on RestoredDrinkLogPayload { ids entry { id createdAt } } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls[0]?.actorId).toBe(LOG_ID);
    expect(result.data?.restoreDrinkLog).toEqual({
      __typename: "RestoredDrinkLogPayload",
      ids: [LOG_ID, "x"],
      entry: { id: LOG_ID, createdAt: entry.createdAt },
    });
  });
});

describe("suggestFlavourTags", () => {
  it("returns the suggestions as a connection, and an abstention as abstained", async () => {
    const { invoke, calls } = stubSidecar({
      "CheckInActor.suggestFlavourTags": () => ({
        abstained: false,
        tags: [{ tag: "cherry", evidence: "dark cherry" }],
      }),
    });
    const result = await run(
      `mutation { suggestFlavourTags(logId: "${LOG_ID}", note: "dark cherry",
           itemType: WINE, existing: ["smoky"]) {
           __typename ... on FlavourTagSuggestionsPayload {
             abstained suggestions(first: 6) { edges { node { tag evidence } } }
           } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(calls[0]?.args.slice(1)).toEqual([
      { note: "dark cherry", itemType: "WINE", existing: ["smoky"] },
    ]);
    expect(result.data?.suggestFlavourTags).toEqual({
      __typename: "FlavourTagSuggestionsPayload",
      abstained: false,
      suggestions: {
        edges: [{ node: { tag: "cherry", evidence: "dark cherry" } }],
      },
    });
  });
});

describe("Item.checkIns(scope:)", () => {
  it("passes MINE through to the collection actor, ALL by default", async () => {
    const wine = {
      id: WINE_ID,
      type: "WINE" as const,
      name: "Barolo",
      description: null,
      country: null,
      barcodeCode: null,
      createdById: viewer.id,
      createdAt: "2026-09-09T00:00:00.000Z",
      updatedAt: "2026-09-09T00:00:00.000Z",
      vintage: null,
      variety: null,
      region: null,
      style: "RED",
      specialDesignation: null,
      vineyardDesignation: null,
      alcoholContentPercentage: null,
      barcodeType: null,
      itemOnboardingId: null,
    };
    const { invoke, calls } = stubSidecar({
      "ItemActor.get": () => wine,
      "CheckInsCollectionActor.list": () => ({
        entries: [{ cursor: "c1", node: entry }],
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: "c1",
        endCursor: "c1",
        totalCount: 1,
      }),
    });
    const result = await run(
      `{ item(type: WINE, id: "${WINE_ID}") { ... on QueryItemSuccess {
           data {
             mine: checkIns(first: 5, scope: MINE) { totalCount }
             all: checkIns(first: 5) { totalCount }
           } } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    const lists = calls.filter((c) => c.method === "list");
    expect(lists.map((c) => c.args.at(-1))).toEqual(["MINE", "ALL"]);
    expect(itemActorId({ type: "WINE", id: WINE_ID })).toContain(WINE_ID);
  });
});
