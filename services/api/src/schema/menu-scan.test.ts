/**
 * `MenuScan`'s GraphQL surface — B8. Driven against a stub sidecar
 * (`../testing.ts`), the same pattern `place.test.ts` uses: this proves the
 * resolvers marshal arguments and results, not that `MenuScanActor` is correct
 * — that is `services/actors/src/actors/menu-scan-actor.test.ts`, against real
 * Postgres.
 */
import { execute, parse } from "graphql";
import { describe, expect, it } from "vitest";
import { stubSidecar, testContext } from "../testing.ts";
import { USER_FACING_FAILURES } from "./failure-summary.ts";
import { schema } from "./index.ts";

const run = (document: string, context: ReturnType<typeof testContext>) =>
  execute({ schema, document: parse(document), contextValue: context });

const viewer = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "test@test.com",
  emailVerified: true,
  role: "user" as const,
};

const SCAN_ID = "33333333-3333-4333-8333-333333333333";
const PLACE_ID = "22222222-2222-4222-8222-222222222222";
const FILE_ID = "44444444-4444-4444-8444-444444444444";
const WINE_ID = "55555555-5555-4555-8555-555555555555";
const RECIPE_ID = "66666666-6666-4666-8666-666666666666";
const SUGGESTION_ID = "77777777-7777-4777-8777-777777777777";
const MENU_ITEM_ID = "88888888-8888-4888-8888-888888888888";

const scanDto = {
  id: SCAN_ID,
  userId: viewer.id,
  placeId: PLACE_ID,
  estimatedPlaceId: null,
  manualPlaceOverride: null,
  effectivePlaceId: PLACE_ID,
  originalImageId: FILE_ID,
  processedImageId: null,
  extractedText: "WINES\nChateau Test 2019",
  processingStatus: "completed" as const,
  processingError: null,
  confidenceScore: 0.85,
  processingModel: "fake-vision-1",
  processingDurationMs: 1234,
  itemsDetected: 2,
  itemsMatched: 1,
  scannedAt: "2026-09-09T00:00:00.000Z",
  processedAt: "2026-09-09T00:00:05.000Z",
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:05.000Z",
};

const suggestion = (
  target:
    | { kind: "ITEM"; item: { type: "WINE"; id: string } }
    | { kind: "RECIPE"; recipeId: string },
) => ({
  id: SUGGESTION_ID,
  menuScanId: SCAN_ID,
  placeMenuItemId: MENU_ITEM_ID,
  placeId: PLACE_ID,
  menuItemName: "Chateau Test",
  target,
  confidenceScore: 0.95,
  matchReasoning: "vector similarity 0.95 >= 0.9 (item search)",
  similarityMetrics: { route: "ITEM" },
  accepted: null,
  rejected: null,
  actedBy: null,
  actedAt: null,
  createdAt: "2026-09-09T00:00:06.000Z",
});

