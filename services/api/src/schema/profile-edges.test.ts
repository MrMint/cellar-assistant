/**
 * Profile edges (UI parity G4), executed against a stub sidecar.
 *
 * The property worth a test of its own is the cost: every edge is an id handed
 * to the `UserProfile` DataLoader, so a page costs one `UserActor.getProfile`
 * per **distinct** user, however many rows name them. The first test counts
 * those calls across five edge types in one document. The rest pin the two
 * rules the edges must not widen: an anonymous viewer gets no profile and
 * costs no call, and an object the viewer was refused resolves no edge.
 */
import type { PageArgs } from "@cellar-assistant/contracts";
import { NotFoundError, offsetPage } from "@cellar-assistant/contracts";
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

const ALICE = "a1111111-1111-4111-8111-111111111111";
const BOB = "b2222222-2222-4222-8222-222222222222";
const CAROL = "c3333333-3333-4333-8333-333333333333";
const WINE_ID = "33333333-3333-4333-8333-333333333333";
const TIER_LIST_ID = "44444444-4444-4444-8444-444444444444";
const RECIPE_ID = "55555555-5555-4555-8555-555555555555";

const stamp = "2026-09-09T00:00:00.000Z";
const counts = {
  total: 0,
  byType: { WINE: 0, BEER: 0, SPIRIT: 0, COFFEE: 0, SAKE: 0, TEA: 0 },
};

const cellarDto = (id: string, createdById: string, coOwnerIds: string[]) => ({
  id,
  name: `Cellar ${id.slice(0, 4)}`,
  privacy: "PUBLIC" as const,
  createdById,
  coOwnerIds,
  itemCount: 0,
  itemCounts: counts,
  createdAt: stamp,
  updatedAt: stamp,
});

const CELLARS = {
  "c0000001-0000-4000-8000-000000000001": cellarDto(
    "c0000001-0000-4000-8000-000000000001",
    ALICE,
    [BOB, CAROL],
  ),
  "c0000002-0000-4000-8000-000000000002": cellarDto(
    "c0000002-0000-4000-8000-000000000002",
    ALICE,
    [BOB],
  ),
  "c0000003-0000-4000-8000-000000000003": cellarDto(
    "c0000003-0000-4000-8000-000000000003",
    BOB,
    [],
  ),
};

const profile = (id: string) => ({
  id,
  displayName: `user ${id.slice(0, 1)}`,
  avatarUrl: null,
  locale: null,
  email: null,
});

const wine = {
  id: WINE_ID,
  type: "WINE" as const,
  name: "Test Wine",
  description: null,
  createdAt: stamp,
  updatedAt: stamp,
  createdById: viewer.id,
  barcodeCode: null,
  country: null,
  vintage: null,
  variety: null,
  region: null,
  style: "RED",
  alcoholContentPercentage: null,
};

const page = <T>(rows: readonly T[], args: unknown) =>
  offsetPage(rows, args as PageArgs);

const sidecar = () =>
  stubSidecar({
    "CellarsCollectionActor.list": (_id, _ctx, args) =>
      page(Object.keys(CELLARS), args),
    "CellarActor.get": (id) => CELLARS[id as keyof typeof CELLARS],
    "CellarActor.checkIns": (id, _ctx, args) =>
      page(
        [
          {
            id: `ci-${id}`,
            userId: CAROL,
            cellarItemId: "x",
            createdAt: stamp,
            updatedAt: stamp,
          },
        ],
        args,
      ),
    "ItemActor.get": () => wine,
    "ItemActor.reviews": (_id, _ctx, args) =>
      page(
        [ALICE, BOB, ALICE].map((userId, index) => ({
          id: `r${index}`,
          itemId: WINE_ID,
          itemType: "WINE",
          userId,
          score: 4,
          text: null,
          createdAt: stamp,
          updatedAt: stamp,
        })),
        args,
      ),
    "CheckInsCollectionActor.list": (_id, _ctx, _ref, args) =>
      page(
        [BOB, CAROL].map((userId, index) => ({
          id: `ic${index}`,
          userId,
          item: { type: "WINE", id: WINE_ID },
          createdAt: stamp,
          updatedAt: stamp,
        })),
        args,
      ),
    "TierListActor.get": () => ({
      id: TIER_LIST_ID,
      name: "List",
      description: null,
      createdById: ALICE,
      privacy: "PUBLIC" as const,
      listType: "item",
      isEditingLocked: false,
      itemCount: 0,
      aiInsights: null,
      insightsGeneratedAt: null,
      contentUpdatedAt: stamp,
      createdAt: stamp,
      updatedAt: stamp,
    }),
    "RecipeActor.get": () => ({
      id: RECIPE_ID,
      name: "Negroni",
      description: null,
      type: "cocktail" as const,
      createdById: viewer.id,
      recipeGroupId: "66666666-6666-4666-8666-666666666666",
      canonicalRecipeId: null,
      difficultyLevel: 2,
      prepTimeMinutes: 5,
      servingSize: 1,
      imageUrl: null,
      version: 1,
      ingredientCount: 0,
      instructionCount: 0,
      createdAt: stamp,
      updatedAt: stamp,
    }),
    "RecipeActor.reviews": (_id, _ctx, args) =>
      page(
        [
          {
            id: "rr1",
            recipeId: RECIPE_ID,
            userId: CAROL,
            score: 5,
            text: null,
            createdAt: stamp,
            updatedAt: stamp,
          },
        ],
        args,
      ),
    "UserActor.getProfile": (id) => profile(id),
  });

