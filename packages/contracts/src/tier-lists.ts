/**
 * The tier-list aggregate as `services/api` sees it (migration plan §2.1
 * `TierListActor`, workstream B7).
 *
 * `TierListActor(tierListId)` owns two tables — `tier_lists`, `tier_list_items`
 * — hidden behind the DTOs below.
 *
 * ## Items and places are both rankable — modelled honestly
 *
 * A3 found `tier_list_items.type` carries a seventh value, `'PLACE'`, that the
 * `item_type` Postgres enum cannot represent (its `wine|beer|spirit|coffee|
 * sake|tea` are exactly `ItemType` from `items.ts`) — which is why the column
 * stays `text` rather than becoming a `pgEnum`. Tier lists rank **both** items
 * and places, so `TierListEntryRef` is deliberately not `ItemRef`: it is
 * `ItemRef`'s six types plus `"PLACE"`, and a `TierListItemDto` carries one
 * `entry` of that wider type rather than assuming every row is an item.
 * `services/api/src/schema/tier-list.ts` exposes this as two sibling fields
 * (`item`, resolved through the existing `Item` interface, and `placeId`, a
 * bare id) rather than a GraphQL union — there is no `PlaceActor` yet (B5),
 * so there is nothing to batch-load a richer `Place` type through. Whoever
 * builds B5 can promote `placeId` to a resolved `Place` field without changing
 * this contract.
 *
 * **These DTOs are the wire shape, not the row shape.** `timestamptz` columns
 * cross as ISO-8601 strings (or `null` — see below) and `jsonb` crosses as a
 * plain object, because `services/api` has no Drizzle and no database.
 *
 * ## A schema quirk worth knowing before you assume non-null
 *
 * Unlike `cellars.created_at`/`updated_at` (`NOT NULL` in the live database),
 * `tier_lists.created_at`/`updated_at` and `tier_list_items.created_at`/
 * `updated_at` carry **no** `NOT NULL` constraint — `packages/db/src/schema/
 * tables.ts` (introspected, not hand-written) has no `.notNull()` on any of
 * the four. `contentUpdatedAt` is the one exception: it *is* `NOT NULL`,
 * which is what makes it safe to bump unconditionally as the "insights should
 * regenerate" signal. So every other timestamp here is `string | null`, and
 * only `contentUpdatedAt` is a bare `string`.
 *
 * ## Ordering — settled, not this workstream's to redesign
 *
 * `band` (0–5) + `position` (sequential per band) is the whole model. A
 * reorder batch-renumbers a band's positions to clean `0..n-1`; there is no
 * fractional indexing here (that is a deferred, collaborative-editing-only
 * migration path recorded in the plan, not adopted). The global rank the
 * frontend shows is derived client-side from `(band, position)` and is never
 * stored.
 */
import type { ActorDescriptor } from "./actors.ts";
import type { Ctx } from "./ctx.ts";
import type { PermissionType } from "./enums.ts";
import type { ActorErrorReason } from "./errors.ts";
import { ITEM_TYPES, type ItemType } from "./items.ts";
import type { Page, PageArgs } from "./page.ts";
import type { SharedTierListDto } from "./share.ts";

/* -------------------------------------------------------------------------- */
/* The wider entry type — items, plus places                                   */
/* -------------------------------------------------------------------------- */

/**
 * `ItemType` plus `"PLACE"` — exactly the seven values
 * `tier_list_items.type` (a generated column) can produce, in the same order
 * as the table's own columns (`place_id, wine_id, beer_id, spirit_id,
 * coffee_id, sake_id, tea_id`).
 */
export const TIER_LIST_ENTRY_TYPES = [
  "PLACE",
  ...ITEM_TYPES,
] as const satisfies readonly [string, ...ItemType[]];

export type TierListEntryType = (typeof TIER_LIST_ENTRY_TYPES)[number];

export const isTierListEntryType = (
  value: string,
): value is TierListEntryType =>
  (TIER_LIST_ENTRY_TYPES as readonly string[]).includes(value);

/**
 * A typed reference to whatever a tier-list row ranks: one of the six item
 * types, or a place. Deliberately wider than `ItemRef` (`items.ts`) — see the
 * module doc for why the extra case cannot be modelled away.
 */
