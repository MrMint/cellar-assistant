/**
 * The item schema, executed against a stub sidecar (B2).
 *
 * `services/actors/src/actors/item-actor.test.ts` proves the behaviour against
 * real Postgres. This file proves the half that lives here, and the first
 * block is B2's headline acceptance:
 *
 * > the `Item` interface resolves all six concrete types through one field,
 * > and a query selecting interface fields works across types.
 *
 * The rest is the usual §8.3 shape: one actor call per field with `ctx`
 * already bound, typed errors on the result union, and no unbounded list.
 */
import { ForbiddenError, NotFoundError } from "@cellar-assistant/contracts";
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

const core = (id: string, name: string) => ({
  id,
  name,
  description: null,
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
  createdById: viewer.id,
  barcodeCode: null,
  country: "FRANCE",
});

/** One row per physical table, in the shape `ItemActor.get` returns. */
const ITEMS = {
  "wine:w1": {
    ...core("w1", "A Wine"),
    type: "WINE" as const,
    vintage: "2019-01-01",
    variety: "PINOT_NOIR",
    region: "Burgundy",
    style: "RED",
    alcoholContentPercentage: 13.5,
  },
  "beer:b1": {
    ...core("b1", "A Beer"),
    type: "BEER" as const,
    style: "ALTBIER",
    vintage: null,
    internationalBitternessUnit: 30,
    alcoholContentPercentage: 5,
  },
  "spirit:s1": {
    ...core("s1", "A Spirit"),
    type: "SPIRIT" as const,
    spiritType: "BOURBON",
    style: null,
    vintage: null,
    alcoholContentPercentage: 40,
  },
  "coffee:c1": {
    ...core("c1", "A Coffee"),
    type: "COFFEE" as const,
    roastLevel: "MEDIUM",
    process: "WASHED",
    species: "ARABICA",
    cultivar: null,
  },
  "sake:k1": {
    ...core("k1", "A Sake"),
    type: "SAKE" as const,
    category: "daiginjo",
    sakeType: null,
    region: null,
    polishGrade: 40,
    alcoholContentPercentage: 15,
  },
  "tea:t1": {
    ...core("t1", "A Tea"),
    type: "TEA" as const,
    category: "black",
    form: "loose_leaf",
    caffeineLevel: "medium",
    region: "Assam",
    harvestYear: 2024,
  },
} as const;

const ACTOR_IDS = Object.keys(ITEMS) as (keyof typeof ITEMS)[];

const itemSidecar = () =>
  stubSidecar({
    "ItemActor.get": (actorId) => ITEMS[actorId as keyof typeof ITEMS],
    "FavoritesCollectionActor.list": () => ({
      entries: ACTOR_IDS.map((key, index) => ({
        cursor: `offset:${index}`,
        node: { type: ITEMS[key].type, id: ITEMS[key].id },
      })),
      hasNextPage: false,
      hasPreviousPage: false,
      totalCount: ACTOR_IDS.length,
    }),
  });

/* -------------------------------------------------------------------------- */
/* The acceptance: one interface, six tables                                   */
/* -------------------------------------------------------------------------- */

