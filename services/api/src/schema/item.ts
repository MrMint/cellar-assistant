/**
 * The `Item` interface (migration plan §2.1, A7).
 *
 * Six physical tables — `wines`, `beers`, `spirits`, `coffees`, `sakes`,
 * `teas` — and the six-column polymorphic foreign key that joins to them are
 * hidden behind `ItemActor(type:itemId)` and, here, behind one interface. §9
 * defers consolidating those tables into `items(type)` + detail tables; this
 * interface is what makes deferring it safe, because nothing outside
 * `packages/db` and `ItemActor` can see the shape underneath.
 *
 * **The interface is loadable.** A list of item ids (what collection actors
 * return, §2.2) is resolved by returning the ids: `plugin-dataloader` collects
 * every id requested in one tick and calls `loadItems` once, which fans out to
 * parallel `ItemActor.get` invocations — §1.5's "Pothos resolves ids through a
 * DataLoader that batches into parallel entity-actor calls", verbatim.
 *
 * B2 owns `ItemActor` and fills in the rest of the per-type fields. The field
 * sets here are the columns the six tables have today.
 */
import { randomUUID } from "node:crypto";
import type {
  AddItemReviewInput as AddItemReviewInputType,
  AttachItemImageInput as AttachItemImageInputType,
  CreateGenericItemInput as CreateGenericItemInputType,
  CreateItemInput as CreateItemInputType,
  DeletedItemReview,
  DetachedItemImage,
  GenericItemDto,
  GenericItemKind,
  ItemBrandDto,
  ItemCheckInDto,
  ItemDto,
  ItemImageDto,
  ItemRef,
  ItemReviewDto,
  ItemScoreDto,
  ItemType,
  UnlinkedItemBrand,
  UpdateGenericItemInput as UpdateGenericItemInputType,
  UpdateItemInput as UpdateItemInputType,
  UpdateItemReviewInput as UpdateItemReviewInputType,
} from "@cellar-assistant/contracts";
import {
  BrandLinksCollectionActorDescriptor,
  brandLinksCollectionActorId,
  CheckInsCollectionActorDescriptor,
  FileActorDescriptor,
  ForbiddenError,
  GENERIC_ITEM_KINDS,
  genericItemActorId,
  ITEM_TYPES,
  ItemActorDescriptor,
  itemActorId,
  mapPage,
  parseItemActorId,
  UserActorDescriptor,
  ValidationError,
  viewerCollectionActorId,
} from "@cellar-assistant/contracts";
import type { ApiContext } from "../context.ts";
import { Brand } from "./brand.ts";
import { builder } from "./builder.ts";
import { FileType } from "./file.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";
import { type PatchPolicy, patch, present } from "./patch.ts";

export const ItemTypeEnum = builder.enumType("ItemType", {
  description: "The `item_type` Postgres enum. `generic_items` is not an Item.",
  values: ITEM_TYPES,
});

const TYPE_NAMES: Record<ItemType, string> = {
  WINE: "Wine",
  BEER: "Beer",
  SPIRIT: "Spirit",
  COFFEE: "Coffee",
  SAKE: "Sake",
  TEA: "Tea",
};

/**
 * One batch, N parallel actor calls. Each key is an `ItemActor` id
 * (`wine:<uuid>`); a per-key failure is returned as an `Error` rather than
 * thrown, so one missing item does not fail the whole list.
 */
const loadItems = async (
  keys: readonly string[],
  context: ApiContext,
): Promise<readonly (ItemDto | Error)[]> =>
  await Promise.all(
    keys.map(async (key): Promise<ItemDto | Error> => {
      const ref = parseItemActorId(key);
      if (ref === null) {
        return new ValidationError(`not an item id: ${key}`);
      }
      try {
        return await context.actor(ItemActorDescriptor, itemActorId(ref)).get();
      } catch (cause) {
        return cause instanceof Error ? cause : new Error(String(cause));
      }
    }),
  );

/* -------------------------------------------------------------------------- */
/* The satellites: `item_reviews`, `item_image`, `item_brands`                 */
/* -------------------------------------------------------------------------- */

const ItemScoreType = builder.objectRef<ItemScoreDto>("ItemScore").implement({
  description:
    "An item's rating. `average` is null with no reviews — not 0, which " +
    "would read as 'everyone hated it'.",
  fields: (t) => ({
    average: t.exposeFloat("average", { nullable: true }),
    count: t.exposeInt("count"),
  }),
});

export const ItemImageType = builder
  .objectRef<ItemImageDto>("ItemImage")
  .implement({
    description:
      "One `item_image` row. `file` is where the bytes are — this row is only " +
      "the link between an item and a `files` row.",
    fields: (t) => ({
      id: t.exposeID("id"),
      itemId: t.exposeID("itemId"),
      itemType: t.field({ type: ItemTypeEnum, resolve: (i) => i.itemType }),
      fileId: t.exposeID("fileId"),
      /**
       * A7c (2): without this the id was a dead end — `FileActor` had no
       * GraphQL surface, so nothing could turn a `fileId` into a URL and item
       * images were undisplayable. `ItemActor.images` has already applied
       * `canSeeItemImage`, and `FileActor` allows a read of any file a public
       * `item_image` references, so this resolves for a public image whoever
       * uploaded it.
       */
      file: t.field({
        type: FileType,
        description:
          "The stored object. Select `file { url }` to render it — one actor " +
          "call per image, so ask for it only on the images you draw.",
        resolve: (image, _args, context) =>
          context.actor(FileActorDescriptor, image.fileId).get(),
      }),
      userId: t.exposeID("userId", { description: "Who uploaded it." }),
      isPublic: t.exposeBoolean("isPublic"),
      placeholder: t.exposeString("placeholder", { nullable: true }),
      createdAt: t.expose("createdAt", { type: "DateTime" }),
      updatedAt: t.expose("updatedAt", { type: "DateTime" }),
    }),
  });