export type TierListEntryRef = {
  readonly type: TierListEntryType;
  readonly id: string;
};

/** `tier_list_items_band_check`: `band between 0 and 5`, verbatim. */
export const MIN_BAND = 0;
export const MAX_BAND = 5;

export { bandForScore } from "./bands.ts";

/**
 * `tier_lists.list_type` (free text: `'place'`, `'wine'`, …) → the entry type
 * its entries carry, or `null` for a value that names none. Every list made
 * through the app carries one of the seven; an older free-text value is not
 * guessed at.
 */
export const entryTypeOfListType = (
  listType: string,
): TierListEntryType | null => {
  const upper = listType.trim().toUpperCase();
  return isTierListEntryType(upper) ? upper : null;
};

/** The inverse: `WINE` → `'wine'`. */
export const listTypeOfEntryType = (type: TierListEntryType): string =>
  type.toLowerCase();

/* -------------------------------------------------------------------------- */
/* Wire shapes                                                                 */
/* -------------------------------------------------------------------------- */

export type TierListDto = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly createdById: string;
  readonly privacy: PermissionType;
  /** `tier_lists.list_type` — free text (`'place'` by default), not an enum. */
  readonly listType: string;
  /** Cheap: `loadAggregate` reads every `tier_list_items` row on activate. */
  readonly itemCount: number;
  /** `ai_insights`, `generateInsights`'s output. `null` until first generated. */
  readonly aiInsights: Record<string, unknown> | null;
  readonly insightsGeneratedAt: string | null;
  /**
   * Bumped by every content-changing write (`addItem`, `removeItem`,
   * `reorderBand`) — never by `update`, which only touches the header. This
   * is the signal `generateInsights` throttles against, replacing the
   * `tier_list_items_content_changed` trigger it used to be.
   */
  readonly contentUpdatedAt: string;
  /**
   * N07: where this list's generated insights stand, decided by the actor
   * from what it knows (`tierListInsightsStatus` in
   * `services/actors/src/lib/tier-list-insights-status.ts`). A client renders
   * this rather than inferring "generating" from `aiInsights === null`,
   * which is how a list whose generation could never happen showed
   * "Generating Insights" forever.
   */
  readonly insightsStatus: TierListInsightsStatus;
  /**
   * Why the latest attempt failed (`FAILED`), when the actor recorded a
   * reason — `AI_UNCONFIGURED`, `USER_CAP`, `SERVICE_BUDGET`,
   * `NOTHING_READ`. `null` otherwise.
   */
  readonly insightsFailureReason: ActorErrorReason | null;
  /**
   * When the next attempt can or will happen: the budget window's `retryAt`
   * on a `FAILED` refusal, or the end of the once-a-day throttle on a
   * `PENDING` refresh. `null` when there is no such time.
   */
  readonly insightsRetryAt: string | null;
  /** See the module doc: nullable in the live schema, unlike `cellars`. */
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
};

/**
 * N07's states for a tier list's generated insights.
 *
 * - `NOT_ENOUGH_ENTRIES` — fewer entries than insights need; nothing runs.
 * - `UNAVAILABLE` — this deployment has no AI provider (and no earlier
 *   insights to show); nothing will run until one is configured.
 * - `PENDING` — asked for and not yet answered: queued, generating, retrying
 *   or waiting out the once-a-day throttle (`insightsRetryAt`).
 * - `FAILED` — the latest attempt failed (`insightsFailureReason`).
 * - `READY` — `aiInsights` holds the latest answer.
 * - `IDLE` — enough entries, nothing generated and nothing asked for (a list
 *   last changed before insights were requested on change). The next change
 *   asks.
 */
export const TIER_LIST_INSIGHTS_STATUSES = [
  "NOT_ENOUGH_ENTRIES",
  "UNAVAILABLE",
  "PENDING",
  "FAILED",
  "READY",
  "IDLE",
] as const;

export type TierListInsightsStatus =
  (typeof TIER_LIST_INSIGHTS_STATUSES)[number];

export type TierListItemDto = {
  readonly id: string;
  readonly tierListId: string;
  readonly band: number;
  readonly position: number;
  readonly notes: string | null;
  /** The six-or-seven-column polymorphic FK, resolved. */
  readonly entry: TierListEntryRef;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
};

