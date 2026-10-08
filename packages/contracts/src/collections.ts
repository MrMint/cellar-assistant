/**
 * Collection actors (migration plan §2.2; workstream C3).
 *
 * The category §1.1 describes in one line — *writes nothing, reads any table
 * directly via Drizzle, keyed by viewer id or a scope id, cache: none or
 * short-lived* — and the category §1.5 gives its one real design rule to:
 *
 * > Collection actors return **either ids or full projections, declared per
 * > method** in the contract. Ids for owned lists whose entity actors are cheap
 * > and likely warm; projections for high-cardinality catalog lists (map, item
 * > search, brand index). Pothos resolves ids through a DataLoader that batches
 * > into parallel entity-actor calls.
 *
 * **This file is where that declaration lives.** Every method below is marked
 * `ids` or `projection` in its JSDoc, with the reason, and the reason is always
 * one of exactly three:
 *
 * | Answer | When |
 * |---|---|
 * | **ids** | the row has an entity actor of its own, cheap and likely warm, and the client asks for far more of the entity than this list holds |
 * | **projection** | the list is a high-cardinality catalog, or the row has **no entity actor at all** |
 *
 * The second half of the projection case is not in §2.2 and is the more common
 * one here: a `check_ins` row is owned by `CellarActor`, which is keyed by
 * *cellar*, and a `item_match_suggestions` row is owned by `MenuScanActor`,
 * which is keyed by *scan*. Neither is addressable by its own id, so "return
 * ids" is not a thing that could be implemented — see `CheckInsCollection` and
 * `MatchSuggestionsCollection` below.
 *
 * ## Every list here is keyset-paged, and nothing is held between turns
 *
 * §1.1's cache column offers "none, or short-lived", and §1.3 (added by B6
 * after it failed in production) says an actor may cache only the tables it
 * *writes*. A collection actor writes nothing, so the honest reading of the two
 * together is **none**, and that is what these are: each method issues one
 * query with `limit(first + 1)` and an ordering key, and returns
 * `keysetPage(...)`. `page.ts` names this exact split — "`keysetPage` — rows
 * fetched from Postgres with `limit(first + 1)` and an ordering key. This is
 * what entity and collection actors do."
 *
 * Two things follow, and both are load-bearing:
 *
 *  1. **There is no unbounded read.** A search or view actor can page an
 *     in-memory buffer because its SQL caps at 50–500 rows. `/brands` and
 *     `/recipes` are open-ended catalogs with no such cap, so an offset cursor
 *     over a materialised list would either truncate the catalog or read all of
 *     it. Keyset paging has neither failure mode.
 *  2. **§1.5's "authorize on every turn, before the cache" is satisfied by
 *     construction.** There is no cache to serve a later, unchecked caller
 *     from — the bug C1 shipped (a warm activation answering an anonymous
 *     request) has nowhere to live. The check still runs first on every turn;
 *     `services/actors/src/lib/collection-actor-base.ts` is where.
 *
 * ## Keyed by the viewer is not the same as authorized as the viewer
 *
 * C2 learned this for view actors and it is identical here: Dapr will route
 * viewer B's request to `FavoritesCollectionActor(A)` without complaint. Seven
 * of these nine are keyed by the viewer, and every one of them refuses a call
 * whose `ctx.viewerId` is not its own key, on every turn, before anything else.
 * The two catalog collections are keyed by a hash of their filter instead, and
 * refuse an input that does not hash to their key — the same reason
 * `SearchActorBase` does it, so an activation shared across viewers cannot be
 * handed a different scope than the one it is addressed as.
 *
 * ## Why the two catalog collections are not singletons
 *
 * §2.2 writes them `RecipeGroupsCollectionActor()` and
 * `BrandsCollectionActor()` — no key. §1.5 warns against exactly that:
 *
 * > Reference and other singleton read actors are a serialization point: Dapr
 * > runs one turn at a time per actor id. Key read-only actors by something
 * > with cardinality, and reserve true singletons for things that *should*
 * > serialize.
 *
 * `/brands` and `/recipes` should not serialize — nothing about them needs a
 * global order. So both are keyed by `searchHash` of their (non-pagination)
 * filter, which gives one activation per distinct filter instead of one for the
 * whole app.
 */
import type { ActorDescriptor } from "./actors.ts";
import type { BrandDto } from "./brand.ts";
import type { ItemTypeCountsDto } from "./cellars.ts";
import type { Ctx } from "./ctx.ts";
import type {
  BrandType,
  FriendRequestStatus,
  RecipeCategory,
} from "./enums.ts";
import type {
  ItemBrandDto,
  ItemRef,
  ItemReviewDto,
  ItemType,
} from "./items.ts";
import type { MatchSuggestionDto } from "./menu-scans.ts";
import type { CappedList, Page, PageArgs } from "./page.ts";
import type { PlaceBrandDto, PlaceMenuItemDto } from "./places.ts";
import type { RecipeGroupDto, RecipeIngredientDto } from "./recipes.ts";
import { searchHash } from "./search.ts";
import type { TierListEntryRef, TierListItemDto } from "./tier-lists.ts";

