/**
 * Reverse edges — UI parity wave B (G8–G11, G14, G15, G23–G25).
 *
 * The old UI read each of these straight off a row through a Hasura
 * relationship: an item's `tier_list_items { tier_list { name } }`, its
 * `cellar_items { cellar }`, its `recipe_ingredients { recipe }`, a bottle's
 * `check_ins` and `display_image`, a brand's `item_brands_aggregate`. Here
 * each is a field on the object, answered by the actor that owns (or may
 * read) the rows.
 *
 * ## Why every list edge costs one actor call per page, not per card
 *
 * A grid of twenty item cards asking for `tierListEntries` must not be twenty
 * actor calls (§1.5). Each list edge is therefore a `t.loadable` whose key is
 * the parent **plus the field's paging arguments** ({@link edgeKey}): Pothos
 * collects every key the tick asks for, the loader names each distinct parent
 * once in one batched actor call (chunked at `REVERSE_EDGE_MAX_PARENTS`), and
 * each key's connection is then paged in memory from that parent's
 * `CappedList` — first `REVERSE_EDGE_CAP` rows, true `totalCount`.
 * `reverse-edges.test.ts` counts the calls.
 *
 * ## Whose rules
 *
 * Nothing here decides visibility. Each actor method applies the rule that
 * already governs its rows — `canSeeTierList` for tier-list entries,
 * `canSeeCellar` for cellars and per-bottle check-ins, `canSeeItemImage` for a
 * display image, the catalog rule for recipes and brands — and the objects at
 * the far end (`TierList`, `Cellar`, `Recipe`) are hydrated through their own
 * loaders, whose actors check again. An anonymous viewer, who cannot read an
 * item at all, gets an empty edge **without** a call where the actor would
 * only refuse.
 *
 * Its own module, imported after every module whose types it extends, for the
 * reason `profile-edges.ts` gives: `item.ts` cannot import `cellar.ts` or
 * `tier-list.ts` (each imports `item.ts`), and `builder.objectField(s)` needs
 * every ref to exist first.
 */
import type {
  CappedList,
  CheckInDto,
  ItemImageDto,
  ItemRef,
  RecipeIngredientDto,
  TierListEntryRef,
  TierListItemDto,
} from "@cellar-assistant/contracts";
import {
  BrandLinksCollectionActorDescriptor,
  brandItemCountsActorId,
  brandLinksCollectionActorId,
  CellarActorDescriptor,
  CellarsCollectionActorDescriptor,
  cappedPage,
  ItemActorDescriptor,
  itemActorId,
  mapPage,
  NotFoundError,
  parseItemActorId,
  REVERSE_EDGE_MAX_PARENTS,
  RecipeGroupsCollectionActorDescriptor,
  recipeIngredientUsesActorId,
  TierListsCollectionActorDescriptor,
  viewerCollectionActorId,
} from "@cellar-assistant/contracts";
import type { ApiContext } from "../context.ts";
import { Brand } from "./brand.ts";
import { builder } from "./builder.ts";
import {
  CellarConnection,
  CellarItemType,
  CellarType,
  CheckInConnection,
} from "./cellar.ts";
import {
  ItemBrandConnection,
  ItemBrandType,
  ItemImageType,
  ItemInterface,
  ItemTypeEnum,
} from "./item.ts";
import {
  type Connection,
  type ConnectionArgs,
  connectionFromPage,
  toPageArgs,
} from "./pagination.ts";
import {
  RecipeIngredientConnection,
  RecipeIngredientType_,
  RecipeType_,
} from "./recipe.ts";
import {
  PlaceStubType,
  TierListItemConnection,
  TierListItemType,
  TierListType,
} from "./tier-list.ts";

/* -------------------------------------------------------------------------- */
/* The batching helper                                                         */
/* -------------------------------------------------------------------------- */

/**
 * One loader key: the parent and the paging it was asked with. Two cards
 * asking for the same parent with the same paging share a key (and so a
 * result); different paging is a different key but the same batched call.
 */
const edgeKey = (parent: string, args: ConnectionArgs): string =>
  JSON.stringify([
    parent,
    args.first ?? null,
    args.after ?? null,
    args.last ?? null,
    args.before ?? null,
  ]);

type ParsedKey = { readonly parent: string; readonly args: ConnectionArgs };

const parseEdgeKey = (key: string): ParsedKey => {
  const [parent, first, after, last, before] = JSON.parse(key) as [
    string,
    number | null,
    string | null,
    number | null,
    string | null,
  ];
  return { parent, args: { first, after, last, before } };
};

const asError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

