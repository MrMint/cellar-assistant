/**
 * The catalog search fields — C1 (§2.3: `ItemSearchActor`,
 * `CellarItemSearchActor`, `BrandSearchActor`, `RecipeSearchActor`,
 * `UserSearchActor`).
 *
 * ## Every field addresses an actor whose id it computes from the arguments
 *
 * A search actor's id **is** its input (§1.5), so the resolver's job is to
 * build the input, hash it with the builder from
 * `@cellar-assistant/contracts`, and address that activation. The actor
 * recomputes the same hash and refuses anything that does not match, so a
 * client cannot aim a shared activation at a viewer-scoped question — see
 * `services/actors/src/lib/search-actor-base.ts`.
 *
 * Three of the ten builders put `context.ctx.viewerId` in the hash; the other
 * seven ignore the argument. Passing it uniformly is deliberate: the resolver
 * does not decide, the builder does, and `packages/contracts/src/search.test.ts`
 * asserts which is which.
 *
 * ## Hits carry their own projection *and* a link to the aggregate
 *
 * §2.3 has these actors return projections rather than ids, and §1.5 explains
 * why: a result list wants a name and a distance, and resolving fifty ids
 * through a DataLoader to render fifty names is fifty actor calls for data the
 * search already had. So `ItemSearchResult.name` costs nothing.
 *
 * The `item` / `brand` field on each hit is the escape hatch for a client that
 * needs more, and it goes through the *existing* loader on `Item` and `Brand` —
 * so asking for it on a page of twenty is one batched round of twenty parallel
 * entity calls, not twenty sequential ones. A client that only wants a name
 * never triggers it.
 *
 * ## Pagination is a connection, and it never reaches the actor's key
 *
 * `first`/`after` are §8.3's requirement and §1.5's exclusion at the same time:
 * every field here is a Relay connection, and no page argument is part of the
 * hash — which is exactly what lets one activation serve every page from one
 * query.
 */
import type {
  BrandSearchHit,
  CellarItemSearchHit,
  ItemSearchHit,
  RecipeSearchHit,
  UserSearchHit,
} from "@cellar-assistant/contracts";
import {
  BRAND_SEARCH_RESULT_CAP,
  BrandSearchActorDescriptor,
  brandSearchActorId,
  CellarItemSearchActorDescriptor,
  cellarItemSearchActorId,
  ITEM_SEARCH_RESULT_CAP,
  ItemSearchActorDescriptor,
  itemActorId,
  itemSearchActorId,
  RECIPE_SEARCH_RESULT_CAP,
  RecipeSearchActorDescriptor,
  recipeSearchActorId,
  USER_SEARCH_RESULT_CAP,
  UserSearchActorDescriptor,
  userSearchActorId,
} from "@cellar-assistant/contracts";
import { Brand } from "./brand.ts";
import { builder } from "./builder.ts";
import { ItemInterface, ItemTypeEnum } from "./item.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";
import { RecipeType_ } from "./recipe.ts";

/* -------------------------------------------------------------------------- */
/* Item search                                                                 */
/* -------------------------------------------------------------------------- */

const ItemSearchResult = builder
  .objectRef<ItemSearchHit>("ItemSearchResult")
  .implement({
    description:
      "One item-vector match. `id`, `type` and `name` come from the search " +
      "itself; `item` resolves the full aggregate through the Item loader.",
    fields: (t) => ({
      id: t.exposeID("id"),
      type: t.field({ type: ItemTypeEnum, resolve: (hit) => hit.type }),
      name: t.exposeString("name"),
      distance: t.exposeFloat("distance", {
        description: "Cosine distance to the query, 0-2. Lower is closer.",
      }),
      item: t.field({
        type: ItemInterface,
        description: "The full item. One batched loader call per page.",
        resolve: (hit) => itemActorId(hit),
      }),
    }),
  });

const ItemSearchConnection = builder.connectionObject(
  { type: ItemSearchResult, name: "ItemSearchConnection" },
  { name: "ItemSearchEdge" },
);

builder.queryField("itemSearch", (t) =>
  t.field({
    type: ItemSearchConnection,
    description:
      "Semantic item search over `item_vectors` (ItemSearchActor). Replaces " +
      "the `text_search` and `image_search` native queries: pass `text` for a " +
      "phrase, or `vector` for an image embedding the client already has.",
    // A7e — an error union, for the reason `pagination.ts` records.
    errors: {},
    args: {
      ...t.arg.connectionArgs(),
      text: t.arg.string({ required: false }),
      vector: t.arg.floatList({
        required: false,
        description:
          "A 768-dimension embedding, for image search. Exactly one of " +
          "`text` or `vector` is required.",
      }),
      itemTypes: t.arg({ type: [ItemTypeEnum], required: false }),
      maxDistance: t.arg.float({ required: false }),
      limit: t.arg.int({
        required: false,
        description:
          `How many results the actor holds — 1 to ${ITEM_SEARCH_RESULT_CAP} ` +
          "inclusive, and over the cap is a `VALIDATION` error rather than a " +
          "silent clamp (A7g). Not pagination: `first`/`after` " +
          "page this set, and neither is part of the actor's key.",
      }),
    },
    resolve: async (_root, args, context) => {
      const input = {
        text: args.text ?? null,
        vector: args.vector ?? null,
        itemTypes: args.itemTypes ?? null,
        maxDistance: args.maxDistance ?? null,
        limit: args.limit ?? null,
      };
      return connectionFromPage(
        await context
          .actor(
            ItemSearchActorDescriptor,
            itemSearchActorId(input, context.ctx.viewerId),
          )
          .results(input, toPageArgs(args)),
      );
    },
  }),
);