/* -------------------------------------------------------------------------- */
/* Edit history (D4)                                                           */
/* -------------------------------------------------------------------------- */

/**
 * D4: the edits a tier list's history records and Undo/Redo step through.
 * `MOVE` is any `reorderBand` that moved something — within a band, or into
 * another one (a band change).
 */
export const TIER_LIST_EDIT_KINDS = ["ADD", "REMOVE", "MOVE"] as const;

export type TierListEditKind = (typeof TIER_LIST_EDIT_KINDS)[number];

/**
 * One recorded edit, as Undo and Redo describe it: "Undo: moved Barolo to
 * Outstanding". The history row itself is `tier_list_history`; this is the
 * part a person needs.
 */
export type TierListEditDto = {
  /** Per list, from 1, in the order the edits happened. */
  readonly seq: number;
  readonly kind: TierListEditKind;
  /**
   * What the edit was about: the entry added or removed, or the one that
   * moved. `null` for a reorder that moved several entries at once, where
   * no single entry is the subject.
   */
  readonly entry: TierListEntryRef | null;
  /**
   * The entry's display name, read when the history is asked for (so a
   * renamed item reads as it is now). `null` when there is no single entry,
   * or its row could not be read.
   */
  readonly entryName: string | null;
  /** The band it left; `null` for an `ADD`. */
  readonly fromBand: number | null;
  /** The band it landed in; `null` for a `REMOVE`. */
  readonly toBand: number | null;
  /**
   * X16: how many entries the edit added or removed — more than one for a
   * multi-add from Add entry or a list started from your ratings, which
   * Undo takes back whole. `1` for a single add or removal; for a MOVE, the
   * entries that changed band or place.
   */
  readonly entryCount: number;
  readonly at: string;
};

/**
 * Where the list's history stands for its owner: the edit Undo would take
 * back and the one Redo would put back, each `null` when there is none. A
 * new edit after an undo clears Redo, as everywhere else.
 */
export type TierListEditHistoryDto = {
  /** Edits recorded so far (ADD, REMOVE, MOVE), undone ones included. */
  readonly editCount: number;
  readonly undo: TierListEditDto | null;
  readonly redo: TierListEditDto | null;
};

/** What `undo` / `redo` did, and where the history stands after it. */
export type TierListHistoryStepResult = {
  readonly applied: TierListEditDto;
  readonly history: TierListEditHistoryDto;
};

/* -------------------------------------------------------------------------- */
/* Inputs                                                                      */
/* -------------------------------------------------------------------------- */

export type CreateTierListInput = {
  readonly name: string;
  readonly description?: string | null;
  /** Defaults to the column default, `PRIVATE`. */
  readonly privacy?: PermissionType;
  /** Defaults to the column default, `'place'`. Settable only at creation —
   *  the Hasura permissions this replaces never allowed changing it later,
   *  and `UpdateTierListInput` below preserves that. */
  readonly listType?: string;
  /**
   * X16: `RATINGS` starts the list pre-banded — every entry of its type you
   * have rated (an item review, a place rating), each in the band
   * `bandForScore` gives it, best first, at most {@link MAX_BATCH_ADD}. One
   * edit in the list's history, so a single Undo empties it again.
   * Omitted (or `EMPTY`), the list starts empty, as before.
   */
  readonly startFrom?: TierListStart;
};

/**
 * L03: copy a list you may see into a new PRIVATE list of yours. Entries keep
 * their band and order; notes and the description stay the owner's. A list
 * you may not see answers like a missing one.
 */
export type CloneTierListInput = {
  readonly sourceTierListId: string;
  /** Defaults to the source list's name. */
  readonly name?: string | null;
};

export const TIER_LIST_STARTS = ["EMPTY", "RATINGS"] as const;
export type TierListStart = (typeof TIER_LIST_STARTS)[number];

/** Every field is optional; only the present ones are written. Creator only. */
export type UpdateTierListInput = {
  readonly name?: string;
  readonly description?: string | null;
  readonly privacy?: PermissionType;
};