/* -------------------------------------------------------------------------- */
/* Keys                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A viewer-keyed collection actor's id **is** the viewer id (§1.1).
 *
 * Trivial, and deliberately still a function, for the same reason
 * `mapActorId` is: `services/api` must not concatenate an actor id by hand, and one
 * builder is what lets the actor assert `this.key === ctx.viewerId` without the
 * two sides drifting. An anonymous viewer has no collection actor to address,
 * so the argument is non-nullable and the refusal happens in the resolver,
 * before addressing.
 */
export const viewerCollectionActorId = (viewerId: string): string => viewerId;

/* -------------------------------------------------------------------------- */
/* CellarsCollectionActor(viewerId) — /cellars                                 */
/* -------------------------------------------------------------------------- */

/**
 * `CellarsCollectionActor(viewerId)` — collection actor, **C3**.
 *
 * §2.2: *"`/cellars`: mine, co-owned, friends' visible — ids"*.
 *
 * **`list` returns ids.** A cellar has an entity actor keyed by exactly this
 * id, `CellarActor.get` is a cached-aggregate read, and the `/cellars` card
 * wants the header plus an item count that only that actor computes. So the
 * page is a list of uuids and `services/api` fans them out through the `Cellar`
 * DataLoader — §1.5's canonical shape.
 *
 * ## What "visible" means here, and where it differs from §2.2
 *
 * The set is `canSeeCellar` over `cellars`, which is the four-branch rule and
 * therefore a **superset** of §2.2's three groups: it also contains a
 * stranger's PUBLIC cellar. That is deliberate and is what the page shows
 * today — `82450ad1:nhost/metadata/databases/default/tables/public_cellars.yaml` grants
 * role `user` `privacy = PUBLIC OR (privacy = FRIENDS AND friend-of-creator) OR
 * created_by_id = viewer OR co_owner = viewer`, and `/cellars` renders that
 * filter unmodified. Narrowing it is a product decision for D2, not a security
 * one; dropping cellars a user can see today would read as a bug.
 */
export type CellarsCollectionActorInterface = {
  /** **ids** — `cellars.id`, newest first. Hydrated through `CellarActor.get`. */
  list(ctx: Ctx, page: PageArgs): Promise<Page<string>>;
  /**
   * The `/search` landing line ("N items across M cellars"), UI parity G36.
   *
   * **Not** `list`'s set. `list` is every cellar the viewer may *see*, which
   * includes strangers' PUBLIC cellars and friends' FRIENDS ones; summing it
   * told a user they owned other people's bottles. The old page
   * (`82450ad1:src/components/search/fragments.ts`) counted cellars the viewer
   * created or co-owns, and **distinct items** in them per type — so that is
   * what this counts.
   */
  stats(ctx: Ctx): Promise<CollectionStatsDto>;
  /**
   * UI parity G9 — the item page's "Located in": for each ref, the ids of the
   * cellars holding a **non-empty** bottle of it that the viewer may see
   * (`canSeeCellar`, the same clause as `list`), by cellar name. Aligned to
   * `refs`; one statement for the whole batch, so a page of cards is one call.
   * Ids, hydrated through `CellarActor.get`, which re-checks visibility.
   */
  containing(
    ctx: Ctx,
    refs: readonly ItemRef[],
  ): Promise<readonly CappedList<string>[]>;
};

/** {@link CellarsCollectionActorInterface.stats}. */
export type CollectionStatsDto = {
  /** Cellars the viewer created or co-owns. */
  readonly cellarCount: number;
  /**
   * Distinct catalog items with at least one bottle in those cellars, per
   * type — the old `<type>s_aggregate(where: {cellar_items: {cellar: …}})`,
   * which counted items whatever their bottles' state, emptied ones included.
   */
  readonly itemCounts: ItemTypeCountsDto;
};

export const CellarsCollectionActorDescriptor: ActorDescriptor<CellarsCollectionActorInterface> =
  {
    actorType: "CellarsCollectionActor",
    category: "collection",
    methods: {
      list: {},
      stats: {},
      containing: {},
    },
  };

/* -------------------------------------------------------------------------- */
/* CheckInsCollectionActor(viewerId) — item detail                             */
/* -------------------------------------------------------------------------- */

/**
 * One `check_ins` row on an item's detail page, with the cellar it came from
 * deliberately **absent**.
 *
 * §1.6's settled reading of this surface is that it *"names the drinker rather
 * than where the bottle sat"*. `CellarActor.checkIns` carries `cellarItemId`
 * because you reached it by naming that cellar; here you reached it by naming
 * an item, and echoing the cellar item id back would hand a friend-of-a-drinker
 * a row id inside a cellar they may not be able to see — the oracle B1 refused,
 * one field smaller.
 */
export type ItemCheckInDto = {
  readonly id: string;
  /** `check_ins.user_id` — who the check-in is *about* (`bulkCheckIn`, §2.1). */
  readonly userId: string;
  /** The item this check-in is on. Equal to the requested ref, echoed back. */
  readonly item: ItemRef;
  readonly createdAt: string;
  readonly updatedAt: string;
};