/* -------------------------------------------------------------------------- */
/* In-cellar search                                                            */
/* -------------------------------------------------------------------------- */

const CellarItemSearchResult = builder
  .objectRef<CellarItemSearchHit>("CellarItemSearchResult")
  .implement({
    description: "One cellar item, ranked against the query.",
    fields: (t) => ({
      cellarItemId: t.exposeID("cellarItemId"),
      distance: t.float({
        nullable: true,
        description:
          "Null when the item has no embedding yet. Those sort last rather " +
          "than disappearing: a semantic sort is an ordering, not a filter.",
        resolve: (hit) => hit.distance,
      }),
      item: t.field({
        type: ItemInterface,
        resolve: (hit) => itemActorId(hit.item),
      }),
    }),
  });

const CellarItemSearchConnection = builder.connectionObject(
  { type: CellarItemSearchResult, name: "CellarItemSearchConnection" },
  { name: "CellarItemSearchEdge" },
);

builder.queryField("cellarItemSearch", (t) =>
  t.field({
    type: CellarItemSearchConnection,
    description:
      "Semantic sort of one cellar's contents (CellarItemSearchActor). " +
      "Viewer-scoped: the cellar's own visibility rule applies, and the " +
      "viewer is part of the actor's key.",
    // A7e — an error union, for the reason `pagination.ts` records.
    errors: {},
    args: {
      ...t.arg.connectionArgs(),
      cellarId: t.arg.id({ required: true }),
      query: t.arg.string({ required: true }),
      limit: t.arg.int({
        required: false,
        description:
          `How many results the actor holds — 1 to ${ITEM_SEARCH_RESULT_CAP} ` +
          "inclusive; over the cap is a `VALIDATION` error, not a silent " +
          "clamp (A7g). Not pagination: `first`/`after` page this set.",
      }),
    },
    resolve: async (_root, args, context) => {
      const input = {
        cellarId: String(args.cellarId),
        query: args.query,
        limit: args.limit ?? null,
      };
      return connectionFromPage(
        await context
          .actor(
            CellarItemSearchActorDescriptor,
            cellarItemSearchActorId(input, context.ctx.viewerId),
          )
          .results(input, toPageArgs(args)),
      );
    },
  }),
);

/* -------------------------------------------------------------------------- */
/* Brand search                                                                */
/* -------------------------------------------------------------------------- */

const BrandSearchResult = builder
  .objectRef<BrandSearchHit>("BrandSearchResult")
  .implement({
    description:
      "One brand match, with everything the picker renders already in hand.",
    fields: (t) => ({
      id: t.exposeID("id"),
      name: t.exposeString("name"),
      brandType: t.exposeString("brandType", { nullable: true }),
      logoUrl: t.exposeString("logoUrl", { nullable: true }),
      brand: t.field({ type: Brand, resolve: (hit) => hit.id }),
    }),
  });

const BrandSearchConnection = builder.connectionObject(
  { type: BrandSearchResult, name: "BrandSearchConnection" },
  { name: "BrandSearchEdge" },
);

builder.queryField("brandSearch", (t) =>
  t.field({
    type: BrandSearchConnection,
    description:
      "Brand autocomplete (BrandSearchActor). `term` is a term, not a " +
      "pattern: `%` and `_` match themselves.",
    // A7e — an error union, for the reason `pagination.ts` records.
    errors: {},
    args: {
      ...t.arg.connectionArgs(),
      term: t.arg.string({ required: false }),
      limit: t.arg.int({
        required: false,
        description:
          `How many results the actor holds — 1 to ${BRAND_SEARCH_RESULT_CAP} ` +
          "inclusive; over the cap is a `VALIDATION` error, not a silent " +
          "clamp (A7g). Not pagination: `first`/`after` page this set.",
      }),
    },
    resolve: async (_root, args, context) => {
      const input = { term: args.term ?? null, limit: args.limit ?? null };
      return connectionFromPage(
        await context
          .actor(
            BrandSearchActorDescriptor,
            brandSearchActorId(input, context.ctx.viewerId),
          )
          .results(input, toPageArgs(args)),
      );
    },
  }),
);

/* -------------------------------------------------------------------------- */
/* Recipe search                                                               */
/* -------------------------------------------------------------------------- */