export type AddTierListItemInput = {
  readonly entry: TierListEntryRef;
  /** Defaults to `0`. Without `position`, the entry is appended to the
   *  band's end, its position computed in-turn (§2.1). */
  readonly band?: number;
  /**
   * M7, the positioned add (wave C "pairwise"): with `band` too, the entry is
   * inserted at this index of that band — `0` is the band's top, the band's
   * current length its end — and the entries at and after it move down one,
   * all as **one** `ADD` history entry, so one Undo takes the placement back
   * and one Redo puts it in the same place. Out of `0..length`, or without
   * `band`, is a `ValidationError`. `addOne` only: `addItems` appends, and
   * refuses a `position`.
   */
  readonly position?: number;
  readonly notes?: string | null;
  /**
   * The row id, minted by the caller. **The §8.4 idempotency key.** Falls
   * back to a key derived from the delivery for a system-delivered call
   * (`idempotencyKey`, `services/actors/src/lib/delivery.ts`), then a fresh
   * uuid.
   */
  readonly tierListItemId?: string;
};

/**
 * X16: the most entries one `addItems` (or a `RATINGS` start) writes — the
 * same 100 the API caps every page at, so a list made in one call can be
 * read back in one page.
 */
export const MAX_BATCH_ADD = 100;

/** X16's multi-add: what went on, and how many asks were passed over. */
export type AddTierListItemsResult = {
  readonly added: readonly TierListItemDto[];
  /**
   * Entries not added: already on the list, named twice in the call, or no
   * longer readable (a place you cannot see, an item that is gone).
   */
  readonly skipped: number;
};

/* -------------------------------------------------------------------------- */
/* X16 — adding without typing, and what to try next                          */
/* -------------------------------------------------------------------------- */

/**
 * Add entry's sections, in the order the sheet draws them. An entry is in
 * the first section that claims it, so no row appears twice:
 *
 *  - `IN_CELLARS` — items of the list's type in a cellar you made or
 *    co-own (never a place list);
 *  - `TASTED` — what you have rated or logged (a review, a drink log; for a
 *    place list, a place you rated, marked visited or logged a drink at);
 *  - `FRIENDS_RANKED` — what your friends ranked (band 1 and up) on their
 *    own lists you may see — never a stranger's, however public.
 *
 * None of it is on the list already.
 */
export const TIER_LIST_SUGGESTION_SECTIONS = [
  "IN_CELLARS",
  "TASTED",
  "FRIENDS_RANKED",
] as const;
export type TierListSuggestionSection =
  (typeof TIER_LIST_SUGGESTION_SECTIONS)[number];

/** One row of Add entry's sections, with the facts that say why it is there. */
export type TierListSuggestionDto = {
  readonly section: TierListSuggestionSection;
  readonly entry: TierListEntryRef;
  /**
   * Your own verdict, which picks the band it lands in: your newest review's
   * score (a place: your rating), else the score on your newest drink log
   * that has one. `null` when you have given neither.
   */
  readonly myScore: number | null;
  /** IN_CELLARS: the cellar you touched it in most recently. */
  readonly cellarName: string | null;
  /** IN_CELLARS: bottles of it not finished, across your cellars. */
  readonly bottleCount: number | null;
  /** TASTED: your drink logs of it (at it, for a place). */
  readonly logCount: number | null;
  /** TASTED: when you last rated, logged or visited it. */
  readonly lastTastedAt: string | null;
  /** FRIENDS_RANKED: the friend who ranked it highest (newest list on a tie). */
  readonly friendId: string | null;
  /** FRIENDS_RANKED: that friend's band for it. */
  readonly friendBand: number | null;
  /** FRIENDS_RANKED: how many friends rank it. */
  readonly friendCount: number | null;
};

/** At most this many rows per section. */
export const SUGGESTIONS_PER_SECTION = 30;

/**
 * Why "Try this next" shows a card — each reason a fact the viewer can
 * check, never a score:
 *
 *  - `FRIEND_RANKED` — a friend put it in one of their top two bands;
 *  - `LIKE_TOP` — it sits next to one of this list's top-two-band entries in
 *    the catalog (N08's retrieval: the stored item vectors and the names'
 *    trigrams, fused by rank);
 *  - `LIKE_LOVED` — the same, next to an item you love.
 *
 * Never something you have rated, logged, keep in a cellar, or that is on
 * the list.
 */
export const TRY_NEXT_REASONS = [
  "FRIEND_RANKED",
  "LIKE_TOP",
  "LIKE_LOVED",
] as const;
export type TryNextReason = (typeof TRY_NEXT_REASONS)[number];