/**
 * Resolves a tick's worth of edge keys with **one** `fetch` per chunk of
 * distinct parents. A failure — bad paging on one key, or the actor refusing
 * the batch — comes back as that key's `Error`, so it nulls one field rather
 * than the response.
 */
const loadEdges = async <P, T, N = T>(
  keys: readonly string[],
  parse: (parent: string) => P | null,
  fetch: (parents: readonly P[]) => Promise<readonly CappedList<T>[]>,
  node: (value: T) => N = (value) => value as unknown as N,
): Promise<(Connection<N> | Error)[]> => {
  const parsed = keys.map(parseEdgeKey);
  const distinct = [...new Set(parsed.map((key) => key.parent))];
  const lists = new Map<string, CappedList<T> | Error>();
  for (
    let start = 0;
    start < distinct.length;
    start += REVERSE_EDGE_MAX_PARENTS
  ) {
    const chunk = distinct.slice(start, start + REVERSE_EDGE_MAX_PARENTS);
    const valid = chunk.flatMap((parent) => {
      const value = parse(parent);
      return value === null ? [] : [{ parent, value }];
    });
    try {
      const answers =
        valid.length === 0 ? [] : await fetch(valid.map((v) => v.value));
      for (const [index, { parent }] of valid.entries()) {
        lists.set(parent, answers[index] ?? { nodes: [], totalCount: 0 });
      }
    } catch (cause) {
      for (const { parent } of valid) lists.set(parent, asError(cause));
    }
  }
  return parsed.map(({ parent, args }) => {
    const list = lists.get(parent) ?? { nodes: [], totalCount: 0 };
    if (list instanceof Error) return list;
    try {
      return connectionFromPage(
        mapPage(cappedPage(list, toPageArgs(args)), node),
      );
    } catch (cause) {
      return asError(cause);
    }
  });
};

/** An empty connection per key — the anonymous answer, with no call. */
const emptyEdges = <N>(keys: readonly string[]): Connection<N>[] =>
  keys.map(() =>
    connectionFromPage<N>({
      entries: [],
      hasNextPage: false,
      hasPreviousPage: false,
      totalCount: 0,
    }),
  );

const isTierListEntry = (
  ref: TierListEntryRef | null,
): ref is TierListEntryRef => ref !== null;

/* -------------------------------------------------------------------------- */
/* G8 — tier-list entries, on items and places                                 */
/* -------------------------------------------------------------------------- */

/** A parent key for `entriesOf`: `PLACE:<id>` or an `ItemActor` id. */
const entryRefOf = (parent: string): TierListEntryRef | null => {
  if (parent.startsWith("PLACE:")) {
    return { type: "PLACE", id: parent.slice("PLACE:".length) };
  }
  return parseItemActorId(parent);
};

const loadTierListEntries = async (
  keys: string[],
  context: ApiContext,
): Promise<(Connection<TierListItemDto> | Error)[]> => {
  const viewerId = context.ctx.viewerId;
  if (viewerId === null) return emptyEdges(keys);
  return await loadEdges(keys, entryRefOf, (refs) =>
    context
      .actor(
        TierListsCollectionActorDescriptor,
        viewerCollectionActorId(viewerId),
      )
      .entriesOf(refs.filter(isTierListEntry)),
  );
};

const TIER_LIST_ENTRIES_DESCRIPTION =
  "The tier lists ranking this, as their rows (band, position, list) — only " +
  "lists you may see (`canSeeTierList`): a private list's row, and so its " +
  "name, never appears. Most recently changed list first; at most 100 rows " +
  "reachable, `totalCount` exact. One batched call per page of parents. " +
  "Empty for an anonymous viewer.";

builder.interfaceField(ItemInterface, "tierListEntries", (t) =>
  t.loadable({
    type: TierListItemConnection,
    description: TIER_LIST_ENTRIES_DESCRIPTION,
    args: t.arg.connectionArgs(),
    resolve: (item, args) => edgeKey(itemActorId(item), args),
    load: loadTierListEntries,
  }),
);

builder.objectField(PlaceStubType, "tierListEntries", (t) =>
  t.loadable({
    type: TierListItemConnection,
    description: TIER_LIST_ENTRIES_DESCRIPTION,
    args: t.arg.connectionArgs(),
    resolve: (place, args) => edgeKey(`PLACE:${place.id}`, args),
    load: loadTierListEntries,
  }),
);

builder.objectField(TierListItemType, "tierList", (t) =>
  t.field({
    type: TierListType,
    nullable: true,
    description:
      "The list this row is on, through the `TierList` loader — whose actor " +
      "applies `canSeeTierList` again. Nullable so a list that stopped being " +
      "visible between the two reads nulls this field, not the page.",
    resolve: (row) => row.tierListId,
  }),
);