const ItemImageConnection = builder.connectionObject(
  { type: ItemImageType, name: "ItemImageConnection" },
  { name: "ItemImageEdge" },
);

export const ItemReviewType = builder
  .objectRef<ItemReviewDto>("ItemReview")
  .implement({
    description:
      "One `item_reviews` row. `text` is a `json` column whose shape the " +
      "client owns, so it crosses as JSON rather than as a String.",
    fields: (t) => ({
      id: t.exposeID("id"),
      itemId: t.exposeID("itemId"),
      itemType: t.field({ type: ItemTypeEnum, resolve: (r) => r.itemType }),
      userId: t.exposeID("userId"),
      score: t.exposeFloat("score", {
        description:
          "0.5–5.0 in 0.5 steps; the check constraint is the authority.",
      }),
      text: t.field({
        type: "JSON",
        nullable: true,
        resolve: (review) =>
          review.text === null ? null : JSON.parse(review.text),
      }),
      createdAt: t.expose("createdAt", { type: "DateTime" }),
      updatedAt: t.expose("updatedAt", { type: "DateTime" }),
    }),
  });

const ItemReviewConnection = builder.connectionObject(
  { type: ItemReviewType, name: "ItemReviewConnection" },
  { name: "ItemReviewEdge" },
);

export const ItemBrandType = builder
  .objectRef<ItemBrandDto>("ItemBrand")
  .implement({
    description: "One `item_brands` link.",
    fields: (t) => ({
      id: t.exposeID("id"),
      itemId: t.exposeID("itemId"),
      itemType: t.field({ type: ItemTypeEnum, resolve: (b) => b.itemType }),
      isPrimary: t.exposeBoolean("isPrimary"),
      createdAt: t.expose("createdAt", { type: "DateTime" }),
      brand: t.field({
        type: Brand,
        description:
          "Resolved through B3's brand DataLoader — one batched " +
          "`BrandActor.get` per page (§1.5).",
        resolve: (link) => link.brandId,
      }),
    }),
  });

export const ItemBrandConnection = builder.connectionObject(
  { type: ItemBrandType, name: "ItemBrandConnection" },
  { name: "ItemBrandEdge" },
);

/**
 * One `check_ins` row as the *item* page sees it. C3's
 * `CheckInsCollectionActor` returns this whole shape rather than an id: a
 * check-in has no entity actor of its own (§3 makes `CellarActor` its writer,
 * and that actor is keyed by cellar), so there is nothing an id could address.
 *
 * Declared as a bare ref and implemented below `ItemInterface`, because the two
 * reference each other — `Item.checkIns` returns this, and `ItemCheckIn.item`
 * returns an `Item`. Implementing inline would make each type's inferred shape
 * depend on the other's and collapse both to `any` (TS7022); `recipe.ts` splits
 * `Recipe`/`RecipeGroup` for the same reason.
 */
export const ItemCheckInType = builder.objectRef<ItemCheckInDto>("ItemCheckIn");

const ItemCheckInConnection = builder.connectionObject(
  { type: ItemCheckInType, name: "ItemCheckInConnection" },
  { name: "ItemCheckInEdge" },
);