/**
 * `CheckInsCollectionActor(viewerId)` — collection actor, **C3**.
 *
 * §2.2: *"item detail check-in history: mine + friends' for an item"*.
 *
 * **`list` returns a projection, not ids, and §2.2 is not implementable as
 * written.** A `check_ins` row has no entity actor of its own: §3 makes
 * `CellarActor` its writer, and `CellarActor` is keyed by **cellar** id, so
 * there is nothing a check-in id could be dataloaded through. Returning ids
 * would force `services/api` to invent a second lookup that does not exist. The row
 * is also four small fields — an id round trip would cost more than the row.
 *
 * ## Visibility: `canSeeCheckIn`, unchanged (§1.6, settled by B1)
 *
 * Author **or** friend-of-author, exactly as A4 wrote it. The looser rule is
 * right *here* and wrong on `CellarActor.checkIns` because the two surfaces
 * have different entry points; §1.6 spells out the full argument and C3
 * deliberately changes neither the policy function nor the cellar-scoped
 * caller. `canSeeCheckIn` also passes anything inside a cellar the viewer can
 * see, which keeps a co-owner's own history visible to them here too.
 */
export type CheckInsCollectionActorInterface = {
  /**
   * **projection** — check-ins on `item`, newest first, filtered by
   * `canSeeCheckIn`. See the type doc: a check-in has no entity actor to load.
   */
  list(ctx: Ctx, item: ItemRef, page: PageArgs): Promise<Page<ItemCheckInDto>>;
};

export const CheckInsCollectionActorDescriptor: ActorDescriptor<CheckInsCollectionActorInterface> =
  {
    actorType: "CheckInsCollectionActor",
    category: "collection",
    methods: {
      list: {},
    },
  };

/* -------------------------------------------------------------------------- */
/* TierListsCollectionActor(viewerId) — /tier-lists                            */
/* -------------------------------------------------------------------------- */

/**
 * `TierListsCollectionActor(viewerId)` — collection actor, **C3**.
 *
 * §2.2: *"`/tier-lists` — ids"*.
 *
 * **`list` returns ids.** `TierListActor.get` is a cached-aggregate read that
 * also supplies `itemCount`, and the `/tier-lists` card wants the header. Same
 * shape as `CellarsCollectionActor`, hydrated through the `TierList`
 * DataLoader.
 *
 * Visibility is `canSeeTierList` — the same four branches C1 already applies to
 * a tier-list *filter* (`lib/tier-list-visibility.ts`) and B7 applies to a
 * single tier list. This list is one of the surfaces that must not disagree
 * with those, which is why it calls the same policy function rather than
 * re-deriving the rule in SQL.
 */
export type TierListsCollectionActorInterface = {
  /** **ids** — `tier_lists.id`, most recently changed first. */
  list(ctx: Ctx, page: PageArgs): Promise<Page<string>>;
  /**
   * UI parity G8 — "On lists": for each entry (an item or a place), the
   * `tier_list_items` rows ranking it on a list the viewer may see
   * (`canSeeTierList`, the same clause as `list`), most recently changed list
   * first. Aligned to `refs`, one statement per batch.
   *
   * The old `ItemTierLists` query had no such filter and leaked the **names**
   * of other people's private lists (`e4-decisions.md`); a row on a list the
   * viewer cannot see is never returned, so neither is its list id.
   */
  entriesOf(
    ctx: Ctx,
    refs: readonly TierListEntryRef[],
  ): Promise<readonly CappedList<TierListItemDto>[]>;
};

export const TierListsCollectionActorDescriptor: ActorDescriptor<TierListsCollectionActorInterface> =
  {
    actorType: "TierListsCollectionActor",
    category: "collection",
    methods: {
      list: {},
      entriesOf: {},
    },
  };

/* -------------------------------------------------------------------------- */
/* FavoritesCollectionActor(viewerId) — /favorites                             */
/* -------------------------------------------------------------------------- */

/**
 * `FavoritesCollectionActor(viewerId)` — collection actor, **C3**.
 *
 * §2.2: *"`/favorites` — ids (typed `Item` refs)"*. Moved here from `items.ts`,
 * where A7 declared it early so `me.favorites` could be written before C3
 * existed; the descriptor and the method signature are unchanged, so nothing
 * that imports it from `@cellar-assistant/contracts` notices.
 *
 * **`list` returns ids.** This is the worked example §1.5 is written around and
 * `schema.test.ts` already pins: one collection call returns typed refs across
 * up to six item tables, and `plugin-dataloader` turns them into one batch of
 * parallel `ItemActor.get` invocations. An `item_favorites` row carries nothing
 * else worth returning — its only other column is `created_at`.
 */
export type FavoritesCollectionActorInterface = {
  /**
   * **ids** — typed `Item` refs, newest favourite first. `types` (UI parity
   * G25, the old page's `item_favorites(where: {type: {_in}})`) filters before
   * paging, so `totalCount` follows it; omitted, `null` or empty means all six.
   */
  list(
    ctx: Ctx,
    page: PageArgs,
    types?: readonly ItemType[] | null,
  ): Promise<Page<ItemRef>>;
};