/* -------------------------------------------------------------------------- */
/* G9 — the cellars holding an item                                            */
/* -------------------------------------------------------------------------- */

builder.interfaceField(ItemInterface, "cellars", (t) =>
  t.loadable({
    type: CellarConnection,
    description:
      "Cellars holding a non-empty bottle of this, that you may see " +
      '(`canSeeCellar`), by name — the item page\'s "Located in". At most ' +
      "100 reachable, `totalCount` exact. One batched call per page of items. " +
      "Empty for an anonymous viewer.",
    args: t.arg.connectionArgs(),
    resolve: (item, args) => edgeKey(itemActorId(item), args),
    load: async (
      keys: string[],
      context: ApiContext,
    ): Promise<(Connection<string> | Error)[]> => {
      const viewerId = context.ctx.viewerId;
      if (viewerId === null) return emptyEdges<string>(keys);
      return await loadEdges(keys, parseItemActorId, (refs) =>
        context
          .actor(
            CellarsCollectionActorDescriptor,
            viewerCollectionActorId(viewerId),
          )
          .containing(refs.filter((ref): ref is ItemRef => ref !== null)),
      );
    },
  }),
);

/* -------------------------------------------------------------------------- */
/* G11 — recipes using an item                                                 */
/* -------------------------------------------------------------------------- */

builder.interfaceField(ItemInterface, "recipeIngredients", (t) =>
  t.loadable({
    type: RecipeIngredientConnection,
    description:
      "The recipe lines that use this item, by recipe name — the item page's " +
      '"Used in Recipes". Select `recipe` on each. At most 100 reachable, ' +
      "`totalCount` exact. One batched call per page of items. Empty for an " +
      "anonymous viewer (recipes are for signed-in viewers).",
    args: t.arg.connectionArgs(),
    resolve: (item, args) => edgeKey(itemActorId(item), args),
    load: async (
      keys: string[],
      context: ApiContext,
    ): Promise<(Connection<RecipeIngredientDto> | Error)[]> => {
      if (context.ctx.viewerId === null) return emptyEdges(keys);
      return await loadEdges(keys, parseItemActorId, (parsed) => {
        const refs = parsed.filter((ref): ref is ItemRef => ref !== null);
        return context
          .actor(
            RecipeGroupsCollectionActorDescriptor,
            recipeIngredientUsesActorId({ refs }),
          )
          .ingredientUses({ refs });
      });
    },
  }),
);

builder.objectField(RecipeIngredientType_, "recipe", (t) =>
  t.field({
    type: RecipeType_,
    description:
      "The recipe this line belongs to, through the `Recipe` loader.",
    resolve: (row) => row.recipeId,
  }),
);

/* -------------------------------------------------------------------------- */
/* G10 — a cellar's bottle, by bottle id or by item                            */
/* -------------------------------------------------------------------------- */

/** `NotFoundError` → `null`: "not this cellar's bottle" is an answer here. */
const orNull = async <T>(read: Promise<T>): Promise<T | null> => {
  try {
    return await read;
  } catch (cause) {
    if (cause instanceof NotFoundError) return null;
    throw cause;
  }
};

builder.objectFields(CellarType, (t) => ({
  item: t.field({
    type: CellarItemType,
    nullable: true,
    description:
      "One bottle by its `cellar_items` id — what a cellar-item URL means " +
      "(UI parity decision 1). Emptied bottles included. Null when the id is " +
      "not a bottle in this cellar.",
    args: { id: t.arg.id({ required: true }) },
    resolve: (cellar, args, context) =>
      orNull(
        context.actor(CellarActorDescriptor, cellar.id).item(String(args.id)),
      ),
  }),
  bottleFor: t.field({
    type: CellarItemType,
    nullable: true,
    description:
      "For a link carrying a catalog item id: this cellar's one bottle of " +
      "that item — its only live bottle, else its only emptied one — or null " +
      "when there is no single answer, and the client should open the item " +
      "page instead (UI parity decision 1).",
    args: {
      type: t.arg({ type: ItemTypeEnum, required: true }),
      itemId: t.arg.id({ required: true }),
    },
    resolve: (cellar, args, context) =>
      context
        .actor(CellarActorDescriptor, cellar.id)
        .bottleFor({ type: args.type, id: String(args.itemId) }),
  }),
}));

/* -------------------------------------------------------------------------- */
/* G14, G15 — a bottle's check-ins and display image                           */
/* -------------------------------------------------------------------------- */