export const ItemInterface = builder.loadableInterface("Item", {
  description:
    "Anything that can sit in a cellar. One interface over six tables (plan §2.1).",
  load: loadItems,
  toKey: (item) => itemActorId(item),
  resolveType: (item) => TYPE_NAMES[item.type],
  fields: (t) => ({
    id: t.exposeID("id", { description: "The row's uuid in its own table." }),
    type: t.field({
      type: ItemTypeEnum,
      description: "Which of the six tables this row lives in.",
      resolve: (item) => item.type,
    }),
    name: t.exposeString("name"),
    description: t.exposeString("description", { nullable: true }),
    country: t.exposeString("country", { nullable: true }),
    barcode: t.exposeString("barcodeCode", { nullable: true }),
    createdById: t.exposeID("createdById"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),

    /* --- the satellites, all paged from the owning actor (§1.5) --------- */

    score: t.field({
      type: ItemScoreType,
      description:
        "Computed in the actor from the loaded reviews — this is what " +
        "replaces the `_aggregate` calls (§2.1).",
      resolve: (item, _args, context) =>
        context.actor(ItemActorDescriptor, itemActorId(item)).score(),
    }),

    /**
     * A7c (7). The star's state belonged here, not in the client.
     *
     * D3 drew it by testing membership in `me.favorites(first: 100)`, which is
     * wrong three ways: it **silently truncates at the page cap**, so anyone
     * past their 100th favourite sees unstarred items they have starred; it
     * hydrates every favourite through the item loader to answer one boolean;
     * and it makes each page do a join the server can do from rows it already
     * holds in memory.
     *
     * Batched, because it is drawn once per card: `t.loadable` collects every
     * item in the tick and asks `UserActor.favoriteStates` **once**. One
     * sidecar hop per request, not per card — which matters more than usual
     * here, since `UserActor(viewerId)` takes one turn at a time and N calls
     * would run in series.
     */
    isFavorite: t.loadable({
      type: "Boolean",
      description:
        "Whether the viewer has favourited this item. `false` for an " +
        "anonymous viewer. One batched `UserActor` call per request.",
      resolve: (item) => itemActorId(item),
      load: async (keys: string[], context: ApiContext) => {
        const viewerId = context.ctx.viewerId;
        if (viewerId === null) return keys.map(() => false);
        const refs = keys
          .map(parseItemActorId)
          .filter((ref): ref is ItemRef => ref !== null);
        const favorited = new Set(
          await context
            .actor(UserActorDescriptor, viewerId)
            .favoriteStates(refs),
        );
        return keys.map((key) => favorited.has(key));
      },
    }),

    /**
     * UI parity G6 — the old card's `item_favorites_aggregate.count`.
     *
     * Batched like `isFavorite`, and through the same actor: `UserActor` is
     * `item_favorites`' writer, so the viewer's own actor answers for the
     * whole page in **one** call (one fresh `group by`), rather than one
     * sidecar hop per card.
     */
    favoriteCount: t.loadable({
      type: "Int",
      description:
        "How many users have favourited this item. One batched `UserActor` " +
        "call per request. 0 for an anonymous viewer, who cannot read items.",
      resolve: (item) => itemActorId(item),
      load: async (keys: string[], context: ApiContext) => {
        const viewerId = context.ctx.viewerId;
        if (viewerId === null) return keys.map(() => 0);
        const refs = keys
          .map(parseItemActorId)
          .filter((ref): ref is ItemRef => ref !== null);
        const counts = await context
          .actor(UserActorDescriptor, viewerId)
          .favoriteCounts(refs);
        const byKey = new Map(
          refs.map((ref, index) => [itemActorId(ref), counts[index] ?? 0]),
        );
        return keys.map((key) => byKey.get(key) ?? 0);
      },
    }),

    /**
     * UI parity G7 — the old card's gold star (`user_reviews` aggregate) and
     * the tier-list row's own score. `ItemActor` owns `item_reviews` and holds
     * them already, so each item answers from its cache; the loader collects a
     * page's items into one batch of parallel calls (§1.5), the same fan-out
     * as the `Item` loader itself, and deduplicates repeats within a request.
     */
    myReview: t.loadable({
      type: ItemReviewType,
      nullable: true,
      description:
        "Your own newest review of this item, or null — including for an " +
        "anonymous viewer.",
      resolve: (item) => itemActorId(item),
      load: async (
        keys: string[],
        context: ApiContext,
      ): Promise<(ItemReviewDto | null | Error)[]> => {
        if (context.ctx.viewerId === null) return keys.map(() => null);
        return await Promise.all(
          keys.map(async (key) => {
            try {
              return await context.actor(ItemActorDescriptor, key).myReview();
            } catch (cause) {
              return cause instanceof Error ? cause : new Error(String(cause));
            }
          }),
        );
      },
    }),

    images: t.field({
      type: ItemImageConnection,
      description:
        "Already filtered to what you may see: public, or uploaded by you " +
        "(`canSeeItemImage`). The item itself is public; only its images " +
        "are gated.",
      args: t.arg.connectionArgs(),
      resolve: async (item, args, context) =>
        connectionFromPage(
          await context
            .actor(ItemActorDescriptor, itemActorId(item))
            .images(toPageArgs(args)),
        ),
    }),

    reviews: t.field({
      type: ItemReviewConnection,
      args: t.arg.connectionArgs(),
      resolve: async (item, args, context) =>
        connectionFromPage(
          await context
            .actor(ItemActorDescriptor, itemActorId(item))
            .reviews(toPageArgs(args)),
        ),
    }),

    brands: t.field({
      type: ItemBrandConnection,
      description:
        "`item_brands` — which brands made this, and which is primary.",
      args: t.arg.connectionArgs(),
      resolve: async (item, args, context) =>
        connectionFromPage(
          await context
            .actor(ItemActorDescriptor, itemActorId(item))
            .brands(toPageArgs(args)),
        ),
    }),

    /**
     * The *item-scoped* check-in list (C3, §2.2), which is a different surface
     * from `Cellar.checkIns` and takes a different rule on purpose (§1.6):
     * `canSeeCheckIn` — the author, or a friend of the author, or anyone who
     * can see the cellar the bottle sat in. It is reached by naming an item,
     * never a cellar, so it names the drinker and not the collection.
     */
    checkIns: t.field({
      type: ItemCheckInConnection,
      description:
        "Who drank this, and when — yours plus your friends', across every " +
        "cellar (`canSeeCheckIn`, §1.6). Deliberately does not say which " +
        "cellar the bottle came from; `Cellar.checkIns` is the surface that " +
        "does, and it is gated on the cellar instead.",
      args: t.arg.connectionArgs(),
      resolve: async (item, args, context) => {
        const viewerId = context.ctx.viewerId;
        if (viewerId === null) {
          throw new ForbiddenError("sign in to see check-ins");
        }
        return connectionFromPage(
          await context
            .actor(
              CheckInsCollectionActorDescriptor,
              viewerCollectionActorId(viewerId),
            )
            .list({ type: item.type, id: item.id }, toPageArgs(args)),
        );
      },
    }),
  }),
});

