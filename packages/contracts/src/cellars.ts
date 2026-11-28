/**
 * The cellar aggregate as `services/api` sees it (migration plan §2.1
 * `CellarActor`, workstream B1).
 *
 * `CellarActor(cellarId)` owns four tables — `cellars`, `cellar_owners`,
 * `cellar_items`, `check_ins` — and every one of them is hidden behind the
 * DTOs below. Two shapes in particular are deliberately *not* the row shape:
 *
 * - **`cellar_items`' six-column polymorphic foreign key** (`wine_id`,
 *   `beer_id`, …) collapses to a single `item: ItemRef`, the same typed
 *   reference collection actors return (`items.ts`). §9 defers consolidating
 *   the six item tables; nothing outside `packages/db`, `ItemActor` and
 *   `CellarActor` may see that they exist.
 * - **`percentage_remaining` is `numeric`**, which `pg` hands back as a
 *   *string*. It crosses this wire as a JSON number, converted in the actor —
 *   `services/api` has no Drizzle and no database, so it cannot do it.
 *
 * `timestamptz` columns cross as ISO-8601 strings for the same reason.
 *
 * ## Visibility, and the §1.6 open decision B1 resolved
 *
 * `get`, `items` and `checkIns` are all gated on the **cellar's** four-branch
 * visibility (`canSeeCellar` in `@cellar-assistant/policy`): PUBLIC, or
 * FRIENDS and the viewer is a friend of the creator, or the viewer is the
 * creator or a co-owner.
 *
 * §1.6 flagged a conflict between §2.1 (gate `checkIns` on cellar visibility)
 * and §2.2 (the check-ins collection is "mine + friends'" per *item*). They
 * are not the same surface and they do not want the same rule:
 *
 * - **`CellarActor.checkIns` is cellar-scoped.** It is reached by naming a
 *   cellar id, and its rows carry `cellarItemId`s belonging to that cellar.
 *   Answering it for a viewer who cannot see the cellar turns the cellar id
 *   into an oracle for a private collection's contents and activity. So it is
 *   gated on the cellar, exactly as §2.1 says.
 * - **`CheckInsCollectionActor` (§2.2, C3) is item-scoped.** It is reached by
 *   naming an *item*, never a cellar, and the answer names the drinker rather
 *   than where the bottle sat. `canSeeCheckIn`'s author-or-friend-of-author
 *   branch is right there, and A4's reading of it stands.
 *
 * So `canSeeCheckIn` is not wrong — it belongs to the other surface. See
 * `services/actors/src/actors/cellar-actor.ts`'s module doc for the long form.
 */
import type { ActorDescriptor } from "./actors.ts";
import type { Ctx } from "./ctx.ts";
import type { PermissionType } from "./enums.ts";
import type { ItemRef, ItemType } from "./items.ts";
import type { CappedList, Page, PageArgs } from "./page.ts";
import type { DrinkWindow } from "./shelf-life.ts";

/* -------------------------------------------------------------------------- */
/* Wire shapes                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A count per item type, plus their sum (UI parity G1, G36).
 *
 * A fixed six-key record rather than a list of `{type, count}` pairs: the
 * schema refuses any composite list that is not a connection's `edges`
 * (§1.5), and six named fields are what the old cards read anyway — the old
 * Hasura fragment was six `count(columns: [<type>_id])` aggregates.
 */
export type ItemTypeCountsDto = {
  readonly total: number;
  readonly byType: Readonly<Record<ItemType, number>>;
};