builder.objectFields(CellarItemType, (t) => ({
  checkIns: t.loadable({
    type: CheckInConnection,
    description:
      "This bottle's check-ins, newest first — gated on the cellar, as " +
      "`Cellar.checkIns` is. One `CellarActor` call per cellar on the page, " +
      "however many bottles. At most 100 reachable, `totalCount` exact.",
    args: t.arg.connectionArgs(),
    resolve: (bottle, args) => edgeKey(`${bottle.cellarId}/${bottle.id}`, args),
    load: async (
      keys: string[],
      context: ApiContext,
    ): Promise<(Connection<CheckInDto> | Error)[]> => {
      // Group by cellar: each cellar's bottles are one `checkInsOf` call.
      const byCellar = new Map<string, string[]>();
      for (const key of keys) {
        const [cellarId, bottleId] = parseEdgeKey(key).parent.split("/");
        if (cellarId === undefined || bottleId === undefined) continue;
        byCellar.set(cellarId, [...(byCellar.get(cellarId) ?? []), key]);
      }
      const answers = new Map<string, Connection<CheckInDto> | Error>();
      await Promise.all(
        [...byCellar].map(async ([cellarId, cellarKeys]) => {
          const results = await loadEdges(
            cellarKeys,
            (parent) => parent.split("/")[1] ?? null,
            (bottleIds) =>
              context
                .actor(CellarActorDescriptor, cellarId)
                .checkInsOf(bottleIds),
          );
          for (const [index, key] of cellarKeys.entries()) {
            answers.set(key, results[index] ?? new Error("no result"));
          }
        }),
      );
      return keys.map(
        (key) => answers.get(key) ?? new Error(`unparseable edge key ${key}`),
      );
    },
  }),

  displayImage: t.loadable({
    type: ItemImageType,
    nullable: true,
    description:
      "The bottle's chosen photo (`display_image_id`), if you may see it " +
      "(`canSeeItemImage`) and it is an image of this bottle's item; else " +
      "null. One `ItemActor.image` per distinct image on the page, in " +
      "parallel. Null for an anonymous viewer.",
    resolve: (bottle) =>
      bottle.displayImageId === null
        ? null
        : `${itemActorId(bottle.item)}#${bottle.displayImageId}`,
    load: async (
      keys: string[],
      context: ApiContext,
    ): Promise<(ItemImageDto | null | Error)[]> => {
      if (context.ctx.viewerId === null) return keys.map(() => null);
      return await Promise.all(
        keys.map(async (key) => {
          const [itemKey, imageId] = key.split("#");
          if (itemKey === undefined || imageId === undefined) return null;
          try {
            return await context
              .actor(ItemActorDescriptor, itemKey)
              .image(imageId);
          } catch (cause) {
            return asError(cause);
          }
        }),
      );
    },
  }),
}));

/* -------------------------------------------------------------------------- */
/* G23, G24 — a brand's item count and its links                               */
/* -------------------------------------------------------------------------- */

builder.objectFields(Brand, (t) => ({
  itemCount: t.loadable({
    type: "Int",
    description:
      "How many items carry this brand (`item_brands` rows). One batched " +
      "call per page of brands. 0 for an anonymous viewer.",
    resolve: (brand) => brand.id,
    load: async (keys: string[], context: ApiContext) => {
      if (context.ctx.viewerId === null) return keys.map(() => 0);
      const counts = new Map<string, number>();
      const distinct = [...new Set(keys)];
      for (
        let start = 0;
        start < distinct.length;
        start += REVERSE_EDGE_MAX_PARENTS
      ) {
        const brandIds = distinct.slice(
          start,
          start + REVERSE_EDGE_MAX_PARENTS,
        );
        const answer = await context
          .actor(
            BrandLinksCollectionActorDescriptor,
            brandItemCountsActorId({ brandIds }),
          )
          .itemCounts({ brandIds });
        for (const [index, id] of brandIds.entries()) {
          counts.set(id, answer[index] ?? 0);
        }
      }
      return keys.map((key) => counts.get(key) ?? 0);
    },
  }),

  itemLinks: t.field({
    type: ItemBrandConnection,
    description:
      "`items`, as the links themselves: same rows, same order (primary " +
      "first), each carrying `isPrimary` and its `item` — the brand page's " +
      '"Primary" chip.',
    args: t.arg.connectionArgs(),
    resolve: async (brand, args, context) => {
      const filter = { brandId: brand.id };
      return connectionFromPage(
        await context
          .actor(
            BrandLinksCollectionActorDescriptor,
            brandLinksCollectionActorId(filter),
          )
          .itemLinks(filter, toPageArgs(args)),
      );
    },
  }),
}));

builder.objectField(ItemBrandType, "item", (t) =>
  t.field({
    type: ItemInterface,
    description: "The item on this link, through the `Item` loader.",
    resolve: (link) => itemActorId({ type: link.itemType, id: link.itemId }),
  }),
);