export const FavoritesCollectionActorDescriptor: ActorDescriptor<FavoritesCollectionActorInterface> =
  {
    actorType: "FavoritesCollectionActor",
    category: "collection",
    methods: {
      list: {},
    },
  };

/* -------------------------------------------------------------------------- */
/* FriendsCollectionActor(viewerId) — /friends                                 */
/* -------------------------------------------------------------------------- */

/** One `friends` row, as an id plus the one column the row itself carries. */
export type FriendEdgeDto = {
  /** The *other* user. Hydrated through `UserActor.getProfile`. */
  readonly userId: string;
  /** ISO-8601 `friends.created_at`. */
  readonly since: string;
};

/**
 * A `friend_requests` row, relative to the viewer.
 *
 * `friend_requests.user_id` is always the requester, so one row is `OUTGOING`
 * for them and `INCOMING` for the recipient — the direction is computed here
 * rather than stored, exactly as `FriendRequestDto` does.
 */
export type FriendRequestRowDto = {
  readonly id: string;
  readonly requesterId: string;
  readonly recipientId: string;
  readonly status: FriendRequestStatus;
  readonly direction: "INCOMING" | "OUTGOING";
  /** The user on the other end. Hydrated through `UserActor.getProfile`. */
  readonly otherUserId: string;
};

/** `friend_requests` rows to return. `ALL` is both, newest first. */
export const FRIEND_REQUEST_FILTERS = ["INCOMING", "OUTGOING", "ALL"] as const;
export type FriendRequestFilter = (typeof FRIEND_REQUEST_FILTERS)[number];

export const isFriendRequestFilter = (
  value: string,
): value is FriendRequestFilter =>
  (FRIEND_REQUEST_FILTERS as readonly string[]).includes(value);

/* -------------------------------------------------------------------------- */
/* Recent activity — /search's discovery feed (UI parity G31)                  */
/* -------------------------------------------------------------------------- */

/**
 * The three kinds the old `/search` feed merged
 * (`82450ad1:src/components/search/RecentActivity.tsx`): a bottle added to a
 * cellar, an item review, an entry added to a tier list.
 */