/**
 * `recipe: Recipe` is the two lines C1 predicted (A7d item 5).
 *
 * C1 left it out on purpose: B6 owned the `Recipe` object type and was
 * building it in parallel, so a field here pointing at it would have put two
 * workstreams in one file. Both have landed, so this is the link — and
 * without it a search hit has no score, ingredient count or image, which is
 * the whole of what D6 reported.
 *
 * `RecipeType_` is loadable, so the field costs one batched fan-out for the
 * page rather than one `RecipeActor.get` per hit — the same shape
 * `BrandSearchResult.brand` above already uses. Cross-module import of the ref
 * is established (`menu-scan.ts` does it) and cycle-free: `recipe.ts` does not
 * import this module.
 *
 * The projection fields stay. They are what a result card renders, and
 * dropping them would make every list pay for a fan-out it does not need.
 */
const RecipeSearchResult = builder
  .objectRef<RecipeSearchHit>("RecipeSearchResult")
  .implement({
    fields: (t) => ({
      recipeId: t.exposeID("recipeId"),
      recipe: t.field({
        type: RecipeType_,
        description:
          "The full recipe — score, ingredient count, image. Batched " +
          "through the `Recipe` DataLoader, so a page is one fan-out.",
        resolve: (hit) => hit.recipeId,
      }),
      name: t.exposeString("name"),
      description: t.exposeString("description", { nullable: true }),
      type: t.exposeString("type", { description: "`food` or `cocktail`." }),
      recipeGroupId: t.exposeID("recipeGroupId", { nullable: true }),
      distance: t.float({
        nullable: true,
        description: "Present only on a `semanticQuery` search. Cosine, 0-2.",
        resolve: (hit) => hit.distance,
      }),
    }),
  });

const RecipeSearchConnection = builder.connectionObject(
  { type: RecipeSearchResult, name: "RecipeSearchConnection" },
  { name: "RecipeSearchEdge" },
);

builder.queryField("recipeSearch", (t) =>
  t.field({
    type: RecipeSearchConnection,
    description:
      "Recipe search (RecipeSearchActor). `term` matches name, description " +
      "and type; `semanticQuery` ranks by `recipe_vectors` distance; both " +
      "together narrow with the first and rank with the second.",
    // A7e — an error union, for the reason `pagination.ts` records.
    errors: {},
    args: {
      ...t.arg.connectionArgs(),
      term: t.arg.string({ required: false }),
      semanticQuery: t.arg.string({ required: false }),
      type: t.arg.string({ required: false }),
      maxDistance: t.arg.float({ required: false }),
      limit: t.arg.int({
        required: false,
        description:
          `How many results the actor holds — 1 to ${RECIPE_SEARCH_RESULT_CAP} ` +
          "inclusive; over the cap is a `VALIDATION` error, not a silent " +
          "clamp (A7g). Not pagination: `first`/`after` page this set.",
      }),
    },
    resolve: async (_root, args, context) => {
      const input = {
        term: args.term ?? null,
        semanticQuery: args.semanticQuery ?? null,
        type: args.type ?? null,
        maxDistance: args.maxDistance ?? null,
        limit: args.limit ?? null,
      };
      return connectionFromPage(
        await context
          .actor(
            RecipeSearchActorDescriptor,
            recipeSearchActorId(input, context.ctx.viewerId),
          )
          .results(input, toPageArgs(args)),
      );
    },
  }),
);

/* -------------------------------------------------------------------------- */
/* User search                                                                 */
/* -------------------------------------------------------------------------- */

const UserSearchResult = builder
  .objectRef<UserSearchHit>("UserSearchResult")
  .implement({
    description:
      "Someone the viewer could send a friend request to. The viewer, their " +
      "friends, and anyone with a request open in either direction are never " +
      "in this list.",
    fields: (t) => ({
      userId: t.exposeID("userId"),
      displayName: t.exposeString("displayName"),
      avatarUrl: t.exposeString("avatarUrl", { nullable: true }),
    }),
  });

const UserSearchConnection = builder.connectionObject(
  { type: UserSearchResult, name: "UserSearchConnection" },
  { name: "UserSearchEdge" },
);

builder.queryField("userSearch", (t) =>
  t.field({
    type: UserSearchConnection,
    description:
      "Friend search (UserSearchActor). Viewer-scoped: two people searching " +
      "the same word get different answers, so the viewer is in the key.",
    // A7e — an error union, for the reason `pagination.ts` records.
    errors: {},
    args: {
      ...t.arg.connectionArgs(),
      term: t.arg.string({ required: true }),
      limit: t.arg.int({
        required: false,
        description:
          `How many results the actor holds — 1 to ${USER_SEARCH_RESULT_CAP} ` +
          "inclusive; over the cap is a `VALIDATION` error, not a silent " +
          "clamp (A7g). Not pagination: `first`/`after` page this set.",
      }),
    },
    resolve: async (_root, args, context) => {
      const input = { term: args.term, limit: args.limit ?? null };
      return connectionFromPage(
        await context
          .actor(
            UserSearchActorDescriptor,
            userSearchActorId(input, context.ctx.viewerId),
          )
          .results(input, toPageArgs(args)),
      );
    },
  }),
);