export type TierListTryNextDto = {
  readonly reason: TryNextReason;
  readonly entry: TierListEntryRef;
  /** FRIEND_RANKED: who, their band, and how many friends rank it that high. */
  readonly friendId: string | null;
  readonly friendBand: number | null;
  readonly friendCount: number | null;
  /** LIKE_TOP / LIKE_LOVED: the entry it is like, by name as it reads now. */
  readonly likeName: string | null;
  /** LIKE_TOP: that entry's band on this list. */
  readonly likeBand: number | null;
};

/** At most this many cards. */
export const TRY_NEXT_LIMIT = 6;

/**
 * X16's templates: for each entry type, how many of them you have rated —
 * what a list started from your ratings would hold.
 */
export type TierListTemplateDto = {
  readonly listType: string;
  readonly entryType: TierListEntryType;
  readonly ratedCount: number;
};

export type DeletedTierList = { readonly id: string };
export type RemovedTierListItem = { readonly id: string };

/**
 * What `generateInsights` reports back — mirrors `RegenerateVectorResult`'s
 * shape (`items.ts`) for the same reason: a no-op delivery (throttled, or too
 * few items) is a normal outcome, not a failure, and callers should be able
 * to tell the two apart without parsing `reason`.
 */
export type GenerateInsightsResult = {
  readonly tierListId: string;
  readonly skipped: boolean;
  readonly reason: string;
};

/* -------------------------------------------------------------------------- */
/* The actor                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `TierListActor(tierListId)` — entity actor, owned by **B7** (§2.1, §3).
 *
 * Visibility (`get`, `items`): PUBLIC, or FRIENDS and the viewer is a friend
 * of the creator, or the viewer is the creator — `canSeeTierList` in
 * `@cellar-assistant/policy`. There is no co-owner table for tier lists (A3;
 * `packages/policy`'s module doc says so explicitly), so every write —
 * `update`, `delete`, `addItem`, `removeItem`, `reorderBand` — is creator-only,
 * with no co-owner carve-out the way `CellarActor` has one.
 *
 * `delete` does not refuse a non-empty tier list: unlike `cellar_items`
 * (`ON DELETE RESTRICT`), `tier_list_items.tier_list_id` is `ON DELETE
 * CASCADE`, so removing the header is a bounded, single-statement operation
 * that takes its items with it. §1.5's "no unbounded read" is about request
 * turns doing unbounded *work*; a tier list is a small, curated list by
 * construction, not a collection that grows without limit like a cellar.
 */