export const ACTIVITY_KINDS = ["ADDED", "REVIEWED", "TIER_LISTED"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const isActivityKind = (value: string): value is ActivityKind =>
  (ACTIVITY_KINDS as readonly string[]).includes(value);

/** The old feed's `limit: 6` per query — and the default here. */
export const ACTIVITY_DEFAULT_LIMIT = 6;
/** Rows held per kind, at most. Over it is a `VALIDATION` error. */
export const ACTIVITY_MAX_LIMIT = 20;

/**
 * Which kinds, and how many of each. `kinds` empty means all three — the old
 * `?activity=` with nothing selected.
 */
export type ActivityFilter = {
  readonly kinds: readonly ActivityKind[];
  readonly limit: number;
};

/**
 * One feed row — **projection**: none of the three source rows has an entity
 * actor addressable by its own id (`item_reviews` belongs to `ItemActor(item)`,
 * `tier_list_items` to `TierListActor(list)`, `cellar_items` to
 * `CellarActor(cellar)`). Everything an id *can* hydrate is an id: the author
 * (`UserActor.getProfile`), the item (`ItemActor.get`), the list
 * (`TierListActor.get`, which applies `canSeeTierList` again) and the cellar
 * (`CellarActor.get`, `canSeeCellar` again).
 *
 * Exactly one of `review` / `tierListItem` / `cellarItemId` is set, by `kind`.
 */
export type ActivityEntryDto = {
  readonly kind: ActivityKind;
  /** The source row's id — unique within a kind, not across kinds. */
  readonly id: string;
  /** ISO-8601 `created_at` of the source row; the feed's order. */
  readonly occurredAt: string;
  /** Who did it: the reviewer, the list's creator, the bottle's adder. */
  readonly userId: string;
  /** The item, or `null` for a tier-listed place. */
  readonly item: ItemRef | null;
  /** The tier-listed place, or `null`. */
  readonly placeId: string | null;
  readonly review: ItemReviewDto | null;
  readonly tierListItem: TierListItemDto | null;
  /** 1-based position in the list (band desc, position asc), TIER_LISTED only. */
  readonly rank: number | null;
  readonly cellarId: string | null;
  readonly cellarItemId: string | null;
};

/**
 * `FriendsCollectionActor(viewerId)` — collection actor, **C3**.
 *
 * §2.2: *"`/friends`: friends, incoming/outgoing requests — ids + request
 * rows"*. Both halves of that phrase are methods here, and they take opposite
 * answers to §1.5's question:
 *
 * - **`friends` returns ids** (plus `since`, which is the only column a
 *   `friends` row has beyond the two user ids). A user profile is an entity
 *   actor read — `UserActor.getProfile` — so the page is ids and the
 *   `UserProfile` DataLoader fans them out in one batch. B4's
 *   `UserActor.friends` returns `FriendDto` with the profile already inlined,
 *   which is an N+1 *inside* the actor turn; this is the same list without it.
 * - **`requests` returns a projection**, because a `friend_requests` row has no
 *   entity actor: §3 makes `UserActor` its writer and only the *requester's*
 *   actor may write it, so there is no per-request actor to address. The row's
 *   own four fields come back whole and only `otherUserId` is dataloaded.
 *
 * Both are the viewer's own rows and nobody else's; the viewer-key check is the
 * whole of the authorization, because `friends` and `friend_requests` are
 * visible only to the two people named in them (today's Hasura rule and B4's).
 */
export type FriendsCollectionActorInterface = {
  /** **ids** — the other user in each `friends` row, newest friendship first. */
  friends(ctx: Ctx, page: PageArgs): Promise<Page<FriendEdgeDto>>;
  /** **projection** — `friend_requests` rows; `otherUserId` is the only id. */
  requests(
    ctx: Ctx,
    filter: FriendRequestFilter,
    page: PageArgs,
  ): Promise<Page<FriendRequestRowDto>>;
  /**
   * **projection** (see `ActivityEntryDto`) — UI parity G31. The newest
   * `filter.limit` rows of each requested kind written by the viewer or one of
   * their friends, merged newest first. Whose activity is decided here, from
   * the viewer's own `friends` rows — no user id crosses the API — and each
   * kind keeps its source's rule: a tier-list entry only from a list
   * `canSeeTierList` admits, a bottle only from a cellar `canSeeCellar`
   * admits. Reviews are world-readable to a signed-in viewer (`ItemActor`).
   */
  recentActivity(
    ctx: Ctx,
    filter: ActivityFilter,
  ): Promise<readonly ActivityEntryDto[]>;
};

export const FriendsCollectionActorDescriptor: ActorDescriptor<FriendsCollectionActorInterface> =
  {
    actorType: "FriendsCollectionActor",
    category: "collection",
    methods: {
      friends: {},
      requests: {},
      recentActivity: {},
    },
  };

/* -------------------------------------------------------------------------- */
/* MenuScansCollectionActor(viewerId) — /map/scans                             */
/* -------------------------------------------------------------------------- */

/**
 * `MenuScansCollectionActor(viewerId)` — collection actor, **C3**.
 *
 * §2.2: *"`/map/scans` — ids"*.
 *
 * **`list` returns ids.** `MenuScanActor.get` is a cached-aggregate read and
 * `MenuScanDto` is twenty fields wide — status, counts, timings, three place
 * columns — so the list returns uuids and the `MenuScan` DataLoader fans them
 * out. It is also the one place where ids buy a *safety* property: every id in
 * the page belongs to the viewer, and `MenuScanActor.get` re-checks that
 * independently (§2.1, "scan owner only"), so the fan-out cannot widen what the
 * list decided.
 *
 * Scans are **owner-only** (§2.1, enforced by B8): this list is the viewer's
 * own scans and no one else's, ever.
 */
export type MenuScansCollectionActorInterface = {
  /** **ids** — `menu_scans.id` for the viewer, most recently scanned first. */
  list(ctx: Ctx, page: PageArgs): Promise<Page<string>>;
};

export const MenuScansCollectionActorDescriptor: ActorDescriptor<MenuScansCollectionActorInterface> =
  {
    actorType: "MenuScansCollectionActor",
    category: "collection",
    methods: {
      list: {},
    },
  };

/* -------------------------------------------------------------------------- */
/* MatchSuggestionsCollectionActor(viewerId) — /discoveries                    */
/* -------------------------------------------------------------------------- */

/**
 * `MatchSuggestionsCollectionActor(viewerId)` — collection actor, **C3**.
 *
 * ## §2.2's scope for this actor is withdrawn, and this is the replacement
 *
 * §2.2 describes `/discoveries` as *"pending `item_match_suggestions` for
 * **places the viewer has interacted with**"* — that is, other people's scans,
 * reached through a `user_place_interactions` join. **That is wrong and is not
 * implemented.** Menu scans are owner-only (§2.1, enforced by B8's
 * `MenuScanActor.#requireOwner`), and every `item_match_suggestion` hangs off a
 * `place_menu_items` row that carries the `menu_scan_id` it came from. Serving
 * a suggestion derived from somebody else's scan would leak, per suggestion,
 * that a particular person scanned a particular menu at a particular place —
 * the same class of leak as the cellar oracle B1 refused and the tier-list
 * filter C1 closed. A visit-interaction join does not make it safe: it only
 * changes *which* stranger's scan you get.
 *
 * **`/discoveries` is the viewer's own pending suggestions from the viewer's
 * own scans**, ordered by confidence. The `menu_scans.user_id = viewer` join is
 * the authorization, and it is in the `where` clause rather than in a filter
 * applied afterwards, so there is no ordering in which it can be skipped.
 *
 * ## `list` returns a projection
 *
 * §2.2 already says so ("**projection** (includes `scanId`)") and the reason is
 * the same as `CheckInsCollectionActor`'s: an `item_match_suggestion` has no
 * entity actor. §3 makes `MenuScanActor` its writer and that actor is keyed by
 * **scan**, so a suggestion id addresses nothing. The row also *is* the screen
 * — name, confidence, reasoning, and the suggested target — with the single
 * exception of the target itself, which is a typed `ItemRef` or a recipe id and
 * is dataloaded through `ItemActor` / `RecipeActor` like any other id.
 */
export type MatchSuggestionsCollectionActorInterface = {
  /**
   * **projection** — pending suggestions from the viewer's own scans, most
   * confident first. `MatchSuggestionDto.menuScanId` is §2.2's `scanId`.
   */
  list(ctx: Ctx, page: PageArgs): Promise<Page<MatchSuggestionDto>>;
  /**
   * UI parity G20 — the menu line behind each suggestion (`placeMenuItemId`),
   * for a page of suggestions in one statement. Aligned to `menuItemIds`;
   * `null` for a line that is not on one of the **viewer's own** scans — the
   * same `menu_scans.user_id = viewer` join `list` is authorized by, so this
   * reaches no line a suggestion the viewer may see could not already name.
   * At most `REVERSE_EDGE_MAX_PARENTS` ids per call.
   */
  menuItemsOf(
    ctx: Ctx,
    menuItemIds: readonly string[],
  ): Promise<readonly (PlaceMenuItemDto | null)[]>;
};

export const MatchSuggestionsCollectionActorDescriptor: ActorDescriptor<MatchSuggestionsCollectionActorInterface> =
  {
    actorType: "MatchSuggestionsCollectionActor",
    category: "collection",
    methods: {
      list: {},
      menuItemsOf: {},
    },
  };

/* -------------------------------------------------------------------------- */
/* RecipeGroupsCollectionActor(hash) — /recipes                                */
/* -------------------------------------------------------------------------- */

/**
 * The `/recipes` index filter.
 *
 * `term` is UI parity G26: the old `/recipes` page had one search box, an
 * `_ilike` over a group's name, its description and its versions' names, and
 * it narrowed **this** list — same alphabetical order, same paging, same
 * totals. `RecipeSearchActor` (§2.3) still owns ranked free text over recipes;
 * this is a filter on the index, not a second ranking, so the two cannot
 * disagree about order.
 */
/**
 * How `/recipes` is ordered (UI parity #15). `NEWEST` — `created_at` desc,
 * ties by id — is the default because it is what the old page did
 * (`82450ad1:src/hooks/useOptimizedRecipeGroupSearch.ts`, `order_by:
 * { created_at: desc }`); `NAME` is alphabetical, ties by id, which is the
 * order this list had before the parity fix. A group with no `created_at`
 * sorts as the oldest.
 */
export const RECIPE_GROUP_ORDERS = ["NEWEST", "NAME"] as const;
export type RecipeGroupOrder = (typeof RECIPE_GROUP_ORDERS)[number];
export const DEFAULT_RECIPE_GROUP_ORDER: RecipeGroupOrder = "NEWEST";

/** `orderBy` as the actor applies it and as the actor id hashes it. */
export const normalizeRecipeGroupOrder = (
  orderBy: RecipeGroupOrder | null | undefined,
): RecipeGroupOrder => orderBy ?? DEFAULT_RECIPE_GROUP_ORDER;

export type RecipeGroupsFilter = {
  readonly category?: RecipeCategory | null;
  /** `recipe_groups.base_spirit`, matched exactly. */
  readonly baseSpirit?: string | null;
  /**
   * Case-insensitive substring of the group's name or description, or of any
   * of its recipes' names. Trimmed; blank is no filter
   * ({@link normalizeRecipeGroupTerm}).
   */
  readonly term?: string | null;
  /**
   * The list's order; omitted is {@link DEFAULT_RECIPE_GROUP_ORDER}. Part of
   * the filter because a cursor is only meaningful under the order that
   * minted it — a page's `after` must come from a page of the same order.
   */
  readonly orderBy?: RecipeGroupOrder | null;
};

/** The most characters `RecipeGroupsFilter.term` may carry. */
export const RECIPE_GROUP_TERM_MAX_LENGTH = 200;

/**
 * `term` as the actor applies it and as the actor id hashes it: trimmed, and
 * `null` when blank, so `"  "` and an omitted term address one activation.
 */
export const normalizeRecipeGroupTerm = (
  term: string | null | undefined,
): string | null => {
  const trimmed = (term ?? "").trim();
  return trimmed === "" ? null : trimmed;
};

/**
 * `RecipeGroupsCollectionActor(hash(filter))` — collection actor, **C3**.
 *
 * §2.2: *"`/recipes` list, category filter, paged — **projection**"*.
 *
 * **`list` returns a projection** and §2.2 is right about why: this is the
 * high-cardinality catalog case. Every row on the index card — name,
 * description, category, base spirit, tags, image, recipe count — is a
 * `recipe_groups` column, so a page of ids would be N cold `RecipeGroupActor`
 * activations to re-read rows this query already has in hand.
 *
 * Catalog visibility (§1.6): any signed-in viewer. Recipe groups have no
 * privacy column.
 *
 * Keyed by `recipeGroupsCollectionActorId(filter)` rather than by nothing —
 * see the module doc on why §2.2's `()` would make `/recipes` a global
 * serialization point.
 */
export type RecipeGroupsCollectionActorInterface = {
  /**
   * **projection** — `RecipeGroupDto`, newest first unless `filter.orderBy`
   * says `NAME`.
   */
  list(
    ctx: Ctx,
    filter: RecipeGroupsFilter,
    page: PageArgs,
  ): Promise<Page<RecipeGroupDto>>;
  /**
   * UI parity G11 — an item page's "Used in Recipes": for each item, the
   * `recipe_ingredients` rows naming it, by recipe name. Aligned to
   * `filter.refs`, one statement per batch, addressed at
   * {@link recipeIngredientUsesActorId}. Recipes are catalog data (any
   * signed-in viewer, B6), so the rows need no further filter; the `Recipe`
   * behind each is hydrated through `RecipeActor.get`, which re-checks.
   */
  ingredientUses(
    ctx: Ctx,
    filter: RecipeIngredientUsesFilter,
  ): Promise<readonly CappedList<RecipeIngredientDto>[]>;
};

/** The items one {@link RecipeGroupsCollectionActorInterface.ingredientUses} call reads. */
export type RecipeIngredientUsesFilter = {
  readonly refs: readonly ItemRef[];
};

/**
 * The actor id for one batch of ingredient uses — the ref set, sorted and
 * deduplicated, namespaced apart from {@link recipeGroupsCollectionActorId}.
 */
export const recipeIngredientUsesActorId = (
  filter: RecipeIngredientUsesFilter,
): string =>
  searchHash({
    kind: "recipe-ingredient-uses",
    // `Array.from`, not a spread: the client compiles contracts at a target
    // that cannot iterate a `Set`.
    refs: Array.from(
      new Set(filter.refs.map((ref) => `${ref.type}:${ref.id}`)),
    ).sort(),
  });

export const RecipeGroupsCollectionActorDescriptor: ActorDescriptor<RecipeGroupsCollectionActorInterface> =
  {
    actorType: "RecipeGroupsCollectionActor",
    category: "collection",
    methods: {
      list: {},
      ingredientUses: {},
    },
  };

/** The actor id for a `/recipes` filter. One activation per distinct filter. */
export const recipeGroupsCollectionActorId = (
  filter: RecipeGroupsFilter,
): string =>
  searchHash({
    kind: "recipe-groups",
    category: filter.category ?? null,
    baseSpirit: filter.baseSpirit ?? null,
    // Only when set, so every term-less filter keeps the id it always had.
    ...(normalizeRecipeGroupTerm(filter.term) === null
      ? {}
      : { term: normalizeRecipeGroupTerm(filter.term) }),
    // Likewise only when not the default, so the default order keeps it too.
    ...(normalizeRecipeGroupOrder(filter.orderBy) === DEFAULT_RECIPE_GROUP_ORDER
      ? {}
      : { orderBy: normalizeRecipeGroupOrder(filter.orderBy) }),
  });

/* -------------------------------------------------------------------------- */
/* BrandsCollectionActor(hash) — /brands                                       */
/* -------------------------------------------------------------------------- */

/**
 * The `/brands` index filter. Free text is `BrandSearchActor` (§2.3), for the
 * same reason `RecipeGroupsFilter` has none.
 */
export type BrandsFilter = {
  readonly brandType?: BrandType | null;
  /**
   * A7g: the brand whose **children** to list.
   *
   * D4 found `/brands/[id]` unable to reach a brand's children at all — the
   * page resolved its *parent* with a second `brand(id:)` call and had nothing
   * at all for the other direction, because it "needs `brands(parentBrandId:)`,
   * which does not exist". This is that.
   *
   * `null` and *absent* mean different things here, unlike `brandType`:
   * `undefined`/absent is "do not filter", while an explicit `null` would be
   * "brands with no parent" — a top-level-only index. Only the first is
   * exposed today, so the filter is read as absent-or-a-uuid and the key
   * builder normalises accordingly.
   */
  readonly parentBrandId?: string | null;
};

/**
 * `BrandsCollectionActor(hash(filter))` — collection actor, **C3**.
 *
 * §2.2: *"`/brands` index, paged — **projection**"*.
 *
 * **`list` returns a projection**, the other half of the catalog case §1.5
 * names outright ("projections for high-cardinality catalog lists (map, item
 * search, **brand index**)"). A `BrandDto` is the whole row and the index
 * renders all of it; hydrating a page of ids would be 20 cold `BrandActor`
 * activations per screen for data this query already returned.
 *
 * Catalog visibility (§1.6): any signed-in viewer. Brands have no privacy
 * column, and B3 already treats the brand catalog that way.
 */
export type BrandsCollectionActorInterface = {
  /** **projection** — `BrandDto`, alphabetical. */
  list(ctx: Ctx, filter: BrandsFilter, page: PageArgs): Promise<Page<BrandDto>>;
};

export const BrandsCollectionActorDescriptor: ActorDescriptor<BrandsCollectionActorInterface> =
  {
    actorType: "BrandsCollectionActor",
    category: "collection",
    methods: {
      list: {},
    },
  };

/** The actor id for a `/brands` filter. One activation per distinct filter. */
export const brandsCollectionActorId = (filter: BrandsFilter): string =>
  searchHash({
    kind: "brands",
    brandType: filter.brandType ?? null,
    parentBrandId: filter.parentBrandId ?? null,
  });

/* -------------------------------------------------------------------------- */
/* BrandLinksCollectionActor(hash) — Brand's reverse edges (A7g)               */
/* -------------------------------------------------------------------------- */

/**
 * Which brand's links to read. One field, but a named type rather than a bare
 * string, because `ScopedCollectionActorBase` re-derives the actor id from the
 * *input* on every turn and the two have to be one shape.
 */
export type BrandLinksFilter = {
  readonly brandId: string;
};

/**
 * `BrandLinksCollectionActor(hash(brandId))` — collection actor, **A7g**.
 *
 * ## Why a collection actor rather than fields on `BrandActor`
 *
 * D4 recorded that `Brand` has **no reverse edges at all** — no `items`, no
 * `places` — while the Hasura `/brands/[id]` page rendered both. The tables
 * that answer them are not `BrandActor`'s: `TABLE_WRITERS` assigns
 * `item_brands` to `ItemActor` and `place_brands` to `PlaceActor`. So the
 * reverse edge cannot be a `BrandActor` method — §1.3 lets an entity actor
 * cache only what it writes, and `packages/db`'s single-writer test resolves
 * ownership from the file path.
 *
 * The three shapes that were available, and why this one:
 *
 *   1. **A method on `BrandActor`** — refused above.
 *   2. **`BrandActor` calling `ItemActor`/`PlaceActor`** — a *new synchronous
 *      entity→entity edge*, which §8.5 defines as a closed set. Adding one is
 *      a plan-level decision, and it would not even work: the fan-out is over
 *      an unknown number of items, which is the N+1 §1.5 exists to forbid.
 *   3. **A collection actor** — §1.1 grants the category exactly this: *"writes
 *      nothing | reads any table, directly via Drizzle"*, with no cache to go
 *      stale. Reading another actor's table is what the category is *for*, and
 *      it adds no edge to §8.5's set.
 *
 * ## Keyed by the brand, not a singleton
 *
 * §1.5 warns that a singleton read actor serializes every caller. The id is
 * `brandLinksCollectionActorId(filter)`, so `/brands/a` and `/brands/b` are
 * separate activations, and the base class refuses an activation addressed as
 * one brand and handed another.
 *
 * Catalog visibility (§1.6): any signed-in viewer, like the brand index and
 * B3's catalog rule. Neither `item_brands` nor `place_brands` has a privacy
 * column, and the items and places they name are catalog rows themselves.
 */
export type BrandLinksCollectionActorInterface = {
  /**
   * **ids** — `ItemRef`s for the items this brand made, hydrated by
   * `services/api`'s `Item` DataLoader (§1.5). Primary links first, then by
   * the link's age, so "the flagship first" is stable.
   */
  items(
    ctx: Ctx,
    filter: BrandLinksFilter,
    page: PageArgs,
  ): Promise<Page<ItemRef>>;

  /**
   * **projection** — the `place_brands` rows, carrying the relationship. The
   * `Place` behind each is resolved through `services/api`'s existing
   * place memo, so this returns links rather than places.
   */
  places(
    ctx: Ctx,
    filter: BrandLinksFilter,
    page: PageArgs,
  ): Promise<Page<PlaceBrandDto>>;

  /**
   * UI parity G24 — **projection**: the same `item_brands` rows and order as
   * `items`, carrying the link itself (`isPrimary`) for the brand page's
   * "Primary" chip.
   */
  itemLinks(
    ctx: Ctx,
    filter: BrandLinksFilter,
    page: PageArgs,
  ): Promise<Page<ItemBrandDto>>;

  /**
   * UI parity G23 — `item_brands` rows per brand, aligned to
   * `filter.brandIds`, in one statement. Addressed at
   * {@link brandItemCountsActorId}, not at one brand's id: a `/brands` page
   * asks for twenty counts at once.
   */
  itemCounts(
    ctx: Ctx,
    filter: BrandItemCountsFilter,
  ): Promise<readonly number[]>;
};

/** The brands whose item counts one {@link BrandLinksCollectionActorInterface.itemCounts} call reads. */
export type BrandItemCountsFilter = {
  readonly brandIds: readonly string[];
};

export const BrandLinksCollectionActorDescriptor: ActorDescriptor<BrandLinksCollectionActorInterface> =
  {
    actorType: "BrandLinksCollectionActor",
    category: "collection",
    methods: {
      items: {},
      places: {},
      itemLinks: {},
      itemCounts: {},
    },
  };

/** One activation per brand. */
export const brandLinksCollectionActorId = (filter: BrandLinksFilter): string =>
  searchHash({ kind: "brand-links", brandId: filter.brandId });

/**
 * The actor id for one batch of brand item counts: the brand set, sorted and
 * deduplicated so the same page always lands on the same activation. Namespaced
 * apart from {@link brandLinksCollectionActorId}, so the two never collide.
 */
export const brandItemCountsActorId = (filter: BrandItemCountsFilter): string =>
  searchHash({
    kind: "brand-item-counts",
    brandIds: Array.from(new Set(filter.brandIds)).sort(),
  });