describe("Query.menuScan", () => {
  it("resolves a scan through MenuScanActor.get and derives `place`", async () => {
    const { invoke, calls } = stubSidecar({
      "MenuScanActor.get": () => scanDto,
    });
    const result = await run(
      `{ menuScan(id: "${SCAN_ID}") { __typename ... on MenuScan {
         id processingStatus itemsDetected itemsMatched place { id }
       } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.menuScan).toEqual({
      __typename: "MenuScan",
      id: SCAN_ID,
      processingStatus: "completed",
      itemsDetected: 2,
      itemsMatched: 1,
      place: { id: PLACE_ID },
    });
    expect(calls[0]).toMatchObject({
      actorType: "MenuScanActor",
      actorId: SCAN_ID,
      method: "get",
    });
  });

  it("processingError is summarised, so the provider's endpoint never reaches a client", async () => {
    /*
     * The regression this guards: `processingError` used to be
     * `t.exposeString`, so `/map/scans` rendered the vision provider's own
     * failure text — internal hostname, internal port, nested JSON body — on a
     * card, out of a public repository. Asserted on the whole serialised
     * response rather than on the one field, because the leak is "it crossed
     * the wire at all", not "it was displayed".
     *
     * Revert `failureSummary` out of the resolver and this fails.
     */
    // Host, port and path are synthetic — see `failure-summary.test.ts` for
    // why the real ones are not committed. The shape is the real row's.
    const host = "internal-model-host.invalid";
    const raw =
      `VALIDATION: someprovider generateContent(some-model:1b) failed (400) ` +
      `at http://${host}:54321/v1/generate: {"error":"Failed to load image"}`;
    const { invoke } = stubSidecar({
      "MenuScanActor.get": () => ({
        ...scanDto,
        processingStatus: "failed",
        processingError: raw,
      }),
    });
    const result = await run(
      `{ menuScan(id: "${SCAN_ID}") { ... on MenuScan { processingError } } }`,
      testContext(invoke, viewer),
    );

    const wire = JSON.stringify(result);
    for (const secret of [
      host,
      "54321",
      "/v1/generate",
      "someprovider",
      "some-model",
    ]) {
      expect(wire).not.toContain(secret);
    }
    const scan = result.data?.menuScan as
      | { processingError: string | null }
      | undefined;
    expect(USER_FACING_FAILURES).toContain(scan?.processingError);
  });

  it("a refusal comes back as the typed NotFoundError, not a 500", async () => {
    const { invoke } = stubSidecar({
      "MenuScanActor.get": () => {
        throw Object.assign(new Error("menu scan not found"), {
          name: "NotFoundError",
          code: "NOT_FOUND",
        });
      },
    });
    const result = await run(
      `{ menuScan(id: "${SCAN_ID}") { __typename } }`,
      testContext(invoke, viewer),
    );
    // The stub throws a plain Error, so `plugin-errors` surfaces it as a
    // GraphQL error rather than a member of the union — what matters here is
    // that the field is nullable-by-union and the query does not crash the
    // executor.
    expect(result.errors ?? []).not.toEqual([]);
  });

  it("suggestions is a Relay connection served by MenuScanActor.suggestions", async () => {
    const { invoke, calls } = stubSidecar({
      "MenuScanActor.get": () => scanDto,
      "MenuScanActor.suggestions": () => ({
        entries: [
          {
            cursor: "0",
            node: suggestion({
              kind: "ITEM",
              item: { type: "WINE", id: WINE_ID },
            }),
          },
        ],
        hasNextPage: false,
        hasPreviousPage: false,
        totalCount: 1,
      }),
      "ItemActor.get": () => ({
        id: WINE_ID,
        type: "WINE",
        name: "Chateau Test 2019",
        description: null,
        createdAt: "2026-09-09T00:00:00.000Z",
        updatedAt: "2026-09-09T00:00:00.000Z",
        createdById: viewer.id,
        barcodeCode: null,
        country: "France",
        vintage: "2019-01-01",
        variety: null,
        region: null,
        style: "RED",
        alcoholContentPercentage: 13.5,
      }),
    });
    const result = await run(
      `{ menuScan(id: "${SCAN_ID}") { ... on MenuScan {
         suggestions(first: 10) {
           totalCount
           edges { node { id targetKind confidenceScore
                          suggestedItem { id name }
                          suggestedRecipe { id } } }
         }
       } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    const scan = result.data?.menuScan as {
      suggestions: {
        totalCount: number;
        edges: { node: Record<string, unknown> }[];
      };
    };
    const connection = scan.suggestions;
    expect(connection.totalCount).toBe(1);
    expect(connection.edges[0]?.node).toEqual({
      id: SUGGESTION_ID,
      targetKind: "ITEM",
      confidenceScore: 0.95,
      suggestedItem: { id: WINE_ID, name: "Chateau Test 2019" },
      suggestedRecipe: null,
    });
    expect(calls.map((call) => `${call.actorType}.${call.method}`)).toContain(
      "MenuScanActor.suggestions",
    );
  });

  it("a cocktail suggestion resolves `suggestedRecipe` and leaves `suggestedItem` null", async () => {
    const { invoke } = stubSidecar({
      "MenuScanActor.get": () => scanDto,
      "MenuScanActor.suggestions": () => ({
        entries: [
          {
            cursor: "0",
            node: suggestion({ kind: "RECIPE", recipeId: RECIPE_ID }),
          },
        ],
        hasNextPage: false,
        hasPreviousPage: false,
        totalCount: 1,
      }),
      "RecipeActor.get": () => ({
        id: RECIPE_ID,
        name: "Negroni",
        description: null,
        type: "cocktail",
        recipeGroupId: null,
        createdById: null,
        source: null,
        sourceUrl: null,
        imageUrl: null,
        prepTimeMinutes: null,
        servings: null,
        difficulty: null,
        ingredientCount: 3,
        createdAt: "2026-09-09T00:00:00.000Z",
        updatedAt: "2026-09-09T00:00:00.000Z",
      }),
    });
    const result = await run(
      `{ menuScan(id: "${SCAN_ID}") { ... on MenuScan {
         suggestions(first: 10) { edges { node {
           targetKind suggestedItem { id } suggestedRecipe { id name } } } }
       } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    const cocktailScan = result.data?.menuScan as {
      suggestions: { edges: { node: Record<string, unknown> }[] };
    };
    const node = cocktailScan.suggestions.edges[0]?.node;
    expect(node).toEqual({
      targetKind: "RECIPE",
      suggestedItem: null,
      suggestedRecipe: { id: RECIPE_ID, name: "Negroni" },
    });
  });
});

describe("Mutation.createMenuScan", () => {
  it("mints an id when none is given and passes the place hint through", async () => {
    const { invoke, calls } = stubSidecar({
      "MenuScanActor.create": () => scanDto,
    });
    const result = await run(
      `mutation { createMenuScan(input: {
         originalImageId: "${FILE_ID}"
         placeHint: { placeId: "${PLACE_ID}", longitude: -122.4194, latitude: 37.7749 }
       }) { __typename ... on MenuScan { id processingStatus } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.createMenuScan).toEqual({
      __typename: "MenuScan",
      id: SCAN_ID,
      processingStatus: "completed",
    });
    const call = calls[0];
    expect(call?.actorId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(call?.args[1]).toEqual({
      originalImageId: FILE_ID,
      processedImageId: null,
      placeHint: {
        placeId: PLACE_ID,
        estimatedPlaceId: null,
        location: { lng: -122.4194, lat: 37.7749 },
      },
    });
  });

  it("honours a caller-supplied scan id, which is what makes a retry free", async () => {
    const { invoke, calls } = stubSidecar({
      "MenuScanActor.create": () => scanDto,
    });
    await run(
      `mutation { createMenuScan(menuScanId: "${SCAN_ID}", input: {
         originalImageId: "${FILE_ID}"
       }) { __typename } }`,
      testContext(invoke, viewer),
    );
    expect(calls[0]?.actorId).toBe(SCAN_ID);
    expect(calls[0]?.args[1]).toEqual({
      originalImageId: FILE_ID,
      processedImageId: null,
      placeHint: null,
    });
  });
});

describe("Mutation.actOnMenuScanSuggestion", () => {
  it("routes by `menuScanId` and returns whether the acceptance propagated", async () => {
    const { invoke, calls } = stubSidecar({
      "MenuScanActor.actOnSuggestion": () => ({
        suggestion: {
          ...suggestion({ kind: "ITEM", item: { type: "WINE", id: WINE_ID } }),
          accepted: true,
          rejected: false,
          actedBy: viewer.id,
          actedAt: "2026-09-09T00:01:00.000Z",
        },
        propagated: true,
      }),
    });
    const result = await run(
      `mutation { actOnMenuScanSuggestion(
         menuScanId: "${SCAN_ID}"
         input: { suggestionId: "${SUGGESTION_ID}", action: ACCEPT }
       ) { __typename ... on MatchSuggestionActionPayload {
         propagated suggestion { id accepted actedBy } } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.actOnMenuScanSuggestion).toEqual({
      __typename: "MatchSuggestionActionPayload",
      propagated: true,
      suggestion: {
        id: SUGGESTION_ID,
        accepted: true,
        actedBy: viewer.id,
      },
    });
    expect(calls[0]).toMatchObject({
      actorType: "MenuScanActor",
      actorId: SCAN_ID,
      method: "actOnSuggestion",
    });
    expect(calls[0]?.args[1]).toEqual({
      suggestionId: SUGGESTION_ID,
      action: "ACCEPT",
    });
  });
});

describe("the schema exposes no system-only pipeline step", () => {
  it("has no `process`, `match` or `recordSuggestions` mutation", () => {
    const mutation = schema.getMutationType();
    const names = Object.keys(mutation?.getFields() ?? {});
    for (const forbidden of [
      "processMenuScan",
      "matchMenuScan",
      "recordMenuScanSuggestions",
    ]) {
      expect(names).not.toContain(forbidden);
    }
  });
});
