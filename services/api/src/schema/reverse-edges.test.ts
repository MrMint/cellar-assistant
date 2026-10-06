/**
 * Reverse edges (UI parity wave B), executed against a stub sidecar.
 *
 * Three properties per edge, each of which has been wrong somewhere before:
 *
 * - **Cost.** A page of parents is one batched actor call, not one per card
 *   (§1.5). Every list edge is counted here with a page of three.
 * - **Visibility.** What the owning actor withholds stays withheld: a hidden
 *   tier list is never hydrated (so its name is never read), an anonymous
 *   viewer costs no call at all.
 * - **Shape.** The batched answer is paged per parent in memory, so
 *   `first`/`after` and an honest `totalCount` still work on each card.
 */
import type {
  CappedList,
  ItemRef,
  PageArgs,
  TierListEntryRef,
} from "@cellar-assistant/contracts";
import {
  brandItemCountsActorId,
  NotFoundError,
  offsetPage,
  recipeIngredientUsesActorId,
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

const stamp = "2026-10-04T00:00:00.000Z";
const W1 = "a0000001-0000-4000-8000-000000000001";
const W2 = "a0000002-0000-4000-8000-000000000002";
const W3 = "a0000003-0000-4000-8000-000000000003";
const PUBLIC_LIST = "b0000001-0000-4000-8000-000000000001";
const OTHER_LIST = "b0000002-0000-4000-8000-000000000002";
const CELLAR = "c0000001-0000-4000-8000-000000000001";
const CELLAR_2 = "c0000002-0000-4000-8000-000000000002";
const RECIPE = "d0000001-0000-4000-8000-000000000001";
const BRAND_A = "e0000001-0000-4000-8000-000000000001";
const BRAND_B = "e0000002-0000-4000-8000-000000000002";
const IMAGE = "f0000001-0000-4000-8000-000000000001";

const page = <T>(rows: readonly T[], args: unknown) =>
  offsetPage(rows, args as PageArgs);

const wine = (id: string) => ({
  id,
  type: "WINE" as const,
  name: `Wine ${id.slice(0, 2)}`,
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
  specialDesignation: null,
  vineyardDesignation: null,
  alcoholContentPercentage: null,
});

const tierList = (id: string) => ({
  id,
  name: `List ${id.slice(0, 2)}`,
  description: null,
  createdById: viewer.id,
  privacy: "PUBLIC" as const,
  listType: "wine",
  isEditingLocked: false,
  itemCount: 1,
  aiInsights: null,
  insightsGeneratedAt: null,
  contentUpdatedAt: stamp,
  createdAt: stamp,
  updatedAt: stamp,
});

const counts = {
  total: 0,
  byType: { WINE: 0, BEER: 0, SPIRIT: 0, COFFEE: 0, SAKE: 0, TEA: 0 },
};

const cellar = (id: string) => ({
  id,
  name: `Cellar ${id.slice(0, 2)}`,
  privacy: "PUBLIC" as const,
  createdById: viewer.id,
  coOwnerIds: [],
  itemCount: 0,
  itemCounts: counts,
  createdAt: stamp,
  updatedAt: stamp,
});

const bottle = (id: string, item: string, displayImageId: string | null) => ({
  id,
  cellarId: CELLAR,
  createdBy: viewer.id,
  item: { type: "WINE" as const, id: item },
  openAt: null,
  emptyAt: null,
  percentageRemaining: 100,
  displayImageId,
  sourceType: null,
  sourcePlaceId: null,
  sourceMenuItemId: null,
  distance: null,
  createdAt: stamp,
  updatedAt: stamp,
});

const entry = (tierListId: string, ref: TierListEntryRef, band: number) => ({
  id: `${tierListId.slice(0, 4)}-${ref.id.slice(0, 4)}`,
  tierListId,
  band,
  position: 0,
  notes: null,
  entry: ref,
  createdAt: stamp,
  updatedAt: stamp,
});

const capped = <T>(nodes: T[], totalCount = nodes.length): CappedList<T> => ({
  nodes,
  totalCount,
});

/** Three favourites — a page of item cards. */
const FAVORITES: ItemRef[] = [W1, W2, W3].map((id) => ({ type: "WINE", id }));

const sidecar = (extra: Record<string, (...a: never[]) => unknown> = {}) =>
  stubSidecar({
    "FavoritesCollectionActor.list": (_id, _ctx, args) => page(FAVORITES, args),
    "ItemActor.get": (id) => wine(String(id).split(":")[1] ?? ""),
    "TierListActor.get": (id) => tierList(String(id)),
    "CellarActor.get": (id) => cellar(String(id)),
    ...extra,
  });

const callsTo = (
  calls: ReturnType<typeof stubSidecar>["calls"],
  method: string,
) => calls.filter((call) => call.method === method);

/* -------------------------------------------------------------------------- */
/* G8                                                                          */
/* -------------------------------------------------------------------------- */

describe("Item.tierListEntries / Place.tierListEntries (G8)", () => {
  /**
   * The actor has already applied `canSeeTierList`: W1 is on a public list
   * the viewer may see, and (in the database) on a private one they may not
   * — which the actor therefore does not return, so the API has nothing to
   * hydrate and never reads the hidden list's name.
   */
  const entriesOf = (_id: string, _ctx: unknown, refs: TierListEntryRef[]) =>
    refs.map((ref) =>
      ref.id === W1
        ? capped([entry(PUBLIC_LIST, ref, 5), entry(OTHER_LIST, ref, 2)])
        : ref.id === W2
          ? capped([entry(PUBLIC_LIST, ref, 3)])
          : capped([]),
    );

  const DOC = `{ me { favorites(first: 3) { edges { node {
    id
    tierListEntries(first: 10) { totalCount edges { node {
      band entryType tierList { id name }
    } } }
  } } } } }`;

  it("costs one entriesOf for the page and one TierListActor.get per distinct list", async () => {
    const { invoke, calls } = sidecar({
      "TierListsCollectionActor.entriesOf": entriesOf as never,
    });
    const result = await run(DOC, testContext(invoke, viewer));
    expect(result.errors).toBeUndefined();

    const batched = callsTo(calls, "entriesOf");
    expect(batched).toHaveLength(1);
    expect(batched[0]?.actorId).toBe(viewer.id);
    expect(batched[0]?.args[1]).toEqual(FAVORITES);
    expect(
      callsTo(calls, "get")
        .filter((call) => call.actorType === "TierListActor")
        .map((call) => call.actorId)
        .sort(),
    ).toEqual([PUBLIC_LIST, OTHER_LIST].sort());

    const edges = (
      result.data as {
        me: {
          favorites: {
            edges: {
              node: {
                tierListEntries: {
                  totalCount: number;
                  edges: { node: { band: number; tierList: { id: string } } }[];
                };
              };
            }[];
          };
        };
      }
    ).me.favorites.edges.map((e) => e.node.tierListEntries);
    expect(edges.map((e) => e.totalCount)).toEqual([2, 1, 0]);
    expect(edges[0]?.edges.map((e) => e.node.band)).toEqual([5, 2]);
  });

  it("a list the actor withholds is never hydrated — its name is never read", async () => {
    const { invoke, calls } = sidecar({
      // The private list's row is withheld by the actor: nothing comes back.
      "TierListsCollectionActor.entriesOf": ((
        _id: string,
        _ctx: unknown,
        refs: TierListEntryRef[],
      ) => refs.map(() => capped([]))) as never,
    });
    const result = await run(DOC, testContext(invoke, viewer));
    expect(result.errors).toBeUndefined();
    // No hydrated list: no `tierList { name }` anywhere in the response.
    expect(JSON.stringify(result.data)).not.toContain('"name"');
    expect(calls.filter((call) => call.actorType === "TierListActor")).toEqual(
      [],
    );
  });

  it("an anonymous viewer gets an empty edge with no call", async () => {
    const { invoke, calls } = sidecar();
    const result = await run(
      `{ item(type: WINE, id: "${W1}") { ... on QueryItemSuccess { data {
           tierListEntries(first: 5) { totalCount edges { node { id } } }
         } } } }`,
      testContext(invoke, null),
    );
    expect(result.errors).toBeUndefined();
    expect(JSON.stringify(result.data)).toContain('"totalCount":0');
    expect(callsTo(calls, "entriesOf")).toEqual([]);
  });

  it("pages each parent's capped list, keeping totalCount, and refuses backward paging", async () => {
    const { invoke } = sidecar({
      "TierListsCollectionActor.entriesOf": entriesOf as never,
    });
    const result = await run(
      `{ item(type: WINE, id: "${W1}") { ... on QueryItemSuccess { data {
           first: tierListEntries(first: 1) {
             totalCount pageInfo { hasNextPage endCursor } edges { node { band } }
           }
           back: tierListEntries(last: 1) { totalCount }
           name
         } } } }`,
      testContext(invoke, viewer),
    );
    // The `last` alias is refused as a field error; the response carries it
    // rather than silently returning a forward page.
    expect(result.errors?.[0]?.message).toMatch(/backward pagination/);

    const ok = await run(
      `{ item(type: WINE, id: "${W1}") { ... on QueryItemSuccess { data {
           tierListEntries(first: 1) {
             totalCount pageInfo { hasNextPage } edges { node { band } }
           }
         } } } }`,
      testContext(invoke, viewer),
    );
    expect(ok.errors).toBeUndefined();
    expect(JSON.stringify(ok.data)).toBe(
      JSON.stringify({
        item: {
          data: {
            tierListEntries: {
              totalCount: 2,
              pageInfo: { hasNextPage: true },
              edges: [{ node: { band: 5 } }],
            },
          },
        },
      }),
    );
  });

  it("answers for a place through the same batched call", async () => {
    const PLACE = "99999999-0000-4000-8000-000000000001";
    const { invoke, calls } = sidecar({
      "TierListActor.items": (_id, _ctx, args) =>
        page([entry(PUBLIC_LIST, { type: "PLACE", id: PLACE }, 1)], args),
      "TierListsCollectionActor.entriesOf": ((
        _id: string,
        _ctx: unknown,
        refs: TierListEntryRef[],
      ) => refs.map((ref) => capped([entry(PUBLIC_LIST, ref, 1)]))) as never,
    });
    const result = await run(
      `{ tierList(id: "${PUBLIC_LIST}") { ... on TierList {
           items(first: 5) { edges { node { place {
             tierListEntries(first: 5) { totalCount }
           } } } }
         } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(callsTo(calls, "entriesOf")[0]?.args[1]).toEqual([
      { type: "PLACE", id: PLACE },
    ]);
    expect(JSON.stringify(result.data)).toContain('"totalCount":1');
  });
});

/* -------------------------------------------------------------------------- */
/* G9                                                                          */
/* -------------------------------------------------------------------------- */

describe("Item.cellars (G9)", () => {
  it("costs one containing call per page and hydrates through the Cellar loader", async () => {
    const { invoke, calls } = sidecar({
      "CellarsCollectionActor.containing": ((
        _id: string,
        _ctx: unknown,
        refs: ItemRef[],
      ) =>
        refs.map((ref) =>
          ref.id === W3 ? capped([]) : capped([CELLAR, CELLAR_2]),
        )) as never,
    });
    const result = await run(
      `{ me { favorites(first: 3) { edges { node {
           cellars(first: 1) { totalCount edges { node { id name } } }
         } } } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(callsTo(calls, "containing")).toHaveLength(1);
    expect(callsTo(calls, "containing")[0]?.args[1]).toEqual(FAVORITES);
    // `first: 1` — only the first cellar per card is hydrated.
    expect(
      calls
        .filter((call) => call.actorType === "CellarActor")
        .map((call) => call.actorId),
    ).toEqual([CELLAR]);
    expect(JSON.stringify(result.data)).toContain('"totalCount":2');
  });

  it("an anonymous viewer gets an empty edge with no call", async () => {
    const { invoke, calls } = sidecar();
    const result = await run(
      `{ item(type: WINE, id: "${W1}") { ... on QueryItemSuccess { data {
           cellars(first: 5) { totalCount }
         } } } }`,
      testContext(invoke, null),
    );
    expect(result.errors).toBeUndefined();
    expect(callsTo(calls, "containing")).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* G11                                                                         */
/* -------------------------------------------------------------------------- */

describe("Item.recipeIngredients + RecipeIngredient.recipe (G11)", () => {
  const recipe = {
    id: RECIPE,
    name: "Kalimotxo",
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
    ingredientCount: 2,
    instructionCount: 0,
    createdAt: stamp,
    updatedAt: stamp,
  };

  it("costs one ingredientUses per page, addressed at the ref set's key", async () => {
    const { invoke, calls } = sidecar({
      "RecipeGroupsCollectionActor.ingredientUses": ((
        _id: string,
        _ctx: unknown,
        filter: { refs: ItemRef[] },
      ) =>
        filter.refs.map((ref) =>
          capped([
            {
              id: `ri-${ref.id.slice(0, 4)}`,
              recipeId: RECIPE,
              ref,
              quantity: 2,
              unit: "oz",
              isOptional: false,
              substitutionNotes: null,
              createdAt: stamp,
            },
          ]),
        )) as never,
      "RecipeActor.get": () => recipe,
    });
    const result = await run(
      `{ me { favorites(first: 3) { edges { node {
           recipeIngredients(first: 5) { totalCount edges { node {
             quantity unit recipe { id name }
           } } }
         } } } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    const batched = callsTo(calls, "ingredientUses");
    expect(batched).toHaveLength(1);
    expect(batched[0]?.actorId).toBe(
      recipeIngredientUsesActorId({ refs: FAVORITES }),
    );
    // Three lines, one recipe: one RecipeActor.get.
    expect(
      calls.filter((call) => call.actorType === "RecipeActor"),
    ).toHaveLength(1);
    expect(JSON.stringify(result.data)).toContain('"name":"Kalimotxo"');
  });

  it("an anonymous viewer gets an empty edge with no call", async () => {
    const { invoke, calls } = sidecar();
    const result = await run(
      `{ item(type: WINE, id: "${W1}") { ... on QueryItemSuccess { data {
           recipeIngredients(first: 5) { totalCount }
         } } } }`,
      testContext(invoke, null),
    );
    expect(result.errors).toBeUndefined();
    expect(callsTo(calls, "ingredientUses")).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* G10, G14, G15                                                               */
/* -------------------------------------------------------------------------- */

describe("Cellar.item / Cellar.bottleFor (G10)", () => {
  it("item(id) is the bottle; not this cellar's bottle is null, not an error", async () => {
    const B1 = "10000001-0000-4000-8000-000000000001";
    const { invoke, calls } = sidecar({
      "CellarActor.item": (_id, _ctx, cellarItemId) => {
        if (cellarItemId === B1) return bottle(B1, W1, null);
        throw new NotFoundError("not in this cellar");
      },
    });
    const result = await run(
      `{ cellar(id: "${CELLAR}") { ... on Cellar {
           hit: item(id: "${B1}") { id item { id } }
           miss: item(id: "${W2}") { id }
         } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.cellar).toEqual({
      hit: { id: B1, item: { id: W1 } },
      miss: null,
    });
    expect(callsTo(calls, "item").map((call) => call.args[1])).toEqual([
      B1,
      W2,
    ]);
  });

  it("bottleFor forwards the typed ref and passes null through", async () => {
    const { invoke, calls } = sidecar({ "CellarActor.bottleFor": () => null });
    const result = await run(
      `{ cellar(id: "${CELLAR}") { ... on Cellar {
           bottleFor(type: WINE, itemId: "${W1}") { id }
         } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.cellar).toEqual({ bottleFor: null });
    expect(callsTo(calls, "bottleFor")[0]?.args[1]).toEqual({
      type: "WINE",
      id: W1,
    });
  });
});

describe("CellarItem.checkIns / CellarItem.displayImage (G14, G15)", () => {
  const BOTTLES = [
    bottle("10000001-0000-4000-8000-000000000001", W1, IMAGE),
    bottle("10000002-0000-4000-8000-000000000002", W2, null),
    bottle("10000003-0000-4000-8000-000000000003", W1, IMAGE),
  ];
  const image = {
    id: IMAGE,
    itemId: W1,
    itemType: "WINE",
    fileId: "f",
    userId: viewer.id,
    isPublic: true,
    placeholder: null,
    createdAt: stamp,
    updatedAt: stamp,
  };
  const extra = {
    "CellarActor.items": ((
      _id: string,
      _ctx: unknown,
      args: { page: unknown },
    ) => page(BOTTLES, args.page)) as never,
    "CellarActor.checkInsOf": ((_id: string, _ctx: unknown, ids: string[]) =>
      ids.map((cellarItemId) =>
        capped([
          {
            id: `ci-${cellarItemId.slice(0, 8)}`,
            userId: viewer.id,
            cellarItemId,
            createdAt: stamp,
            updatedAt: stamp,
          },
        ]),
      )) as never,
    "ItemActor.image": (() => image) as never,
  };
  const DOC = `{ cellar(id: "${CELLAR}") { ... on Cellar {
    items(first: 10) { edges { node {
      id
      checkIns(first: 5) { totalCount edges { node { cellarItemId } } }
      displayImage { id }
    } } }
  } } }`;

  it("one checkInsOf for the page's bottles; one image read per distinct image", async () => {
    const { invoke, calls } = sidecar(extra);
    const result = await run(DOC, testContext(invoke, viewer));
    expect(result.errors).toBeUndefined();
    const batched = callsTo(calls, "checkInsOf");
    expect(batched).toHaveLength(1);
    expect(batched[0]?.args[1]).toEqual(BOTTLES.map((b) => b.id));
    // Two bottles share one image; the third has none: one call.
    expect(callsTo(calls, "image")).toHaveLength(1);
    expect(callsTo(calls, "image")[0]?.args[1]).toBe(IMAGE);
    const shown = result.data?.cellar as
      | {
          items: {
            edges: {
              node: {
                id: string;
                checkIns: { edges: { node: { cellarItemId: string } }[] };
                displayImage: { id: string } | null;
              };
            }[];
          };
        }
      | undefined;
    const nodes = shown?.items.edges.map((edge) => edge.node) ?? [];
    expect(nodes).toHaveLength(3);
    for (const node of nodes) {
      expect(node.checkIns.edges[0]?.node.cellarItemId).toBe(node.id);
    }
    expect(nodes.map((node) => node.displayImage?.id ?? null)).toEqual([
      IMAGE,
      null,
      IMAGE,
    ]);
  });

  it("a hidden display image is null, and an anonymous viewer reads none", async () => {
    const hidden = sidecar({
      ...extra,
      "ItemActor.image": (() => null) as never,
    });
    const result = await run(DOC, testContext(hidden.invoke, viewer));
    expect(result.errors).toBeUndefined();
    expect(JSON.stringify(result.data)).not.toContain(`"id":"${IMAGE}"`);

    const anonymous = sidecar(extra);
    await run(DOC, testContext(anonymous.invoke, null));
    expect(callsTo(anonymous.calls, "image")).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* G23, G24, G25                                                               */
/* -------------------------------------------------------------------------- */

const brand = (id: string) => ({
  id,
  name: `Brand ${id.slice(0, 2)}`,
  description: null,
  logoUrl: null,
  brandType: null,
  parentBrandId: null,
  createdAt: stamp,
  updatedAt: stamp,
});

describe("Brand.itemCount / Brand.itemLinks (G23, G24)", () => {
  it("one itemCounts for the page, addressed at the brand set's key", async () => {
    const { invoke, calls } = sidecar({
      "BrandsCollectionActor.list": (_id, _ctx, _filter, args) =>
        page([brand(BRAND_A), brand(BRAND_B)], args),
      "BrandLinksCollectionActor.itemCounts": ((
        _id: string,
        _ctx: unknown,
        filter: { brandIds: string[] },
      ) => filter.brandIds.map((id) => (id === BRAND_A ? 7 : 0))) as never,
    });
    const result = await run(
      `{ brands(first: 10) { ... on BrandConnection { edges { node { id itemCount } } } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    const batched = callsTo(calls, "itemCounts");
    expect(batched).toHaveLength(1);
    expect(batched[0]?.actorId).toBe(
      brandItemCountsActorId({ brandIds: [BRAND_A, BRAND_B] }),
    );
    expect(JSON.stringify(result.data)).toBe(
      JSON.stringify({
        brands: {
          edges: [
            { node: { id: BRAND_A, itemCount: 7 } },
            { node: { id: BRAND_B, itemCount: 0 } },
          ],
        },
      }),
    );
  });

  it("itemLinks carries isPrimary and resolves each item through the loader", async () => {
    const { invoke, calls } = sidecar({
      "BrandActor.get": (id) => brand(String(id)),
      "BrandLinksCollectionActor.itemLinks": (_id, _ctx, _filter, args) =>
        page(
          [W1, W2].map((itemId, index) => ({
            id: `ib${index}`,
            itemId,
            itemType: "WINE",
            brandId: BRAND_A,
            isPrimary: index === 0,
            createdAt: stamp,
          })),
          args,
        ),
    });
    const result = await run(
      `{ brand(id: "${BRAND_A}") { ... on Brand {
           itemLinks(first: 5) { totalCount edges { node { isPrimary item { id name } } } }
         } } }`,
      testContext(invoke, viewer),
    );
    expect(result.errors).toBeUndefined();
    expect(JSON.stringify(result.data)).toContain('"isPrimary":true');
    expect(
      callsTo(calls, "get").filter((call) => call.actorType === "ItemActor"),
    ).toHaveLength(2);
  });
});

describe("Viewer.favorites(types) (G25)", () => {
  it("forwards the type filter, and null when it is omitted", async () => {
    const { invoke, calls } = sidecar();
    await run(
      `{ me { a: favorites(first: 1, types: [BEER, TEA]) { totalCount }
              b: favorites(first: 1) { totalCount } } }`,
      testContext(invoke, viewer),
    );
    const lists = callsTo(calls, "list").filter(
      (call) => call.actorType === "FavoritesCollectionActor",
    );
    expect(lists.map((call) => call.args[2])).toEqual([["BEER", "TEA"], null]);
  });
});