export type TierListActorInterface = {
  get(ctx: Ctx): Promise<TierListDto>;
  /**
   * X17: the public share page's read — PUBLIC lists only, the same answer
   * for every caller (anonymous included), `NotFoundError` for a list that is
   * missing or not PUBLIC alike. See `share.ts`.
   */
  getShared(ctx: Ctx): Promise<SharedTierListDto>;
  create(ctx: Ctx, input: CreateTierListInput): Promise<TierListDto>;
  /** L03: a PRIVATE copy of a visible list, at this (caller-minted) id. */
  clone(ctx: Ctx, input: CloneTierListInput): Promise<TierListDto>;
  update(ctx: Ctx, input: UpdateTierListInput): Promise<TierListDto>;
  delete(ctx: Ctx): Promise<DeletedTierList>;

  items(ctx: Ctx, page: PageArgs): Promise<Page<TierListItemDto>>;

  /**
   * §8.4: idempotent on `input.tierListItemId`, falling back to a key
   * derived from the delivery. Also naturally idempotent on content: the table's own
   * `unique_<type>_in_tier_list` constraints mean the same wine (or place, or
   * …) cannot sit twice in one tier list — a second `addItem` for an entry
   * already present throws `ConflictError` rather than silently duplicating.
   */
  addItem(ctx: Ctx, input: AddTierListItemInput): Promise<TierListItemDto>;
  /**
   * X16's multi-add: several entries in one transaction and **one** history
   * edit, so the toast's Undo takes them all back. Each is appended to the
   * end of its band, in the order given. Entries already on the list, named
   * twice, or unreadable are skipped and counted, never refused — a sheet of
   * suggestions can be stale by the time it is sent. At most
   * {@link MAX_BATCH_ADD}; none at all is a `ValidationError`.
   */
  addItems(
    ctx: Ctx,
    inputs: readonly AddTierListItemInput[],
  ): Promise<AddTierListItemsResult>;
  /**
   * X16: Add entry's sections ({@link TierListSuggestionSection}) for the
   * list's own type, none of them already on it. Creator only: anyone else
   * who may see the list gets `[]`. A list whose type names no entry type
   * gets `[]`.
   */
  addSuggestions(ctx: Ctx): Promise<readonly TierListSuggestionDto[]>;
  /**
   * X16's grounded "Try this next", for the viewer: at most `limit` (default
   * {@link TRY_NEXT_LIMIT}) entries of the list's type, each with the fact
   * that put it there ({@link TryNextReason}). Deterministic — no model call
   * — and empty rather than padded when nothing qualifies.
   */
  tryNext(
    ctx: Ctx,
    limit?: number | null,
  ): Promise<readonly TierListTryNextDto[]>;
  removeItem(ctx: Ctx, tierListItemId: string): Promise<RemovedTierListItem>;
  /**
   * One transaction. `orderedIds` is the **complete** post-reorder membership
   * of `band`, in order — every id currently in `band` must appear in it (an
   * omission is a `ValidationError`, not a silent drop), and an id not
   * currently in `band` is *moved* into it. Any other band that loses a
   * member this way is renumbered too, in the same transaction, which is
   * what "batch-renumbers the affected band(s)" (§6 B7) means: a cross-band
   * drag is one call, not two.
   */
  reorderBand(
    ctx: Ctx,
    band: number,
    orderedIds: readonly string[],
  ): Promise<readonly TierListItemDto[]>;

  /**
   * D4: where the edit history stands — **creator only**. `null` for anyone
   * else who may see the list: the history is the owner's tool, not part of
   * what a shared list shows. Not visible at all → `NotFound`, as `get`.
   */
  editHistory(ctx: Ctx): Promise<TierListEditHistoryDto | null>;
  /**
   * D4: take back the latest edit not already undone, and record that as a
   * new `UNDO` row (the log is append-only). Creator only. A content change
   * like any other edit: bumps `content_updated_at` and asks for insights.
   *
   * `expectedSeq` is the `seq` of the edit the caller means to take back —
   * the `undo` its history showed. Anything else on top (or nothing) is a
   * `ConflictError` with reason `TIER_LIST_HISTORY_MOVED` and no write, so a
   * stale tab cannot undo an edit made since it last read the list.
   */
  undo(ctx: Ctx, expectedSeq: number): Promise<TierListHistoryStepResult>;
  /**
   * D4: put back the latest undone edit — `undo`'s mirror; a `REDO` row.
   * `expectedSeq` is the edit the caller means to put back (`redo`).
   */
  redo(ctx: Ctx, expectedSeq: number): Promise<TierListHistoryStepResult>;

  /**
   * `system`, via the outbox — replaces the `tier_list_items_content_changed`
   * trigger plus the `generate_tier_list_insights` event trigger. Enqueued by
   * every content-changing write, never by `update`. Idempotent by
   * construction: it recomputes from current state and is a no-op (returns
   * `skipped: true`) under 3 items or inside the 24h throttle, so a
   * redelivery after a successful generation just throttles again.
   */
  generateInsights(
    ctx: Ctx,
    payload?: Record<string, unknown>,
  ): Promise<GenerateInsightsResult>;
};

export const TierListActorDescriptor: ActorDescriptor<TierListActorInterface> =
  {
    actorType: "TierListActor",
    category: "entity",
    // Each edit enqueues `generateInsights`, an LLM call.
    methods: {
      get: {},
      getShared: {},
      // X16: a list started from your ratings has entries, which enqueues
      // `generateInsights` like any other edit.
      create: { modelBacked: true },
      // L03: a copy has entries, which enqueues `generateInsights`.
      clone: { modelBacked: true },
      update: {},
      delete: {},
      items: {},
      addItem: { modelBacked: true },
      addItems: { modelBacked: true },
      addSuggestions: {},
      tryNext: {},
      removeItem: { modelBacked: true },
      reorderBand: { modelBacked: true },
      editHistory: {},
      undo: { modelBacked: true },
      redo: { modelBacked: true },
      generateInsights: {},
    },
  };