ItemCheckInType.implement({
  description:
    "A check-in on this item. `cellarItemId` is deliberately absent — see " +
    "`Item.checkIns`.",
  fields: (t) => ({
    id: t.exposeID("id"),
    userId: t.exposeID("userId", {
      description:
        "Who the check-in is *about*, which `bulkCheckIn` makes different " +
        "from who wrote it.",
    }),
    item: t.field({
      type: ItemInterface,
      description: "The item, echoed back. Resolved through its DataLoader.",
      resolve: (checkIn) => itemActorId(checkIn.item),
    }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});

/**
 * The concrete types. Each adds only its own columns — the interface's fields
 * are inherited. B2 extends these; adding a type means adding a table, which
 * is a `packages/db` change first.
 */
builder.objectRef<Extract<ItemDto, { type: "WINE" }>>("Wine").implement({
  interfaces: [ItemInterface],
  fields: (t) => ({
    vintage: t.expose("vintage", { type: "Date", nullable: true }),
    variety: t.exposeString("variety", { nullable: true }),
    region: t.exposeString("region", { nullable: true }),
    /**
     * `wines.style` is `NOT NULL`, and this is `String` anyway (A7c (4)).
     *
     * `Beer.style` and `Spirit.style` are nullable columns, and graphql-js
     * applies `SameResponseShape` to *mutually exclusive* fragments: `String!`
     * here rejected any document that read `style` on more than one item type,
     * with no fix available to the client but an alias per type. One surface
     * beats one extra guarantee — the value is still never null in practice.
     */
    style: t.exposeString("style", { nullable: true }),
    specialDesignation: t.exposeString("specialDesignation", {
      nullable: true,
    }),
    vineyardDesignation: t.exposeString("vineyardDesignation", {
      nullable: true,
    }),
    alcoholContentPercentage: t.exposeFloat("alcoholContentPercentage", {
      nullable: true,
    }),
  }),
});

builder.objectRef<Extract<ItemDto, { type: "BEER" }>>("Beer").implement({
  interfaces: [ItemInterface],
  fields: (t) => ({
    style: t.exposeString("style", { nullable: true }),
    vintage: t.expose("vintage", { type: "Date", nullable: true }),
    internationalBitternessUnit: t.exposeInt("internationalBitternessUnit", {
      nullable: true,
    }),
    alcoholContentPercentage: t.exposeFloat("alcoholContentPercentage", {
      nullable: true,
    }),
  }),
});

builder.objectRef<Extract<ItemDto, { type: "SPIRIT" }>>("Spirit").implement({
  interfaces: [ItemInterface],
  fields: (t) => ({
    spiritType: t.exposeString("spiritType", {
      description: "`spirits.type`, a reference-table value.",
    }),
    style: t.exposeString("style", { nullable: true }),
    vintage: t.expose("vintage", { type: "Date", nullable: true }),
    alcoholContentPercentage: t.exposeFloat("alcoholContentPercentage", {
      nullable: true,
    }),
  }),
});

builder.objectRef<Extract<ItemDto, { type: "COFFEE" }>>("Coffee").implement({
  interfaces: [ItemInterface],
  fields: (t) => ({
    roastLevel: t.exposeString("roastLevel", { nullable: true }),
    process: t.exposeString("process", { nullable: true }),
    species: t.exposeString("species", { nullable: true }),
    cultivar: t.exposeString("cultivar", { nullable: true }),
  }),
});

builder.objectRef<Extract<ItemDto, { type: "SAKE" }>>("Sake").implement({
  interfaces: [ItemInterface],
  fields: (t) => ({
    category: t.exposeString("category", { nullable: true }),
    sakeType: t.exposeString("sakeType", {
      nullable: true,
      description: "`sakes.type`, a reference-table value.",
    }),
    region: t.exposeString("region", { nullable: true }),
    polishGrade: t.exposeFloat("polishGrade", { nullable: true }),
    servingTemperature: t.exposeString("servingTemperature", {
      nullable: true,
    }),
    riceVariety: t.exposeString("riceVariety", { nullable: true }),
    vintageYear: t.exposeInt("vintageYear", {
      nullable: true,
      description:
        "`sakes.vintage`, an integer year. Deliberately not called `vintage`: " +
        "the other five carry a `Date`, and one field name may not have two " +
        "types across siblings of an interface (A7c).",
    }),
    alcoholContentPercentage: t.exposeFloat("alcoholContentPercentage", {
      nullable: true,
    }),
    // UI parity G12.
    sakeMeterValue: t.exposeFloat("sakeMeterValue", {
      nullable: true,
      description: "Nihonshu-do: dry (+) to sweet (−).",
    }),
    acidity: t.exposeFloat("acidity", { nullable: true }),
    aminoAcid: t.exposeFloat("aminoAcid", { nullable: true }),
    yeastStrain: t.exposeString("yeastStrain", { nullable: true }),
  }),
});

builder.objectRef<Extract<ItemDto, { type: "TEA" }>>("Tea").implement({
  interfaces: [ItemInterface],
  fields: (t) => ({
    category: t.exposeString("category", { nullable: true }),
    form: t.exposeString("form", { nullable: true }),
    caffeineLevel: t.exposeString("caffeineLevel", { nullable: true }),
    region: t.exposeString("region", { nullable: true }),
    cultivar: t.exposeString("cultivar", { nullable: true }),
    harvestYear: t.exposeInt("harvestYear", { nullable: true }),
    // UI parity G13.
    oxidationLevel: t.exposeString("oxidationLevel", { nullable: true }),
    processing: t.exposeString("processing", { nullable: true }),
    ingredients: t.exposeString("ingredients", { nullable: true }),
    steepingTemperature: t.exposeString("steepingTemperature", {
      nullable: true,
    }),
    steepingTime: t.exposeString("steepingTime", { nullable: true }),
    flavorProfile: t.exposeString("flavorProfile", { nullable: true }),
    isOrganic: t.exposeBoolean("isOrganic", {
      nullable: true,
      description: "Null when not recorded — not the same as false.",
    }),
    isFairTrade: t.exposeBoolean("isFairTrade", {
      nullable: true,
      description: "Null when not recorded — not the same as false.",
    }),
  }),
});

/**
 * One connection type for items, shared by every field that returns a list of
 * them — favourites, a cellar's contents, search results, rankings. Pothos's
 * `t.connection` would otherwise mint `<Parent><Field>Connection` per field and
 * leave the frontend with a dozen structurally identical types.
 *
 * Use it as:
 *
 * ```ts
 * t.field({ type: ItemConnection, args: t.arg.connectionArgs(), resolve: ... })
 * ```
 */
export const ItemConnection = builder.connectionObject(
  { type: ItemInterface, name: "ItemConnection" },
  { name: "ItemEdge" },
);

/**
 * **`Brand.items` — A7g, and it lives here rather than in `brand.ts`.**
 *
 * D4: *"`Brand` has no reverse edges at all"*, and the `/brands/[id]` page
 * shipped an alert saying so with a link out to `/search`. This is the items
 * half.
 *
 * It is declared from *this* module because `brand.ts` cannot import
 * `item.ts`: this file already imports `Brand`, and the reverse import would
 * be a cycle that collapses both types to `any` (TS7022). `builder.objectFields`
 * on another module's ref is the established answer here — `place.ts` grows
 * `tier-list.ts`'s `Place`, and B4 grows `Viewer` the same way. `index.ts`
 * imports `brand.ts` before `item.ts`, so the ref exists by the time this runs.
 *
 * `BrandLinksCollectionActor` answers it, **not** `BrandActor`: `item_brands`
 * is `ItemActor`'s table (`TABLE_WRITERS`), and §1.3 lets an entity actor
 * cache only what it writes. A collection actor reading any table with no
 * cache is precisely §1.1's grant, and it adds no synchronous edge to §8.5's
 * closed set — which a `BrandActor → ItemActor` call would have.
 *
 * The actor returns `ItemRef`s, so the page is one batched fan-out through the
 * `Item` loader rather than N sequential activations (§1.5).
 */
builder.objectFields(Brand, (t) => ({
  items: t.field({
    type: ItemConnection,
    description:
      "Items this brand made — the reverse of `Item.brands`. Primary links " +
      "first (`item_brands.is_primary`), then oldest link first. Catalog " +
      "data: any signed-in viewer.",
    args: t.arg.connectionArgs(),
    resolve: async (brand, args, context) => {
      const filter = { brandId: brand.id };
      const page = await context
        .actor(
          BrandLinksCollectionActorDescriptor,
          brandLinksCollectionActorId(filter),
        )
        .items(filter, toPageArgs(args));
      // Ids, not objects: the `Item` loader turns them into typed items, the
      // same mapping `Viewer.favorites` does with the same actor shape.
      return connectionFromPage(mapPage(page, itemActorId));
    },
  }),
}));

/* -------------------------------------------------------------------------- */
/* `generic_items` — the seventh key namespace, not an `Item`                   */
/* -------------------------------------------------------------------------- */

/**
 * Deliberately **not** an implementation of `Item`, and the database is the
 * reason: no satellite table has a `generic_item_id` column, so a generic item
 * has no images, no vector, no reviews, no brands, and cannot sit in a cellar
 * or be favourited. It shares an actor class with an item (`ItemActor` is the
 * single writer of `generic_items`, §3) and shares nothing else. B6 surfaces it
 * on `RecipeIngredient`.
 */
export const GenericItemKindEnum = builder.enumType("GenericItemKind", {
  description:
    "`generic_items.item_type` — a text check constraint over " +
    "the six item types, lowercase, plus `ingredient` — not the `item_type` enum. " +
    "Note `ingredient`, which `ItemType` cannot represent.",
  values: GENERIC_ITEM_KINDS,
});

export const GenericItemType = builder
  .objectRef<GenericItemDto>("GenericItem")
  .implement({
    description:
      "A recipe ingredient — salt, or 'London dry gin'. Not an Item: see " +
      "the module doc in packages/contracts/src/items.ts.",
    fields: (t) => ({
      id: t.exposeID("id"),
      name: t.exposeString("name"),
      category: t.exposeString("category"),
      subcategory: t.exposeString("subcategory", { nullable: true }),
      kind: t.field({ type: GenericItemKindEnum, resolve: (g) => g.kind }),
      description: t.exposeString("description", { nullable: true }),
      isSubstitutable: t.exposeBoolean("isSubstitutable"),
      createdById: t.exposeID("createdById", {
        nullable: true,
        description:
          "Nullable and `ON DELETE SET NULL`, unlike the six item tables.",
      }),
      createdAt: t.expose("createdAt", { type: "DateTime" }),
      updatedAt: t.expose("updatedAt", { type: "DateTime" }),
    }),
  });

const DeletedItemReviewType = builder
  .objectRef<DeletedItemReview>("DeletedItemReview")
  .implement({ fields: (t) => ({ id: t.exposeID("id") }) });

const DetachedItemImageType = builder
  .objectRef<DetachedItemImage>("DetachedItemImage")
  .implement({ fields: (t) => ({ id: t.exposeID("id") }) });

const UnlinkedItemBrandType = builder
  .objectRef<UnlinkedItemBrand>("UnlinkedItemBrand")
  .implement({ fields: (t) => ({ brandId: t.exposeID("brandId") }) });

/* -------------------------------------------------------------------------- */
/* Inputs                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * GraphQL has no input unions, so `CreateItemInput` carries all six attribute
 * bags and the actor requires the one matching `type` — which is also where
 * the per-table NOT NULL columns are enforced with a message a client can act
 * on (`wines.vintage`, `wines.style`, `spirits.type`, `coffees.description`).
 */
const WineAttributesInput = builder.inputType("WineAttributesInput", {
  fields: (t) => ({
    vintage: t.field({ type: "Date", required: false }),
    variety: t.string({ required: false }),
    region: t.string({ required: false }),
    style: t.string({ required: false }),
    specialDesignation: t.string({ required: false }),
    vineyardDesignation: t.string({ required: false }),
    alcoholContentPercentage: t.float({ required: false }),
  }),
});

const BeerAttributesInput = builder.inputType("BeerAttributesInput", {
  fields: (t) => ({
    style: t.string({ required: false }),
    vintage: t.field({ type: "Date", required: false }),
    internationalBitternessUnit: t.int({ required: false }),
    alcoholContentPercentage: t.float({ required: false }),
  }),
});

const SpiritAttributesInput = builder.inputType("SpiritAttributesInput", {
  fields: (t) => ({
    spiritType: t.string({
      required: false,
      description: "`spirits.type`, a reference-table value. NOT NULL.",
    }),
    style: t.string({ required: false }),
    vintage: t.field({ type: "Date", required: false }),
    alcoholContentPercentage: t.float({ required: false }),
  }),
});

const CoffeeAttributesInput = builder.inputType("CoffeeAttributesInput", {
  fields: (t) => ({
    roastLevel: t.string({ required: false }),
    process: t.string({ required: false }),
    species: t.string({ required: false }),
    cultivar: t.string({ required: false }),
  }),
});

const SakeAttributesInput = builder.inputType("SakeAttributesInput", {
  fields: (t) => ({
    category: t.string({ required: false }),
    sakeType: t.string({ required: false }),
    region: t.string({ required: false }),
    polishGrade: t.float({ required: false }),
    alcoholContentPercentage: t.float({ required: false }),
    servingTemperature: t.string({ required: false }),
    riceVariety: t.string({ required: false }),
    vintageYear: t.int({
      required: false,
      description:
        "`sakes.vintage` is an integer year — see `Sake.vintageYear` for why " +
        "it is not called `vintage` on the wire.",
    }),
    sakeMeterValue: t.float({ required: false }),
    acidity: t.float({ required: false }),
    aminoAcid: t.float({ required: false }),
    yeastStrain: t.string({ required: false }),
  }),
});

const TeaAttributesInput = builder.inputType("TeaAttributesInput", {
  fields: (t) => ({
    category: t.string({ required: false }),
    form: t.string({ required: false }),
    caffeineLevel: t.string({ required: false }),
    region: t.string({ required: false }),
    cultivar: t.string({ required: false }),
    harvestYear: t.int({ required: false }),
    oxidationLevel: t.string({ required: false }),
    processing: t.string({ required: false }),
    ingredients: t.string({ required: false }),
    steepingTemperature: t.string({ required: false }),
    steepingTime: t.string({ required: false }),
    flavorProfile: t.string({ required: false }),
    isOrganic: t.boolean({
      required: false,
      description:
        "Inside an update bag, `null` clears it to 'not recorded' and an " +
        "omitted key leaves it alone, like every attribute.",
    }),
    isFairTrade: t.boolean({ required: false }),
  }),
});

const CreateItemInput = builder.inputType("CreateItemInput", {
  description:
    "Pass exactly the attribute bag matching `type`. `itemOnboardingId` is " +
    "NOT NULL on wines, beers, spirits and coffees — those four cannot " +
    "exist without an onboarding row, which is why the normal path is " +
    "`confirmItemOnboarding` rather than this field.",
  fields: (t) => ({
    name: t.string({ required: true }),
    description: t.string({ required: false }),
    country: t.string({ required: false }),
    barcodeCode: t.string({
      required: false,
      description: "Must already exist — register it with `ensureBarcode`.",
    }),
    itemOnboardingId: t.id({ required: false }),
    wine: t.field({ type: WineAttributesInput, required: false }),
    beer: t.field({ type: BeerAttributesInput, required: false }),
    spirit: t.field({ type: SpiritAttributesInput, required: false }),
    coffee: t.field({ type: CoffeeAttributesInput, required: false }),
    sake: t.field({ type: SakeAttributesInput, required: false }),
    tea: t.field({ type: TeaAttributesInput, required: false }),
  }),
});

const UpdateItemInput = builder.inputType("UpdateItemInput", {
  description: "Only the fields you pass are written. Creator only.",
  fields: (t) => ({
    name: t.string({ required: false }),
    description: t.string({ required: false }),
    country: t.string({ required: false }),
    wine: t.field({ type: WineAttributesInput, required: false }),
    beer: t.field({ type: BeerAttributesInput, required: false }),
    spirit: t.field({ type: SpiritAttributesInput, required: false }),
    coffee: t.field({ type: CoffeeAttributesInput, required: false }),
    sake: t.field({ type: SakeAttributesInput, required: false }),
    tea: t.field({ type: TeaAttributesInput, required: false }),
  }),
});

const AttachItemImageInput = builder.inputType("AttachItemImageInput", {
  fields: (t) => ({
    fileId: t.id({
      required: true,
      description:
        "A `files.id` whose object `FileActor.verify` confirms. An " +
        "unverified file is refused with `ConflictError`.",
    }),
    isPublic: t.boolean({ required: false }),
    placeholder: t.string({ required: false }),
    imageId: t.id({
      required: false,
      description: "Mint it to make the call idempotent (§8.4).",
    }),
  }),
});

const AddItemReviewInput = builder.inputType("AddItemReviewInput", {
  fields: (t) => ({
    score: t.float({ required: true }),
    text: t.field({ type: "JSON", required: false }),
    reviewId: t.id({ required: false }),
  }),
});

const UpdateItemReviewInput = builder.inputType("UpdateItemReviewInput", {
  fields: (t) => ({
    score: t.float({
      required: false,
      description:
        "Omit to leave the score unchanged. A review always has a score, so " +
        "`null` is a ValidationError rather than a clear.",
    }),
    text: t.field({ type: "JSON", required: false }),
  }),
});

const CreateGenericItemInput = builder.inputType("CreateGenericItemInput", {
  fields: (t) => ({
    name: t.string({ required: true }),
    category: t.string({ required: true }),
    subcategory: t.string({ required: false }),
    kind: t.field({ type: GenericItemKindEnum, required: true }),
    description: t.string({ required: false }),
    isSubstitutable: t.boolean({ required: false }),
  }),
});

const UpdateGenericItemInput = builder.inputType("UpdateGenericItemInput", {
  fields: (t) => ({
    name: t.string({ required: false }),
    category: t.string({ required: false }),
    subcategory: t.string({ required: false }),
    kind: t.field({ type: GenericItemKindEnum, required: false }),
    description: t.string({ required: false }),
    isSubstitutable: t.boolean({
      required: false,
      description:
        "Omit to leave it unchanged. `null` resets it to the default, `true` " +
        "(it is never stored as null).",
    }),
  }),
});

/* -------------------------------------------------------------------------- */
/* Argument marshalling                                                        */
/* -------------------------------------------------------------------------- */

type Bags = Pick<
  CreateItemInputType,
  "wine" | "beer" | "spirit" | "coffee" | "sake" | "tea"
>;

/** A `null` bag is "no bag": nothing of that type's to write. */
const bags = (input: Bags): Bags => ({
  ...(present(input.wine) ? { wine: input.wine } : {}),
  ...(present(input.beer) ? { beer: input.beer } : {}),
  ...(present(input.spirit) ? { spirit: input.spirit } : {}),
  ...(present(input.coffee) ? { coffee: input.coffee } : {}),
  ...(present(input.sake) ? { sake: input.sake } : {}),
  ...(present(input.tea) ? { tea: input.tea } : {}),
});

const toCreateItemInput = (
  input: typeof CreateItemInput.$inferInput,
): CreateItemInputType => ({
  name: input.name,
  description: input.description ?? null,
  country: input.country ?? null,
  barcodeCode: input.barcodeCode ?? null,
  ...(present(input.itemOnboardingId)
    ? { itemOnboardingId: String(input.itemOnboardingId) }
    : {}),
  ...bags(input),
});

/** A `null` bag is "no bag", as on create. */
const UPDATE_ITEM = {
  name: "keep",
  description: "clearable",
  country: "clearable",
  wine: "keep",
  beer: "keep",
  spirit: "keep",
  coffee: "keep",
  sake: "keep",
  tea: "keep",
} satisfies PatchPolicy<typeof UpdateItemInput.$inferInput>;

const UPDATE_ITEM_REVIEW = {
  // `item_reviews.score` is NOT NULL and the contract's `score?: number` has
  // no null. Legacy Hasura errored on `_set: { score: null }`; so does this.
  score: "reject",
  text: { policy: "clearable", map: (text) => JSON.stringify(text) },
} satisfies PatchPolicy<typeof UpdateItemReviewInput.$inferInput>;

const UPDATE_GENERIC_ITEM = {
  name: "keep",
  category: "keep",
  subcategory: "clearable",
  kind: { policy: "keep", map: (kind) => kind as GenericItemKind },
  description: "clearable",
  // Forwarded as null; ItemActor.updateGeneric reads it as `?? true`, so null
  // resets the flag to its default rather than storing NULL (see the SDL).
  isSubstitutable: "clearable",
} satisfies PatchPolicy<typeof UpdateGenericItemInput.$inferInput>;

/* -------------------------------------------------------------------------- */
/* Root fields                                                                 */
/* -------------------------------------------------------------------------- */

builder.queryField("item", (t) =>
  t.field({
    type: ItemInterface,
    description:
      "One item by type and id — the single field through which all six " +
      "concrete types resolve. `NotFoundError` covers both 'no such item' " +
      "and 'not yours to see'.",
    /**
     * `directResult: false` **only here**, and only because GraphQL forces it:
     * a union member must be an object type, so a field returning the `Item`
     * *interface* cannot be a member of its own `<Command>Result` union
     * (Pothos says so outright — "must return an ObjectType when
     * 'directResult' is set to true"). The alternative was dropping
     * `errors: {}` from every item field, which would lose the typed error
     * union §8.3 asks for on exactly the fields most likely to return
     * `ForbiddenError`. So these three carry a one-field `…Success { data }`
     * wrapper and everything else in the schema keeps the direct result.
     */
    errors: { directResult: false },
    args: {
      type: t.arg({ type: ItemTypeEnum, required: true }),
      id: t.arg.id({ required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(
          ItemActorDescriptor,
          itemActorId({ type: args.type, id: String(args.id) }),
        )
        .get(),
  }),
);

builder.queryField("genericItem", (t) =>
  t.field({
    type: GenericItemType,
    description: "One `generic_items` row. Not an Item — see `GenericItem`.",
    errors: {},
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, context) =>
      context
        .actor(ItemActorDescriptor, genericItemActorId(String(args.id)))
        .getGeneric(),
  }),
);

/* -------------------------------------------------------------------------- */
/* Mutations                                                                   */
/* -------------------------------------------------------------------------- */

builder.mutationField("createItem", (t) =>
  t.field({
    type: ItemInterface,
    description:
      "Mints the id and addresses `ItemActor(type:id)` before any row " +
      "exists — the provisional-id pattern every `create` uses. Pass " +
      "`itemId` yourself to make the call idempotent (§8.4).",
    /**
     * `directResult: false` **only here**, and only because GraphQL forces it:
     * a union member must be an object type, so a field returning the `Item`
     * *interface* cannot be a member of its own `<Command>Result` union
     * (Pothos says so outright — "must return an ObjectType when
     * 'directResult' is set to true"). The alternative was dropping
     * `errors: {}` from every item field, which would lose the typed error
     * union §8.3 asks for on exactly the fields most likely to return
     * `ForbiddenError`. So these three carry a one-field `…Success { data }`
     * wrapper and everything else in the schema keeps the direct result.
     */
    errors: { directResult: false },
    args: {
      type: t.arg({ type: ItemTypeEnum, required: true }),
      itemId: t.arg.id({ required: false }),
      input: t.arg({ type: CreateItemInput, required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(
          ItemActorDescriptor,
          itemActorId({
            type: args.type,
            id:
              args.itemId === undefined || args.itemId === null
                ? randomUUID()
                : String(args.itemId),
          }),
        )
        .create(toCreateItemInput(args.input)),
  }),
);

builder.mutationField("updateItem", (t) =>
  t.field({
    type: ItemInterface,
    description: "Creator only. Enrichment updates arrive as `system` instead.",
    /**
     * `directResult: false` **only here**, and only because GraphQL forces it:
     * a union member must be an object type, so a field returning the `Item`
     * *interface* cannot be a member of its own `<Command>Result` union
     * (Pothos says so outright — "must return an ObjectType when
     * 'directResult' is set to true"). The alternative was dropping
     * `errors: {}` from every item field, which would lose the typed error
     * union §8.3 asks for on exactly the fields most likely to return
     * `ForbiddenError`. So these three carry a one-field `…Success { data }`
     * wrapper and everything else in the schema keeps the direct result.
     */
    errors: { directResult: false },
    args: {
      type: t.arg({ type: ItemTypeEnum, required: true }),
      itemId: t.arg.id({ required: true }),
      input: t.arg({ type: UpdateItemInput, required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(
          ItemActorDescriptor,
          itemActorId({ type: args.type, id: String(args.itemId) }),
        )
        .update(patch(args.input, UPDATE_ITEM) satisfies UpdateItemInputType),
  }),
);

builder.mutationField("attachItemImage", (t) =>
  t.field({
    type: ItemImageType,
    description:
      "Any signed-in viewer may add an image. The file is verified through " +
      "`FileActor` first — an upload that never landed is refused.",
    errors: {},
    args: {
      type: t.arg({ type: ItemTypeEnum, required: true }),
      itemId: t.arg.id({ required: true }),
      input: t.arg({ type: AttachItemImageInput, required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(
          ItemActorDescriptor,
          itemActorId({ type: args.type, id: String(args.itemId) }),
        )
        .attachImage({
          fileId: String(args.input.fileId),
          isPublic: args.input.isPublic ?? null,
          placeholder: args.input.placeholder ?? null,
          imageId:
            args.input.imageId === undefined || args.input.imageId === null
              ? null
              : String(args.input.imageId),
        } satisfies AttachItemImageInputType),
  }),
);

builder.mutationField("detachItemImage", (t) =>
  t.field({
    type: DetachedItemImageType,
    description: "The uploader's alone.",
    errors: {},
    args: {
      type: t.arg({ type: ItemTypeEnum, required: true }),
      itemId: t.arg.id({ required: true }),
      imageId: t.arg.id({ required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(
          ItemActorDescriptor,
          itemActorId({ type: args.type, id: String(args.itemId) }),
        )
        .detachImage(String(args.imageId)),
  }),
);

builder.mutationField("addItemReview", (t) =>
  t.field({
    type: ItemReviewType,
    errors: {},
    args: {
      type: t.arg({ type: ItemTypeEnum, required: true }),
      itemId: t.arg.id({ required: true }),
      input: t.arg({ type: AddItemReviewInput, required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(
          ItemActorDescriptor,
          itemActorId({ type: args.type, id: String(args.itemId) }),
        )
        .addReview({
          score: args.input.score,
          text:
            args.input.text === undefined || args.input.text === null
              ? null
              : JSON.stringify(args.input.text),
          reviewId:
            args.input.reviewId === undefined || args.input.reviewId === null
              ? null
              : String(args.input.reviewId),
        } satisfies AddItemReviewInputType),
  }),
);

builder.mutationField("updateItemReview", (t) =>
  t.field({
    type: ItemReviewType,
    description: "The author's alone.",
    errors: {},
    args: {
      type: t.arg({ type: ItemTypeEnum, required: true }),
      itemId: t.arg.id({ required: true }),
      reviewId: t.arg.id({ required: true }),
      input: t.arg({ type: UpdateItemReviewInput, required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(
          ItemActorDescriptor,
          itemActorId({ type: args.type, id: String(args.itemId) }),
        )
        .updateReview(
          String(args.reviewId),
          patch(
            args.input,
            UPDATE_ITEM_REVIEW,
          ) satisfies UpdateItemReviewInputType,
        ),
  }),
);

builder.mutationField("deleteItemReview", (t) =>
  t.field({
    type: DeletedItemReviewType,
    description: "The author's alone.",
    errors: {},
    args: {
      type: t.arg({ type: ItemTypeEnum, required: true }),
      itemId: t.arg.id({ required: true }),
      reviewId: t.arg.id({ required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(
          ItemActorDescriptor,
          itemActorId({ type: args.type, id: String(args.itemId) }),
        )
        .deleteReview(String(args.reviewId)),
  }),
);

builder.mutationField("linkItemBrand", (t) =>
  t.field({
    type: ItemBrandType,
    description:
      "The item creator's alone (today's `item_brands` insert check). " +
      "`brandId` comes from `resolveBrand`, never from a client-invented id.",
    errors: {},
    args: {
      type: t.arg({ type: ItemTypeEnum, required: true }),
      itemId: t.arg.id({ required: true }),
      brandId: t.arg.id({ required: true }),
      isPrimary: t.arg.boolean({ required: false }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(
          ItemActorDescriptor,
          itemActorId({ type: args.type, id: String(args.itemId) }),
        )
        .linkBrand({
          brandId: String(args.brandId),
          isPrimary: args.isPrimary ?? null,
        }),
  }),
);

builder.mutationField("unlinkItemBrand", (t) =>
  t.field({
    type: UnlinkedItemBrandType,
    errors: {},
    args: {
      type: t.arg({ type: ItemTypeEnum, required: true }),
      itemId: t.arg.id({ required: true }),
      brandId: t.arg.id({ required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(
          ItemActorDescriptor,
          itemActorId({ type: args.type, id: String(args.itemId) }),
        )
        .unlinkBrand(String(args.brandId)),
  }),
);

builder.mutationField("createGenericItem", (t) =>
  t.field({
    type: GenericItemType,
    errors: {},
    args: {
      genericItemId: t.arg.id({ required: false }),
      input: t.arg({ type: CreateGenericItemInput, required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(
          ItemActorDescriptor,
          genericItemActorId(
            args.genericItemId === undefined || args.genericItemId === null
              ? randomUUID()
              : String(args.genericItemId),
          ),
        )
        .createGeneric({
          name: args.input.name,
          category: args.input.category,
          subcategory: args.input.subcategory ?? null,
          kind: args.input.kind as GenericItemKind,
          description: args.input.description ?? null,
          isSubstitutable: args.input.isSubstitutable ?? null,
        } satisfies CreateGenericItemInputType),
  }),
);

builder.mutationField("updateGenericItem", (t) =>
  t.field({
    type: GenericItemType,
    description: "The creator's alone; an ownerless row is admin-only.",
    errors: {},
    args: {
      genericItemId: t.arg.id({ required: true }),
      input: t.arg({ type: UpdateGenericItemInput, required: true }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(
          ItemActorDescriptor,
          genericItemActorId(String(args.genericItemId)),
        )
        .updateGeneric(
          patch(
            args.input,
            UPDATE_GENERIC_ITEM,
          ) satisfies UpdateGenericItemInputType,
        ),
  }),
);