describe("the Item interface resolves all six concrete types (§2.1)", () => {
  it("returns every type through one field, selecting interface fields across them", async () => {
    const { invoke, calls } = itemSidecar();
    const result = await run(
      `{
        me {
          favorites(first: 6) {
            totalCount
            edges {
              node {
                __typename
                id
                name
                type
                country
                createdById
                ... on Wine { variety style vintage }
                ... on Beer { internationalBitternessUnit }
                ... on Spirit { spiritType }
                ... on Coffee { roastLevel species }
                ... on Sake { category polishGrade }
                ... on Tea { form caffeineLevel harvestYear }
              }
            }
          }
        }
      }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    const me = result.data?.me as { favorites: { edges: unknown[] } };
    const favorites = me.favorites;
    expect(favorites).toMatchObject({ totalCount: 6 });
    expect(
      (favorites.edges as { node: { __typename: string } }[]).map(
        (edge) => edge.node.__typename,
      ),
    ).toEqual(["Wine", "Beer", "Spirit", "Coffee", "Sake", "Tea"]);

    // The interface's own fields answer for every one of them.
    const nodes = (favorites.edges as { node: Record<string, unknown> }[]).map(
      (edge) => edge.node,
    );
    expect(nodes.map((node) => node.type)).toEqual([
      "WINE",
      "BEER",
      "SPIRIT",
      "COFFEE",
      "SAKE",
      "TEA",
    ]);
    expect(nodes.every((node) => node.country === "FRANCE")).toBe(true);
    expect(nodes.every((node) => node.createdById === viewer.id)).toBe(true);

    // …and the per-type fields come from the right table.
    expect(nodes[0]).toMatchObject({ variety: "PINOT_NOIR", style: "RED" });
    expect(nodes[2]).toMatchObject({ spiritType: "BOURBON" });
    expect(nodes[5]).toMatchObject({ form: "loose_leaf", harvestYear: 2024 });

    // §1.5: one collection call, then the six items batched into parallel
    // entity calls — not a call per edge.
    expect(calls.filter((call) => call.method === "list")).toHaveLength(1);
    expect(
      calls.filter((call) => call.method === "get").map((call) => call.actorId),
    ).toEqual([...ACTOR_IDS]);
  });

  for (const actorId of ACTOR_IDS) {
    const item = ITEMS[actorId];
    it(`Query.item resolves a ${item.type} through the same interface`, async () => {
      const { invoke, calls } = itemSidecar();
      const result = await run(
        `{
          item(type: ${item.type}, id: "${item.id}") {
            __typename
            ... on QueryItemSuccess { data { __typename id name type } }
            ... on ActorError { code message }
          }
        }`,
        testContext(invoke, viewer),
      );
      expect(result.errors).toBeUndefined();
      expect(result.data?.item).toEqual({
        __typename: "QueryItemSuccess",
        data: {
          __typename: item.type[0] + item.type.slice(1).toLowerCase(),
          id: item.id,
          name: item.name,
          type: item.type,
        },
      });
      expect(calls[0]).toMatchObject({
        actorType: "ItemActor",
        actorId,
        method: "get",
      });
      // §8.2: `ctx` first, already bound by the resolver.
      expect(calls[0]?.args[0]).toMatchObject({ viewerId: viewer.id });
    });
  }
});

/* -------------------------------------------------------------------------- */
/* The satellites                                                              */
/* -------------------------------------------------------------------------- */

describe("Item satellites are paged from the owning actor (§1.5)", () => {
  it("score, images, reviews and brands are one actor call each", async () => {
    const empty = {
      entries: [],
      hasNextPage: false,
      hasPreviousPage: false,
      totalCount: 0,
    };
    const { invoke, calls } = stubSidecar({
      "ItemActor.get": (actorId) => ITEMS[actorId as keyof typeof ITEMS],
      "ItemActor.score": () => ({ average: 4.25, count: 4 }),
      "ItemActor.images": () => ({
        entries: [
          {
            cursor: "offset:0",
            node: {
              id: "i1",
              itemId: "w1",
              itemType: "WINE",
              fileId: "f1",
              userId: viewer.id,
              isPublic: true,
              placeholder: null,
              createdAt: "2026-09-09T00:00:00.000Z",
              updatedAt: "2026-09-09T00:00:00.000Z",
            },
          },
        ],
        hasNextPage: false,
        hasPreviousPage: false,
        totalCount: 1,
      }),
      "ItemActor.reviews": () => empty,
      "ItemActor.brands": () => empty,
    });
    const result = await run(
      `{
        item(type: WINE, id: "w1") {
          ... on QueryItemSuccess {
            data {
              score { average count }
              images(first: 10) { totalCount edges { node { id isPublic fileId } } }
              reviews(first: 10) { totalCount }
              brands(first: 10) { totalCount }
            }
          }
        }
      }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    const item = result.data?.item as { data: Record<string, unknown> };
    const data = item.data;
    expect(data.score).toEqual({ average: 4.25, count: 4 });
    expect(data.images).toMatchObject({
      totalCount: 1,
      edges: [{ node: { id: "i1", isPublic: true, fileId: "f1" } }],
    });
    expect(calls.map((call) => call.method).filter((m) => m !== "get")).toEqual(
      ["score", "images", "reviews", "brands"],
    );
  });

  it("refuses backward paging on a satellite", async () => {
    const { invoke } = itemSidecar();
    const result = await run(
      `{ item(type: WINE, id: "w1") { ... on QueryItemSuccess {
           data { reviews(last: 3) { totalCount } } } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors?.[0]?.message).toMatch(/backward pagination/);
  });
});

/* -------------------------------------------------------------------------- */
/* Mutations                                                                   */
/* -------------------------------------------------------------------------- */

describe("item mutations (§8.3)", () => {
  it("createItem mints the id and addresses ItemActor(type:id)", async () => {
    const { invoke, calls } = stubSidecar({
      "ItemActor.create": (actorId) => ({
        ...ITEMS["wine:w1"],
        id: actorId.slice("wine:".length),
      }),
    });
    const result = await run(
      `mutation {
        createItem(
          type: WINE
          itemId: "w9"
          input: {
            name: "New Wine"
            itemOnboardingId: "o1"
            wine: { vintage: "2020-01-01", style: "RED" }
          }
        ) {
          __typename
          ... on MutationCreateItemSuccess { data { id type } }
        }
      }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.createItem).toMatchObject({
      __typename: "MutationCreateItemSuccess",
      data: { id: "w9", type: "WINE" },
    });
    expect(calls[0]).toMatchObject({
      actorType: "ItemActor",
      actorId: "wine:w9",
      method: "create",
    });
    // The attribute bag arrives as the actor's `CreateItemInput`, not as
    // GraphQL's own shape.
    expect(calls[0]?.args[1]).toMatchObject({
      name: "New Wine",
      itemOnboardingId: "o1",
      wine: { vintage: "2020-01-01", style: "RED" },
    });
  });

  it("updateItem by a non-creator lands on the typed error union", async () => {
    const { invoke } = stubSidecar({
      "ItemActor.update": () => {
        throw new ForbiddenError("only the creator of wine:w1 may update it");
      },
    });
    const result = await run(
      `mutation {
        updateItem(type: WINE, itemId: "w1", input: { name: "Nope" }) {
          __typename
          ... on ActorError { code message }
        }
      }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.updateItem).toEqual({
      __typename: "ForbiddenError",
      code: "FORBIDDEN",
      message: "only the creator of wine:w1 may update it",
    });
  });

  it("attachItemImage passes the file id through unchanged", async () => {
    const { invoke, calls } = stubSidecar({
      "ItemActor.attachImage": () => ({
        id: "i1",
        itemId: "w1",
        itemType: "WINE",
        fileId: "f1",
        userId: viewer.id,
        isPublic: true,
        placeholder: null,
        createdAt: "2026-09-09T00:00:00.000Z",
        updatedAt: "2026-09-09T00:00:00.000Z",
      }),
    });
    const result = await run(
      `mutation {
        attachItemImage(
          type: WINE, itemId: "w1"
          input: { fileId: "f1", isPublic: true, imageId: "i1" }
        ) { __typename ... on ItemImage { id fileId } }
      }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.attachItemImage).toMatchObject({
      __typename: "ItemImage",
      fileId: "f1",
    });
    expect(calls[0]?.args[1]).toMatchObject({
      fileId: "f1",
      isPublic: true,
      imageId: "i1",
    });
  });

  it("addItemReview sends `text` as a JSON string, which is what the column holds", async () => {
    const { invoke, calls } = stubSidecar({
      "ItemActor.addReview": (_id, _ctx, input) => ({
        id: "r1",
        itemId: "w1",
        itemType: "WINE",
        userId: viewer.id,
        score: (input as { score: number }).score,
        text: (input as { text: string | null }).text,
        createdAt: "2026-09-09T00:00:00.000Z",
        updatedAt: "2026-09-09T00:00:00.000Z",
      }),
    });
    const result = await run(
      `mutation {
        addItemReview(
          type: WINE, itemId: "w1"
          input: { score: 4.5, text: { note: "cherry" } }
        ) { __typename ... on ItemReview { id score text } }
      }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.addItemReview).toMatchObject({
      score: 4.5,
      text: { note: "cherry" },
    });
    expect(calls[0]?.args[1]).toMatchObject({ text: '{"note":"cherry"}' });
  });

  it("genericItem is its own type, not an Item", async () => {
    const { invoke, calls } = stubSidecar({
      "ItemActor.getGeneric": () => ({
        id: "g1",
        name: "Salt",
        category: "seasoning",
        subcategory: null,
        kind: "ingredient",
        description: null,
        isSubstitutable: true,
        createdById: null,
        createdAt: "2026-09-09T00:00:00.000Z",
        updatedAt: "2026-09-09T00:00:00.000Z",
      }),
    });
    const result = await run(
      `{ genericItem(id: "g1") { __typename
           ... on GenericItem { id name kind isSubstitutable createdById } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.genericItem).toEqual({
      __typename: "GenericItem",
      id: "g1",
      name: "Salt",
      kind: "ingredient",
      isSubstitutable: true,
      createdById: null,
    });
    // The seventh key namespace, addressed as `generic:<id>`.
    expect(calls[0]).toMatchObject({
      actorType: "ItemActor",
      actorId: "generic:g1",
      method: "getGeneric",
    });
  });

  it("a missing item is NotFoundError on the union, not a GraphQL error", async () => {
    const { invoke } = stubSidecar({
      "ItemActor.get": () => {
        throw new NotFoundError("ItemActor(wine:missing) has no row");
      },
    });
    const result = await run(
      `{ item(type: WINE, id: "missing") { __typename ... on ActorError { code } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.item).toEqual({
      __typename: "NotFoundError",
      code: "NOT_FOUND",
    });
  });
});

/* -------------------------------------------------------------------------- */
/* A7c                                                                         */
/* -------------------------------------------------------------------------- */

describe("Item.isFavorite (A7c)", () => {
  it("answers a whole page with one UserActor call, not one per item", async () => {
    const { invoke, calls } = stubSidecar({
      "FavoritesCollectionActor.list": () => ({
        entries: [
          { cursor: "offset:0", node: { type: "WINE", id: "w1" } },
          { cursor: "offset:1", node: { type: "BEER", id: "b1" } },
          { cursor: "offset:2", node: { type: "TEA", id: "t1" } },
        ],
        hasNextPage: false,
        hasPreviousPage: false,
        totalCount: 3,
      }),
      "ItemActor.get": (actorId) => ITEMS[actorId as keyof typeof ITEMS],
      // Only the wine is favourited, of the three on the page.
      "UserActor.favoriteStates": () => ["wine:w1"],
    });
    const result = await run(
      `{ me { favorites(first: 3) { edges { node { id isFavorite } } } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    const me = result.data?.me as {
      favorites: { edges: { node: { id: string; isFavorite: boolean } }[] };
    };
    expect(me.favorites.edges.map((edge) => edge.node)).toEqual([
      { id: "w1", isFavorite: true },
      { id: "b1", isFavorite: false },
      { id: "t1", isFavorite: false },
    ]);

    // The point of the loadable field: one call for three cards.
    const favoriteStateCalls = calls.filter(
      (call) => call.method === "favoriteStates",
    );
    expect(favoriteStateCalls).toHaveLength(1);
    expect(favoriteStateCalls[0]).toMatchObject({
      actorType: "UserActor",
      actorId: viewer.id,
    });
    expect(favoriteStateCalls[0]?.args[1]).toEqual([
      { type: "WINE", id: "w1" },
      { type: "BEER", id: "b1" },
      { type: "TEA", id: "t1" },
    ]);
  });

  it("is false for an anonymous viewer, with no actor call at all", async () => {
    const { invoke, calls } = stubSidecar({
      "ItemActor.get": (actorId) => ITEMS[actorId as keyof typeof ITEMS],
    });
    const result = await run(
      `{ item(type: WINE, id: "w1") {
           ... on QueryItemSuccess { data { isFavorite } }
         } }`,
      testContext(invoke),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.item).toEqual({ data: { isFavorite: false } });
    expect(calls.filter((call) => call.method === "favoriteStates")).toEqual(
      [],
    );
  });
});

/* -------------------------------------------------------------------------- */
/* UI parity wave A: G6 favoriteCount, G7 myReview                             */
/* -------------------------------------------------------------------------- */

describe("Item.favoriteCount / Item.myReview (UI parity G6, G7)", () => {
  const favoritesPage = () => ({
    entries: [
      { cursor: "offset:0", node: { type: "WINE", id: "w1" } },
      { cursor: "offset:1", node: { type: "BEER", id: "b1" } },
      { cursor: "offset:2", node: { type: "TEA", id: "t1" } },
    ],
    hasNextPage: false,
    hasPreviousPage: false,
    totalCount: 3,
  });

  const review = {
    id: "r1",
    itemId: "w1",
    itemType: "WINE",
    userId: viewer.id,
    score: 4.5,
    text: null,
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
  };

  it("G6: one UserActor call for the whole page, counts aligned to refs", async () => {
    const { invoke, calls } = stubSidecar({
      "FavoritesCollectionActor.list": favoritesPage,
      "ItemActor.get": (actorId) => ITEMS[actorId as keyof typeof ITEMS],
      "UserActor.favoriteCounts": (_actorId, _ctx, refs) =>
        (refs as { id: string }[]).map((ref) => (ref.id === "b1" ? 7 : 0)),
    });
    const result = await run(
      `{ me { favorites(first: 3) { edges { node { id favoriteCount } } } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    const me = result.data?.me as {
      favorites: { edges: { node: { id: string; favoriteCount: number } }[] };
    };
    expect(me.favorites.edges.map((edge) => edge.node)).toEqual([
      { id: "w1", favoriteCount: 0 },
      { id: "b1", favoriteCount: 7 },
      { id: "t1", favoriteCount: 0 },
    ]);
    const countCalls = calls.filter((call) => call.method === "favoriteCounts");
    expect(countCalls).toHaveLength(1);
    expect(countCalls[0]).toMatchObject({
      actorType: "UserActor",
      actorId: viewer.id,
    });
  });

  it("G7: one batch of ItemActor.myReview, deduplicated, null when none", async () => {
    const { invoke, calls } = stubSidecar({
      "FavoritesCollectionActor.list": favoritesPage,
      "ItemActor.get": (actorId) => ITEMS[actorId as keyof typeof ITEMS],
      "ItemActor.myReview": (actorId) =>
        actorId === "wine:w1" ? review : null,
    });
    const result = await run(
      `{ me {
           a: favorites(first: 3) { edges { node { id myReview { id score } } } }
           b: favorites(first: 3) { edges { node { id myReview { id } } } }
         } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    const me = result.data?.me as {
      a: { edges: { node: { id: string; myReview: unknown } }[] };
    };
    expect(me.a.edges.map((edge) => edge.node)).toEqual([
      { id: "w1", myReview: { id: "r1", score: 4.5 } },
      { id: "b1", myReview: null },
      { id: "t1", myReview: null },
    ]);
    // Six cards, three distinct items: three calls, not six.
    const reviewCalls = calls.filter((call) => call.method === "myReview");
    expect(reviewCalls.map((call) => call.actorId).sort()).toEqual([
      "beer:b1",
      "tea:t1",
      "wine:w1",
    ]);
  });

  it("anonymous: favoriteCount 0 and myReview null with no actor call", async () => {
    const { invoke, calls } = stubSidecar({
      "ItemActor.get": (actorId) => ITEMS[actorId as keyof typeof ITEMS],
    });
    const result = await run(
      `{ item(type: WINE, id: "w1") {
           ... on QueryItemSuccess { data { favoriteCount myReview { id } } }
         } }`,
      testContext(invoke),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.item).toEqual({
      data: { favoriteCount: 0, myReview: null },
    });
    expect(
      calls.filter((call) =>
        ["favoriteCounts", "myReview"].includes(call.method),
      ),
    ).toEqual([]);
  });

  it("an item you may not read resolves neither field", async () => {
    const { invoke, calls } = stubSidecar({
      "ItemActor.get": () => {
        throw new ForbiddenError("sign in to view an item");
      },
    });
    const result = await run(
      `{ item(type: WINE, id: "w1") {
           __typename
           ... on QueryItemSuccess { data { favoriteCount myReview { id } } }
         } }`,
      testContext(invoke, viewer),
    );
    expect(result.data?.item).toMatchObject({ __typename: "ForbiddenError" });
    expect(calls.map((call) => call.method)).toEqual(["get"]);
  });
});