const EVERY_EDGE = `{
  myCellars(first: 10) { ... on CellarConnection { edges { node {
    id
    createdBy { id displayName }
    coOwners(first: 10) { totalCount edges { node { id displayName } } }
    checkIns(first: 5) { edges { node { id user { id } } } }
  } } } }
  item(type: WINE, id: "${WINE_ID}") { ... on QueryItemSuccess { data {
    reviews(first: 10) { edges { node { id user { id displayName } } } }
    checkIns(first: 10) { edges { node { id user { id } } } }
  } } }
  tierList(id: "${TIER_LIST_ID}") { ... on TierList { createdBy { id } } }
  recipe(id: "${RECIPE_ID}") { ... on Recipe {
    reviews(first: 5) { edges { node { id user { id } } } }
  } }
}`;

describe("profile edges (UI parity G4)", () => {
  it("costs one getProfile per distinct user, however many rows name them", async () => {
    const { invoke, calls } = sidecar();
    const result = await run(EVERY_EDGE, testContext(invoke, viewer));
    expect(result.errors).toBeUndefined();

    // 3 cellars × (creator + co-owners + check-in user) + 3 item reviews +
    // 2 item check-ins + 1 tier list + 1 recipe review = 19 edges, naming
    // only three people.
    const profileCalls = calls.filter((call) => call.method === "getProfile");
    expect(profileCalls.map((call) => call.actorId).sort()).toEqual(
      [ALICE, BOB, CAROL].sort(),
    );

    const data = result.data as {
      myCellars: {
        edges: {
          node: {
            createdBy: { id: string };
            coOwners: { totalCount: number; edges: { node: { id: string } }[] };
          };
        }[];
      };
      tierList: { createdBy: { id: string } };
    };
    const first = data.myCellars.edges[0]?.node;
    expect(first?.createdBy.id).toBe(ALICE);
    expect(first?.coOwners.totalCount).toBe(2);
    expect(first?.coOwners.edges.map((edge) => edge.node.id)).toEqual([
      BOB,
      CAROL,
    ]);
    expect(data.tierList.createdBy.id).toBe(ALICE);
  });

  it("an anonymous viewer gets null / empty edges and costs no profile call", async () => {
    const { invoke, calls } = sidecar();
    const result = await run(
      `{ cellar(id: "c0000001-0000-4000-8000-000000000001") { ... on Cellar {
           createdBy { id }
           coOwners(first: 10) { totalCount edges { node { id } } }
         } } }`,
      testContext(invoke, null),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.cellar).toEqual({
      createdBy: null,
      coOwners: { totalCount: 0, edges: [] },
    });
    expect(calls.filter((call) => call.method === "getProfile")).toEqual([]);
  });

  it("a refused tier list resolves no creator profile", async () => {
    const { invoke, calls } = stubSidecar({
      "TierListActor.get": () => {
        throw new NotFoundError("TierListActor(x) has no row");
      },
      "UserActor.getProfile": (id) => profile(id),
    });
    const result = await run(
      `{ tierList(id: "${TIER_LIST_ID}") {
           __typename ... on TierList { createdBy { id } }
         } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.tierList).toEqual({ __typename: "NotFoundError" });
    expect(calls.map((call) => call.method)).toEqual(["get"]);
  });

  it("Recipe.createdBy (wave C) resolves the author through the loader, null when gone or anonymous", async () => {
    const { invoke, calls } = sidecar();
    const result = await run(
      `{ recipe(id: "${RECIPE_ID}") { ... on Recipe { createdBy { id } } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.recipe).toEqual({ createdBy: { id: viewer.id } });
    expect(
      calls
        .filter((call) => call.method === "getProfile")
        .map((c) => c.actorId),
    ).toEqual([viewer.id]);

    const anonymous = sidecar();
    const anon = await run(
      `{ recipe(id: "${RECIPE_ID}") { ... on Recipe { createdBy { id } } } }`,
      testContext(anonymous.invoke, null),
    );
    expect(JSON.stringify(anon.data)).not.toContain(viewer.id);
    expect(
      anonymous.calls.filter((call) => call.method === "getProfile"),
    ).toEqual([]);

    const orphan = stubSidecar({
      "RecipeActor.get": () => ({
        id: RECIPE_ID,
        name: "Orphan",
        description: null,
        type: "cocktail" as const,
        createdById: null,
        recipeGroupId: null,
        canonicalRecipeId: null,
        difficultyLevel: null,
        prepTimeMinutes: null,
        servingSize: null,
        imageUrl: null,
        version: 1,
        ingredientCount: 0,
        instructionCount: 0,
        createdAt: stamp,
        updatedAt: stamp,
      }),
    });
    const gone = await run(
      `{ recipe(id: "${RECIPE_ID}") { ... on Recipe { createdBy { id } } } }`,
      testContext(orphan.invoke, viewer),
    );
    expect(gone.errors).toBeUndefined();
    expect(gone.data?.recipe).toEqual({ createdBy: null });
    expect(orphan.calls.map((call) => call.method)).toEqual(["get"]);
  });
});