export type CellarDto = {
  readonly id: string;
  readonly name: string;
  readonly privacy: PermissionType;
  readonly createdById: string;
  /**
   * `cellar_owners.user_id` for this cellar — co-owners only. The creator is
   * an owner by virtue of `created_by_id` and is deliberately not repeated
   * here, because today's `cellar_owners` rows do not include them either.
   */
  readonly coOwnerIds: readonly string[];
  /** Cheap: §2.1 loads every `cellar_items` row on activate. Every bottle, emptied ones included. */
  readonly itemCount: number;
  /**
   * UI parity G1: **non-empty** bottles per item type — the old
   * `items_aggregate(where: {empty_at: {_is_null: true}})` (decision 4). A
   * count of bottles, not of distinct items: two bottles of one wine are 2.
   */
  readonly itemCounts: ItemTypeCountsDto;
  /**
   * X04: emptied bottles — what the status segment's "Finished" holds. Kept
   * apart from `itemCounts`, which counts only what is still in the cellar
   * (decision D13).
   */
  readonly finishedCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

/** `cellar_items.source_type`'s check constraint, verbatim. */
export const CELLAR_ITEM_SOURCES = [
  "manual",
  "menu_discovery",
  "menu_scan",
  "import",
] as const;

export type CellarItemSource = (typeof CELLAR_ITEM_SOURCES)[number];

export const isCellarItemSource = (value: string): value is CellarItemSource =>
  (CELLAR_ITEM_SOURCES as readonly string[]).includes(value);

/**
 * A bottle's own dates, price and place on the shelf (ux-c L02, M1's columns).
 * All optional. Dates are ISO `yyyy-mm-dd`; `priceAmount` and `priceCurrency`
 * (ISO 4217, upper case) are set together or not at all; `location` is free
 * text ("Rack B, row 3"), at most {@link BOTTLE_LOCATION_MAX} characters.
 *
 * **Private to the cellar's owners** (the board: "Dates and price are yours
 * and stay private"): a viewer who may see the cellar but not change it reads
 * every one of these as `null`.
 */
export type BottleFreshness = {
  /** Bottled, canned, roasted or packed on. */
  readonly packagedOn: string | null;
  /** Bought or received on. */
  readonly acquiredOn: string | null;
  readonly drinkFrom: string | null;
  readonly drinkUntil: string | null;
  readonly priceAmount: number | null;
  readonly priceCurrency: string | null;
  readonly location: string | null;
};

export const BOTTLE_FRESHNESS_FIELDS = [
  "packagedOn",
  "acquiredOn",
  "drinkFrom",
  "drinkUntil",
  "priceAmount",
  "priceCurrency",
  "location",
] as const satisfies readonly (keyof BottleFreshness)[];

export const BOTTLE_LOCATION_MAX = 80;
/** `numeric(10,2)`'s ceiling. */
export const BOTTLE_PRICE_MAX = 99_999_999.99;

export type CellarItemDto = BottleFreshness & {
  readonly id: string;
  readonly cellarId: string;
  /** `cellar_items.created_by` — who put it in the cellar. */
  readonly createdBy: string;
  /** The six-column polymorphic FK, resolved. */
  readonly item: ItemRef;
  readonly openAt: string | null;
  readonly emptyAt: string | null;
  /** `numeric(0–100)`, as a number. */
  readonly percentageRemaining: number;
  /**
   * F-150 (H-103): the level the bottle had when it was finished — what
   * "Put back" (`updateItem(emptyAt: null)` with no level) restores. Null
   * when it is not finished, or was finished from 0.
   */
  readonly levelBeforeEmpty?: number | null;
  readonly displayImageId: string | null;
  readonly sourceType: CellarItemSource | null;
  readonly sourcePlaceId: string | null;
  readonly sourceMenuItemId: string | null;
  /** Semantic distance, present only on a `semanticQuery` page. Cosine, 0–2. */
  readonly distance: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

/**
 * A `check_ins` row as the *cellar* sees it: always one of its bottles, because
 * `CellarActor.checkIns` reads only rows whose `cellar_item_id` is set. The
 * richer log entry (score, note, tags, place, companions) is `ItemCheckInDto`.
 */
export type CheckInDto = {
  readonly id: string;
  /**
   * Who the check-in is *about*. Not necessarily who wrote it: `bulkCheckIn`
   * writes rows on behalf of friends (§2.1).
   */
  readonly userId: string;
  readonly cellarItemId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

/* -------------------------------------------------------------------------- */
/* Inputs                                                                      */
/* -------------------------------------------------------------------------- */

export type CreateCellarInput = {
  readonly name: string;
  /** Defaults to the column default, `PRIVATE`. */
  readonly privacy?: PermissionType;
  /** Co-owners besides the creator. The creator is filtered out if present. */
  readonly coOwnerIds?: readonly string[];
};

/**
 * Every field is optional and only the present ones are written.
 *
 * `coOwnerIds` is the **complete** new set, not a delta — §2.1: "replaces the
 * delete-all/re-insert owner pattern with a set diff in one transaction".
 * Omit it to leave the owner set untouched; pass `[]` to clear it.
 */
export type UpdateCellarInput = {
  readonly name?: string;
  readonly privacy?: PermissionType;
  readonly coOwnerIds?: readonly string[];
};

export type AddCellarItemInput = {
  readonly item: ItemRef;
  /**
   * The row id, minted by the caller. **This is the §8.4 idempotency key.**
   * `cellar_items` has no natural unique constraint — two bottles of the same
   * wine are two legitimate rows — so a re-delivered `addItem` can only be
   * recognised by its id. Omit it for a user-initiated add; an outbox
   * delivery that omits it gets a key derived from the delivery instead (see
   * `CellarActorInterface.addItem`).
   */
  readonly cellarItemId?: string;
  /**
   * `cellar_items.created_by`. Honoured **only** for a `system` ctx, where
   * there is no viewer to take it from — an outbox payload written by
   * `ItemOnboardingActor.confirm` inside its own transaction is trusted; a
   * request is not. A user call always records the viewer, whatever this says.
   */
  readonly createdBy?: string;
  /** 0–100. Defaults to 100. */
  readonly percentageRemaining?: number;
  readonly displayImageId?: string | null;
  readonly openAt?: string | null;
  readonly emptyAt?: string | null;
  readonly sourceType?: CellarItemSource | null;
  readonly sourcePlaceId?: string | null;
  readonly sourceMenuItemId?: string | null;
} & BottleFreshnessInput;

/**
 * The freshness fields as a write takes them: absent leaves a field alone,
 * `null` clears it. Price is one pair: give both, or clear the amount (which
 * clears the currency with it).
 */
/**
 * F-79: Undo for `removeItem` — the bottle as it was, by its own id and with
 * its own `createdAt`, so it returns to its place in the newest-first list
 * rather than on top as a new add. The logs `removeItem` detached are not
 * relinked: `check_ins` is `CheckInActor`'s to write.
 */
export type RestoreCellarItemInput = AddCellarItemInput & {
  readonly cellarItemId: string;
  /** The removed row's `createdAt`; not in the future. */
  readonly createdAt: string;
};

export type BottleFreshnessInput = {
  readonly [K in keyof BottleFreshness]?: BottleFreshness[K];
};

export type UpdateCellarItemInput = {
  readonly percentageRemaining?: number;
  readonly displayImageId?: string | null;
  readonly openAt?: string | null;
  readonly emptyAt?: string | null;
  /**
   * SV-B · MC-move (L13): move the bottle to this cellar, which the viewer
   * must be able to write. A move clears the shelf `location` (a place inside
   * the old cellar); the bottle keeps its id, so its logs follow it. The
   * bottle's own cellar is a no-op for the move.
   */
  readonly cellarId?: string | null;
} & BottleFreshnessInput;

/**
 * In-cellar orderings. §2.1 loads every `cellar_items` row on activate ("a
 * cellar is small enough to hold"), so these sort the cached list rather than
 * the database — which is also what makes `SEMANTIC` a re-sort of the same
 * list rather than a different query.
 */
export const CELLAR_ITEM_SORTS = [
  "ADDED_DESC",
  "ADDED_ASC",
  "PERCENTAGE_ASC",
  "PERCENTAGE_DESC",
  "OPEN_FIRST",
  // UI parity G3: the old items page sorted by item name (ramda
  // `ascend(name)` after distance). Names live in the item tables, which this
  // actor does not own, so they are read fresh per call, never cached (§1.3).
  "NAME_ASC",
  // X04: the "Open now" shelf — the bottle opened most recently first, then
  // the rest (sealed, then finished) newest first.
  "OPENED_DESC",
  // X04: the Finished diary — the bottle finished most recently first, then
  // the rest newest first.
  "FINISHED_DESC",
  // F-79: the Arrange sheet's orders, read fresh per call like NAME_ASC. A
  // bottle with no key (no brand, no style, not rated by you) sorts last;
  // ties go by name. Maker is the primary brand; style is the card's
  // descriptor (a wine's variety, a beer's or spirit's style, a coffee's
  // roast, a sake's or tea's category); rating is the viewer's own score.
  "MAKER_ASC",
  "STYLE_ASC",
  "RATING_DESC",
] as const;

export type CellarItemSort = (typeof CELLAR_ITEM_SORTS)[number];

/**
 * UI parity G2: which bottles a `CellarActor.items` page holds. `ACTIVE` (not
 * emptied) is the default — decision 4: the old UI hid empty bottles from
 * every cellar list (`empty_at: {_is_null: true}`). `OPEN` (X04) is the
 * "Open now" shelf: not emptied, and opened — by `openAt`, or by a level
 * already below full, which the API allows without an `openAt`.
 */
export const CELLAR_ITEM_STATUSES = ["ACTIVE", "EMPTY", "ALL", "OPEN"] as const;

export type CellarItemStatus = (typeof CELLAR_ITEM_STATUSES)[number];

export type CellarItemsArgs = {
  readonly page: PageArgs;
  /** Defaults to `ADDED_DESC`. Ignored when `semanticQuery` is set. */
  readonly sort?: CellarItemSort | null;
  /**
   * Free text. The actor asks `EmbeddingActor` for the vector (§8.5's one
   * sanctioned synchronous entity → search call) and orders the cached items
   * by cosine distance over `item_vectors`.
   */
  readonly semanticQuery?: string | null;
  /**
   * UI parity G2. Only these item types; null or empty means all six. Applied
   * **before** paging, so `totalCount` and the cursor follow the filter.
   */
  readonly types?: readonly ItemType[] | null;
  /** UI parity G2. Defaults to `ACTIVE`. Applied before paging, like `types`. */
  readonly status?: CellarItemStatus | null;
};

/**
 * X04: how a bottle answered an in-cellar search. `NAME` — the phrase matches
 * the item's name (pg_trgm, the N08 lexical rule); `MEANING` — it does not,
 * but the item's vector is within the tuned distance cutoff.
 */
export const CELLAR_SEARCH_MATCHES = ["NAME", "MEANING"] as const;

export type CellarSearchMatch = (typeof CELLAR_SEARCH_MATCHES)[number];

/**
 * X04: identical bottles as one grid cell — "×3". Every bottle of one catalog
 * item that survives the filter, in the page's order; the first of them (the
 * one the sort put highest) leads and decides where the group sits.
 */
export type CellarItemGroupDto = {
  /** The lead bottle — what the card shows and links to. */
  readonly lead: CellarItemDto;
  /** Every bottle in the group, lead first, in the list's order. */
  readonly bottleIds: readonly string[];
  /** `bottleIds.length`. */
  readonly count: number;
  /** How many of them are open (not finished). */
  readonly openCount: number;
  /** On a `search` page, how the item matched; `null` otherwise. */
  readonly match: CellarSearchMatch | null;
};

/**
 * Whether a `search` page used the vectors. `UNAVAILABLE`: the phrase could
 * not be embedded (no AI provider, out of allowance, a model error), so the
 * page holds name matches only — the client says so rather than presenting a
 * short list as complete.
 */
export const CELLAR_SEARCH_MEANINGS = [
  "NOT_ASKED",
  "USED",
  "UNAVAILABLE",
] as const;

export type CellarSearchMeaning = (typeof CELLAR_SEARCH_MEANINGS)[number];

export type CellarItemGroupPage = Page<CellarItemGroupDto> & {
  /** Bottles across every group on every page — D13 counts bottles. */
  readonly bottleCount: number;
  readonly meaning: CellarSearchMeaning;
};

export type CellarItemGroupsArgs = {
  readonly page: PageArgs;
  /** As `CellarItemsArgs.sort`. Ignored when `search` is set. */
  readonly sort?: CellarItemSort | null;
  /**
   * X04: free text that **narrows** — name matches first, then items within
   * the tuned vector-distance cutoff, and nothing else. (`items`'
   * `semanticQuery` is the older re-sort of everything.)
   */
  readonly search?: string | null;
  readonly types?: readonly ItemType[] | null;
  readonly status?: CellarItemStatus | null;
  /** Group identical bottles. Defaults to true; false gives one per bottle. */
  readonly group?: boolean | null;
};

/**
 * X04 / D3: the cellar page's dashboard, computed over the cached bottles
 * plus one read of their logs. Every count is bottles (D13).
 */
export type CellarDashboardDto = {
  /** Bottles still in the cellar (`itemCounts.total`). */
  readonly bottleCount: number;
  /** Open and not finished. */
  readonly openCount: number;
  /** Open, not finished, at or under {@link CELLAR_ALMOST_EMPTY_AT}%. */
  readonly almostEmptyCount: number;
  /** Bottles finished this calendar month, in `timeZone`. */
  readonly finishedThisMonth: number;
  /** Every finished bottle. */
  readonly finishedCount: number;
  /** Still in the cellar and added in the last {@link CELLAR_RECENT_DAYS} days. */
  readonly addedRecently: number;
  /**
   * Logs poured from this cellar's bottles per calendar month, oldest first,
   * {@link CELLAR_LOG_MONTHS} of them, the last being the current month in
   * `timeZone`. Everyone's logs, as `checkIns` lists them.
   */
  readonly logsByMonth: readonly number[];
  /** The current month, `YYYY-MM`, in `timeZone` — the last of `logsByMonth`. */
  readonly currentMonth: string;
  /** The IANA zone the months were cut in (UTC when none or an unknown one was given). */
  readonly timeZone: string;
};

export type CellarDashboardArgs = {
  /** IANA, e.g. `America/Chicago`. Unknown or absent → UTC. */
  readonly timeZone?: string | null;
};

/** A bottle at or under this percentage is "almost empty". */
export const CELLAR_ALMOST_EMPTY_AT = 25;
/** "Recently added" means within this many days. */
export const CELLAR_RECENT_DAYS = 30;
/** How many months the dashboard's trend covers. */
export const CELLAR_LOG_MONTHS = 12;

/**
 * X04: the viewer's **own** logs from one bottle — the Finished diary's "your
 * log". Never anyone else's: a co-owner's notes stay on their own item page.
 */
/**
 * One bottle under Drink soon (ux-c L02, plan L18): opened and past its
 * style's shortest open life, or sealed with a window — the person's own
 * dates or the typical one — closing within `DRINK_SOON_HORIZON_MONTHS`.
 */
export type DrinkSoonDto = {
  readonly bottle: CellarItemDto;
  readonly reason: "OPENED" | "SEALED";
  /** `PAST` beyond its window; `NOW` opened and inside it; `SOON` sealed, closing. */
  readonly urgency: "PAST" | "NOW" | "SOON";
  /** Opened: whole days since. `null` for a sealed bottle. */
  readonly openDays: number | null;
  /** Opened: the typical life in days, `[from, until]`. */
  readonly openLifeDays: readonly [number, number] | null;
  /** Sealed: the window, each end with its source. */
  readonly window: DrinkWindow | null;
  /** The style the typical row is for ("IPA"), or `null` for the person's own dates. */
  readonly typicalFor: string | null;
  /** Opened: how far through its life, openDays / until (≥ 1 when past). */
  readonly ratio: number | null;
};

/**
 * Drink soon's order, the same in one cellar and across all of a viewer's:
 * opened bottles first, most overdue first; then sealed ones, the window
 * closing soonest first.
 */
export const compareDrinkSoon = (a: DrinkSoonDto, b: DrinkSoonDto): number => {
  if (a.reason !== b.reason) return a.reason === "OPENED" ? -1 : 1;
  if (a.reason === "OPENED") return (b.ratio ?? 0) - (a.ratio ?? 0);
  return (a.window?.until ?? "").localeCompare(b.window?.until ?? "");
};

export type BottleLogSummaryDto = {
  readonly count: number;
  readonly firstAt: string | null;
  readonly lastAt: string | null;
  /** The newest score among them, if any has one. */
  readonly lastScore: number | null;
  /** The newest non-empty note among them, if any. */
  readonly lastNote: string | null;
};

export type CellarNameMatchesArgs = {
  readonly search: string;
  /** At most this many groups, best name match first. */
  readonly limit: number;
};

/**
 * Whether a bottle passes a {@link CellarItemStatus} filter: `ACTIVE` is
 * still in the cellar (`emptyAt` null), `EMPTY` is finished, `ALL` is both.
 */
export const bottleMatchesStatus = (
  bottle: { readonly emptyAt: string | null },
  status: CellarItemStatus,
): boolean =>
  status === "ALL" ||
  (status === "ACTIVE" ? bottle.emptyAt === null : bottle.emptyAt !== null);

/**
 * X09: the order "Your bottles" lists a person's bottles of one item in —
 * what they are most likely to pour from first.
 *
 * 1. **Open** bottles (opened, not finished), most recently opened first;
 * 2. **sealed** ones, most recently added first;
 * 3. **finished** ones, most recently finished first.
 *
 * Ties (the same instant) fall back to the id, so the order is total and two
 * reads of the same rows agree. Pure, and shared by the actor (one cellar)
 * and the API (merging several cellars' answers).
 */
export const orderOwnBottles = <
  T extends {
    readonly id: string;
    readonly openAt: string | null;
    readonly emptyAt: string | null;
    readonly createdAt: string;
  },
>(
  bottles: readonly T[],
): T[] => {
  const rank = (bottle: T): number =>
    bottle.emptyAt !== null ? 2 : bottle.openAt !== null ? 0 : 1;
  const when = (bottle: T): number =>
    Date.parse(bottle.emptyAt ?? bottle.openAt ?? bottle.createdAt);
  return [...bottles].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      when(b) - when(a) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
};

export type DeletedCellar = { readonly id: string };
export type RemovedCellarItem = { readonly id: string };

/* -------------------------------------------------------------------------- */
/* The actor                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `CellarActor(cellarId)` — entity actor, owned by **B1**.
 *
 * Reads (`get`, `items`, `checkIns`) are gated on cellar visibility. Writes
 * split two ways, matching what the Hasura permissions they replace allowed:
 *
 * - **creator or co-owner** — `update` (name/privacy), every `*Item` method;
 * - **creator only** — changing the co-owner set, and `delete`.
 *
 * Logging a drink from one of its bottles is `CheckInActor.log` (X02), which
 * requires the cellar to be *visible* — the rule `checkIn` had here.
 */
export type CellarActorInterface = {
  get(ctx: Ctx): Promise<CellarDto>;
  create(ctx: Ctx, input: CreateCellarInput): Promise<CellarDto>;
  update(ctx: Ctx, input: UpdateCellarInput): Promise<CellarDto>;
  delete(ctx: Ctx): Promise<DeletedCellar>;

  items(ctx: Ctx, args: CellarItemsArgs): Promise<Page<CellarItemDto>>;
  /**
   * §8.4: idempotent on `input.cellarItemId`, falling back to
   * `idempotencyKey(ctx, …)` for an outbox delivery that supplies none —
   * derived from `ctx.delivery`, which only the drainer mints and the wire
   * boundary refuses on any other ctx.
   * A second delivery of the same row returns the existing item and writes
   * nothing — which is `ItemOnboardingActor.confirm`'s "re-delivered twice …
   * one cellar item" (§6 B2), prepaid.
   */
  addItem(ctx: Ctx, input: AddCellarItemInput): Promise<CellarItemDto>;
  updateItem(
    ctx: Ctx,
    cellarItemId: string,
    input: UpdateCellarItemInput,
  ): Promise<CellarItemDto>;
  removeItem(ctx: Ctx, cellarItemId: string): Promise<RemovedCellarItem>;
  /**
   * F-79: put a removed bottle back. Creator or co-owner, as `addItem`;
   * idempotent on `cellarItemId` (a bottle still here is returned as is);
   * an id now in another cellar is a `ConflictError`.
   */
  restoreItem(ctx: Ctx, input: RestoreCellarItemInput): Promise<CellarItemDto>;
  setItemPercentage(
    ctx: Ctx,
    cellarItemId: string,
    percentageRemaining: number,
  ): Promise<CellarItemDto>;
  openItem(ctx: Ctx, cellarItemId: string): Promise<CellarItemDto>;
  emptyItem(ctx: Ctx, cellarItemId: string): Promise<CellarItemDto>;

  /**
   * X02: `checkIn` and `bulkCheckIn` moved to `CheckInActor.log` — a log is
   * about an item, and a bottle is only where it was poured from. This actor
   * reads `check_ins` (fresh, never cached: it is not the writer) and never
   * writes it; removing a bottle nulls the log's `cellar_item_id` through the
   * foreign key rather than deleting the history.
   */
  checkIns(ctx: Ctx, page: PageArgs): Promise<Page<CheckInDto>>;

  /**
   * UI parity G10 — one bottle by `cellar_items.id`, which is what a
   * `/cellars/[c]/<type>s/[id]` URL means again (decision 1). Emptied bottles
   * included: a bookmark to a finished bottle still opens it. `NotFoundError`
   * for a bottle that is not in *this* cellar, same as a missing one.
   */
  item(ctx: Ctx, cellarItemId: string): Promise<CellarItemDto>;
  /**
   * UI parity G10's redirect: an old link carrying a **catalog** item id.
   * The cellar's one bottle of that item, or `null` when there is no single
   * answer — decision 1 sends the client to the item page then. Non-empty
   * bottles decide first; only when there are none does a lone emptied bottle
   * count.
   */
  bottleFor(ctx: Ctx, item: ItemRef): Promise<CellarItemDto | null>;
  /**
   * X09 — "Your bottles" on the item page: every bottle of each item in this
   * cellar, aligned to `items`, in {@link orderOwnBottles}' order and filtered
   * by `status` (default `ACTIVE`). Gated like `item` (the cellar's
   * visibility); the API only asks it of cellars the viewer created or
   * co-owns (`CellarsCollectionActor.ownContaining`).
   */
  bottlesOf(
    ctx: Ctx,
    items: readonly ItemRef[],
    status?: CellarItemStatus | null,
  ): Promise<readonly (readonly CellarItemDto[])[]>;
  /**
   * UI parity G14 — check-ins per bottle, newest first, aligned to
   * `cellarItemIds`. Gated exactly as `checkIns` (the cellar's visibility);
   * an id that is not one of this cellar's bottles answers an empty list.
   */
  checkInsOf(
    ctx: Ctx,
    cellarItemIds: readonly string[],
  ): Promise<readonly CappedList<CheckInDto>[]>;

  /**
   * X04: the grid's list — `items`, with identical bottles grouped ("×3")
   * and `search` narrowing rather than re-sorting. Gated as `items`.
   */
  itemGroups(
    ctx: Ctx,
    args: CellarItemGroupsArgs,
  ): Promise<CellarItemGroupPage>;
  /** X04 / D3: the dashboard above the grid. Gated as `get`. */
  dashboard(ctx: Ctx, args: CellarDashboardArgs): Promise<CellarDashboardDto>;
  /**
   * ux-c L02 / L18: this cellar's Drink soon — opened bottles past their
   * style's shortest open life (most overdue first), then sealed ones whose
   * window closes within the horizon (soonest first). Owners only, since it
   * reads their private dates: anyone else who may see the cellar gets `[]`.
   */
  drinkSoon(ctx: Ctx, page: PageArgs): Promise<Page<DrinkSoonDto>>;
  /**
   * X04: the viewer's own logs per bottle, aligned to `cellarItemIds` — the
   * Finished diary. Gated on the cellar; an id that is not one of its bottles
   * (or a bottle the viewer never logged) answers a zero summary.
   */
  myLogsOf(
    ctx: Ctx,
    cellarItemIds: readonly string[],
  ): Promise<readonly BottleLogSummaryDto[]>;
  /**
   * X04's cross-cellar fan-out ("Lagavulin is in Bar Cart"): this cellar's
   * bottles still in it whose item **name** matches, grouped. Names only — no
   * embedding — so asking every cellar you own costs no model call. Gated on
   * the cellar's visibility, like `items`.
   */
  nameMatches(
    ctx: Ctx,
    args: CellarNameMatchesArgs,
  ): Promise<readonly CellarItemGroupDto[]>;
};

/**
 * The name a brand-new account's first cellar gets (N15: a designed first
 * run). Shown on the cellar card and the cellar page; the owner can rename
 * it like any other.
 */
export const STARTER_CELLAR_NAME = "My Cellar";

/** {@link InternalCellarActorInterface.createStarter}'s payload. */
export type StarterCellarInput = {
  /** The account the cellar is made for — its creator. */
  readonly ownerId: string;
};

/**
 * Only the outbox calls these — never a resolver. `context.actor(…)` in
 * `services/api` is typed over {@link CellarActorInterface} alone, so a
 * resolver cannot name them, and the actor host's allowlist admits them only
 * because they are declared below.
 */
export type InternalCellarActorInterface = {
  /**
   * N15: give a brand-new account a cellar to put its first bottle in.
   * Enqueued once, by better-auth's `user.create` hook, at an id derived from
   * the new user's id; `system` only, idempotent (a second delivery finds the
   * cellar and does nothing), and refused at any other id, so a row cannot
   * create a cellar for one user at an address chosen for another.
   */
  createStarter(ctx: Ctx, input: StarterCellarInput): Promise<void>;
};

export const CellarActorDescriptor: ActorDescriptor<
  CellarActorInterface,
  InternalCellarActorInterface
> = {
  actorType: "CellarActor",
  category: "entity",
  methods: {
    get: {},
    create: {},
    update: {},
    delete: {},
    // Only with `semanticQuery`, which embeds it; the API charges the field
    // only when that argument is given (`MODEL_BACKED_FIELDS`).
    items: { modelBacked: true },
    addItem: {},
    updateItem: {},
    removeItem: {},
    restoreItem: {},
    setItemPercentage: {},
    openItem: {},
    emptyItem: {},
    checkIns: {},
    item: {},
    bottleFor: {},
    bottlesOf: {},
    checkInsOf: {},
    // Only with `search`, which embeds it (`MODEL_BACKED_FIELDS`).
    itemGroups: { modelBacked: true },
    dashboard: {},
    myLogsOf: {},
    nameMatches: {},
    drinkSoon: {},
  },
  internalMethods: {
    createStarter: {},
  },
};

/**
 * `EmbeddingActor(hash(text))` moved to `search.ts` in **C1**, as the note that
 * stood here invited ("C1 may move it; the shape is the contract, not the
 * file"). It now sits with the other nine search actors, and its key builder —
 * `embeddingActorId`, `sha256(lower(trim(text)))` — sits beside it.
 */
export type {} from "./search.ts";
