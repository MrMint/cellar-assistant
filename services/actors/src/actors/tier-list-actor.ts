/**
 * `TierListActor` — B7 (migration plan §2.1, §3).
 *
 * Owns `tier_lists` and `tier_list_items`, and loads both on activate: a tier
 * list is a small, curated ranking (six bands, each meant to hold a handful of
 * entries), so — same reasoning as `CellarActor` — the whole aggregate fits in
 * memory and every read pages the cached list rather than issuing a query.
 *
 * ## Visibility: creator-only writes, no co-owner
 *
 * `packages/policy`'s module doc says it outright: "no co-owner table exists
 * for tier lists". `canSeeTierList` (the four-branch rule, minus the
 * co-owner branch) gates `get` and `items`; every write is creator-only, with
 * no `CellarActor`-style "co-owner may rename, only the creator may re-own"
 * split — there is nothing to split.
 *
 * ## Items and places, modelled honestly
 *
 * A3's finding: `tier_list_items.type` (a generated column) carries `'PLACE'`
 * as a seventh value the `item_type` enum cannot represent, which is why the
 * column is `text`. This actor reads that generated column directly rather
 * than re-deriving it from the seven polymorphic FK columns in JS — Postgres
 * already computed it, and it can never disagree with the `CHECK
 * (num_nonnulls(...) = 1)` constraint that guarantees exactly one is set.
 * `@cellar-assistant/contracts`' `TierListEntryRef` is `ItemRef`'s six types
 * plus `"PLACE"`; nothing here assumes every row is an item.
 *
 * ## Ordering: `band` (0–5) + sequential `position`, computed in-turn
 *
 * `addItem` appends to the end of a band using the length of the cached
 * per-band list — no `SELECT max(position)`, so no read-modify-write race
 * (§2.1's own words). `removeItem` and `reorderBand` renumber whatever band(s)
 * they touch back to clean `0..n-1` in the same transaction as the row
 * changes, so positions are never left with a gap. `reorderBand`'s contract:
 * `orderedIds` is the **complete** post-reorder membership of one band; an id
 * currently in that band but missing from `orderedIds` is a `ValidationError`
 * (no silent drops), and an id *not* currently in that band is a cross-band
 * move — its old band is inferred from the cached aggregate and renumbered
 * too, in the same transaction. That is what "batch-renumbers the affected
 * band(s)" (§6 B7) means: one call, not two.
 *
 * ## Concurrency: no optimistic lock, because none is needed
 *
 * `reorderBand` reads `this.requireAggregate()` — the in-memory cache — to
 * decide what to write, with no version column and no `SELECT ... FOR
 * UPDATE`. That is safe *only* because Dapr guarantees one turn at a time per
 * actor id: two reorders of the same list are never actually concurrent, they
 * are two sequential turns on the same activation, the second of which always
 * sees the first's committed effect (`reload()` runs after every write). The
 * test file demonstrates both halves of this: sequential turns on one
 * activation compose correctly, and two *separate* activations acting on
 * stale reads of the same row — the scenario Dapr's placement guarantee
 * exists to rule out — do not: `#writePositions`' skip-if-unchanged check
 * (compares against each activation's own cache) lets a second, stale
 * activation leave a row un-rewritten because *it* still thinks that row is
 * already correct, producing two rows sharing one position — the exact
 * invariant this method exists to guarantee. (Since D4 every recorded edit
 * also takes the next `tier_list_history.seq`, unique per list, so such a
 * stale second write is now refused whole rather than merged, as a retryable
 * `ConflictError` after a cache rebuild (`#recordedTx`); that is a backstop,
 * not a reason to drop the guarantee — `update` records nothing.)
 *
 * ## Content-change signal, replacing a trigger with an outbox row
 *
 * `content_updated_at` used to be bumped by `update_tier_list_content_
 * timestamp()`, a trigger on `tier_list_items` INSERT/UPDATE/DELETE, which fed
 * a Hasura event trigger that called the `generateTierListInsights` function.
 * Here, `addItem`, `removeItem` and `reorderBand` bump `content_updated_at`
 * and enqueue an outbox row targeting this actor's own `generateInsights` in
 * the *same* transaction as the row change (§1.4) — `update` (the header-only
 * method) does neither, matching the old trigger's scope exactly (it never
 * fired on a `tier_lists` UPDATE, only on `tier_list_items` writes).
 *
 * ### A no-op reorder is not a content change
 *
 * `reorderBand` used to bump and enqueue **unconditionally** — including when
 * `orderedIds` described the order the band was already in. That is not a
 * cosmetic waste. The outbox is one global FIFO drained serially, so rows
 * enqueued by one request sit ahead of every other user's friend
 * confirmations, vector regenerations and menu scans; and the API allows 30
 * root fields per document (`services/api/src/limits.ts`), so one
 * authenticated POST of thirty no-op reorders enqueued thirty rows *from no
 * state change at all* — free, repeatable amplification against a shared
 * queue. Measured before the fix: 30 no-op calls produced 30 rows at 412
 * rows/s against a drain that managed 49 rows/s.
 *
 * It is also a straight regression against the trigger this replaced. The
 * trigger fired on `tier_list_items` INSERT/UPDATE/DELETE; a no-op reorder
 * writes no `tier_list_items` row, so the trigger never fired for one.
 * `#writePositions` already skipped rows that were where they belonged — it
 * now *reports* how many it wrote, and `reorderBand` bumps and enqueues only
 * when that is non-zero. `addItem` and `removeItem` are unconditional still,
 * because each always writes a row.
 *
 * ### Bounding what one request can enqueue
 *
 * The other half. `generateInsights` carries an empty payload, recomputes from
 * whatever the aggregate holds at *delivery* time, and is throttled to one
 * real generation per 24h — so N queued rows do the work of one, and the other
 * N-1 return `{skipped: true, reason: "throttled"}` after occupying N-1 slots
 * in a global serial queue. The enqueue therefore goes through
 * `enqueueOutboxOnce`, which inserts only when no `pending` row already names
 * this `(TierListActor, id, generateInsights)`. Thirty *real* reorders now
 * leave one row instead of thirty.
 *
 * Nothing is dropped and nothing is rate-limited: a row already `delivering`
 * does **not** satisfy the guard, because that delivery read the aggregate
 * before this change landed. See `lib/outbox.ts` for why the guard ignores
 * `payload` and what that rules out.
 *
 * ## `generateInsights` has no AI provider wired yet, and says so
 *
 * The throttle (24h since `insights_generated_at`) and minimum-content check
 * (fewer than 3 items) are real and tested. The actual model call is behind an
 * injected seam (`InsightsGenerator`, constructor-injected exactly the way
 * `CellarActor` injects `EmbedQuery`) because **no AI provider library exists
 * in `services/actors` yet** — `_utils/ai-providers`'s port is scoped to whichever
 * workstream first needs a synchronous AI call (B2's `ItemOnboardingActor.
 * start` is the natural first caller). The production default throws a clear
 * `ConflictError` instead of silently no-op'ing, so a real deployment fails
 * loudly rather than pretending insights were generated. See the B7 report for
 * the reasoning; this is a deliberate scope boundary, not an oversight.
 *
 * ## Edit history, Undo and Redo (D4)
 *
 * Every edit to the entries — `addItem` (ADD), `removeItem` (REMOVE), a
 * `reorderBand` that moved something (MOVE, within or across bands) — appends
 * a `tier_list_history` row in the same transaction, carrying a snapshot of
 * what it changed. `undo` / `redo` apply the edit on top of the matching
 * stack backwards or forwards and append an `UNDO` / `REDO` row naming it.
 * The log is append-only (a trigger refuses UPDATE), and where Undo and Redo
 * stand is a replay of it (`lib/tier-list-history.ts`), so it survives a
 * reload and a new activation. Applying is forgiving: an entry that is gone
 * is skipped and every touched band is renumbered, so a stale edit never
 * strands the ones beneath it. `editHistory` is the creator's alone; anyone
 * else who may see the list gets `null`.
 *
 * ## No `updateItem` — read the permissions this replaces
 *
 * Today's `tier_list_items` update permission allows writing `band`,
 * `position` and `notes` directly per row — the N-parallel-updates pattern
 * §6 B7 names as what `reorderBand` replaces. This actor keeps `notes` as
 * write-once-at-`addItem` rather than adding a separate `updateItem`/
 * `setNotes` method: §2.1 lists exactly `addItem`, `removeItem`,
 * `reorderBand` for item-level writes, and inventing a fourth was not asked
 * for. Flagged in the B7 report as worth confirming, not decided unilaterally.
 */
import { randomUUID } from "node:crypto";
import type {
  ActorCategory,
  AddTierListItemInput,
  AddTierListItemsResult,
  CloneTierListInput,
  CreateTierListInput,
  Ctx,
  DeletedTierList,
  GenerateInsightsResult,
  Page,
  PageArgs,
  PermissionType,
  RemovedTierListItem,
  SharedTierListDto,
  TierListActorInterface,
  TierListDto,
  TierListEditDto,
  TierListEditHistoryDto,
  TierListEntryRef,
  TierListHistoryStepResult,
  TierListItemDto,
  TierListSuggestionDto,
  TierListTryNextDto,
  UpdateTierListInput,
} from "@cellar-assistant/contracts";
import {
  ConflictError,
  entryTypeOfListType,
  ForbiddenError,
  formatStoredFailure,
  isActorError,
  isTierListEntryType,
  MAX_BAND,
  MAX_BATCH_ADD,
  MIN_BAND,
  NotFoundError,
  offsetPage,
  TierListActorDescriptor,
  TRY_NEXT_LIMIT,
  ValidationError,
} from "@cellar-assistant/contracts";
import {
  tierListHistory,
  tierListItems,
  tierLists,
  user,
} from "@cellar-assistant/db";
import { and, eq, inArray, sql } from "@cellar-assistant/db/orm";
import {
  canSeeTierList,
  canShareTierListAnonymously,
  isOwner,
} from "@cellar-assistant/policy";
import type { ActorId, DaprClient } from "@dapr/dapr";
import { handleForId, isEmailShaped } from "../auth/display-name.ts";
import { EntityActorBase } from "../lib/actor-base.ts";
import { aiCapabilities } from "../lib/ai/capabilities.ts";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import { ARCS } from "../lib/item-arcs.ts";
import { enqueueOutboxOnce } from "../lib/outbox.ts";
import { OUTBOX_TARGETS } from "../lib/outbox-targets.ts";
import {
  publicDisplayName,
  publicItemImages,
  shareKey,
} from "../lib/share-reads.ts";
import type { TierListEntryDescriptor } from "../lib/tier-list-entries.ts";
import {
  entryKey,
  MIN_GROUNDED_ENTRIES,
  resolveTierListEntries,
} from "../lib/tier-list-entries.ts";
import type {
  BandOrders,
  EditChange,
  EntrySnapshot,
  HistoryLogRow,
  MoveSubject,
} from "../lib/tier-list-history.ts";
import {
  appendedSnapshots,
  historyStacks,
  insertAt,
  isEditKind,
  movedCount,
  movedEntry,
  parseChange,
  planBandOrders,
} from "../lib/tier-list-history.ts";
import { tierListInsightsStatus } from "../lib/tier-list-insights-status.ts";
import {
  addSuggestionsFor,
  ratedEntries,
  tryNextFor,
  viewerScopeOf,
} from "../lib/tier-list-suggestions.ts";
import { hiddenPlaceIds, placeIsVisible } from "../lib/unshared-places.ts";
import { isUuid, requireUuid } from "../lib/uuid.ts";
import { tierListVisibility } from "../lib/visibility.ts";
import { visibilityScope } from "../lib/visibility-sql.ts";

type TierListRow = typeof tierLists.$inferSelect;
type TierListItemRow = typeof tierListItems.$inferSelect;

export type TierListAggregate = {
  readonly tierList: TierListRow;
  /** Every row, `band desc, position asc` — the plan's own read ordering. */
  readonly items: readonly TierListItemRow[];
  /**
   * D4: the edit log's replay columns, `seq` order — enough to know where
   * Undo and Redo stand (`historyStacks`). The snapshots are read only when
   * an edit is undone, redone or described.
   */
  readonly history: readonly HistoryLogRow[];
};

/**
 * `generateInsights`'s content gate: the old function's `MIN_ITEMS`.
 *
 * B7b moved the number itself into `lib/tier-list-entries.ts`, which applies
 * the same threshold to *describable* entries rather than to the row count, so
 * the two gates are one constant.
 */
export const MIN_ITEMS_FOR_INSIGHTS = MIN_GROUNDED_ENTRIES;

/** `generateInsights`'s throttle: the old function's `THROTTLE_MS`, 24h. */
export const INSIGHTS_THROTTLE_MS = 24 * 60 * 60 * 1000;

/**
 * One ranked row, as the insights prompt needs to see it: where the user put
 * it, what they said about it, and **what it actually is**.
 *
 * B7b widened this. B7 passed `TierListItemDto`, whose `entry` is a type and a
 * uuid — so `ai/prompts.ts` could only render "1. [Outstanding, #1 in tier]
 * place", and the six fields it asks the model for are all claims about what
 * was ranked. See `lib/tier-list-entries.ts` for the consequence and for why
 * the descriptor stops where it does.
 */
export type TierListInsightsEntry = TierListEntryDescriptor & {
  readonly band: number;
  readonly position: number;
  readonly notes: string | null;
};

/**
 * `generateInsights`'s one model-shaped dependency, injected the same way
 * `CellarActor.#embed` is. Takes everything an insights generator needs;
 * returns whatever JSON `ai_insights` should hold next.
 *
 * The entries arrive **already resolved**. The actor does the reads, inside its
 * own turn, straight from `places` and the six item tables — §1.1's FK-lookup
 * read, the same one `../lib/visibility.ts` performs on `UserActor`'s table.
 * The seam is handed data, never a database handle and never an actor client,
 * so §8.5's closed set of synchronous entity→entity edges is untouched: this
 * adds none.
 */
export type InsightsGenerator = (
  ctx: Ctx,
  input: {
    readonly tierListId: string;
    readonly name: string;
    readonly description: string | null;
    readonly listType: string;
    readonly entries: readonly TierListInsightsEntry[];
  },
) => Promise<Record<string, unknown>>;

export const noInsightsGenerator: InsightsGenerator = async () => {
  throw new ConflictError(
    "TierListActor.generateInsights has no AI provider wired: AI_PROVIDER is " +
      "unset, so `installAI()` installed nothing at boot. Set AI_PROVIDER=ollama " +
      `for a local model that needs no credentials. See services/actors/README.md · Local AI.`,
    "AI_UNCONFIGURED",
  );
};

/**
 * The installed generator, defaulting to the loud one above.
 *
 * X1 adds the registry rather than a wider constructor because Dapr builds an
 * actor with `(daprClient, id)` alone — there is no construction site a real
 * provider could be threaded through. `boot()` installs one at startup; the
 * default is unchanged, so a process that never calls `setInsightsGenerator`
 * (every test here, and any deployment with `AI_PROVIDER` unset) still gets
 * `noInsightsGenerator` and still throws.
 */
let installedInsightsGenerator: InsightsGenerator = noInsightsGenerator;

export const setInsightsGenerator = (next: InsightsGenerator): void => {
  installedInsightsGenerator = next;
};

export const insightsGenerator = (): InsightsGenerator =>
  installedInsightsGenerator;

const requireName = (name: string): string => {
  const trimmed = name.trim();
  if (trimmed === "") throw new ValidationError("a tier list needs a name");
  if (trimmed.length > 200) {
    throw new ValidationError(
      "a tier list's name must be 200 characters or less",
    );
  }
  return trimmed;
};

/**
 * W-19: a copy's default name says it is yours and whose it was —
 * `Sam's reds (from Sam)` — or `… (copy)` for a copy of your own list. The
 * owner is named by their first name (or the handle a missing or
 * email-shaped name gets everywhere else), and the source name is shortened
 * so the whole stays inside {@link requireName}'s 200 characters.
 */
export const cloneName = (
  sourceName: string,
  owner: { readonly id: string; readonly name: string } | null,
  viewerId: string,
): string => {
  const base = sourceName.trim();
  const ownName = owner === null || owner.id === viewerId;
  const shown =
    owner === null || ownName
      ? null
      : owner.name.trim() === "" || isEmailShaped(owner.name)
        ? handleForId(owner.id)
        : (owner.name.trim().split(/\s+/)[0] ?? owner.name.trim());
  const suffix = shown === null ? " (copy)" : ` (from ${shown})`;
  const room = Math.max(1, 200 - suffix.length);
  const head = base.length > room ? `${base.slice(0, room - 1)}…` : base;
  return `${head}${suffix}`;
};

/**
 * M7: an index into a band of `length` rows — `0` its top, `length` its end.
 */
const requirePosition = (value: number, length: number): number => {
  if (!Number.isInteger(value) || value < 0 || value > length) {
    throw new ValidationError(
      `position must be an integer between 0 and ${length} (the band's length), got ${value}`,
    );
  }
  return value;
};

const requireBand = (value: number): number => {
  if (!Number.isInteger(value) || value < MIN_BAND || value > MAX_BAND) {
    throw new ValidationError(
      `band must be an integer between ${MIN_BAND} and ${MAX_BAND}, got ${value}`,
    );
  }
  return value;
};

/**
 * The seven-column polymorphic FK: `place_id` plus the six-column item arc
 * (`../lib/item-arcs.ts`), under one `num_nonnulls(...) = 1` check.
 */
const ITEMS = ARCS.tierListItems;

/** The column an entry of `type` is held in, as a row property. */
const entryProperty = (type: TierListEntryRef["type"]) =>
  type === "PLACE" ? "placeId" : ITEMS.properties[type];

const requireEntry = (entry: TierListEntryRef): TierListEntryRef => {
  if (!isTierListEntryType(entry.type)) {
    throw new ValidationError(`not a tier-list entry type: ${entry.type}`);
  }
  return { type: entry.type, id: requireUuid(entry.id, "entry.id") };
};

/**
 * Read side: the generated `type` column, trusted over re-deriving it from
 * the seven FK columns — Postgres already computed it under the same check
 * constraint that guarantees exactly one is non-null.
 */
const entryRefOf = (row: TierListItemRow): TierListEntryRef => {
  const type = row.type;
  if (type === null || !isTierListEntryType(type)) {
    throw new ConflictError(
      `tier_list_item ${row.id} has no resolvable type; ` +
        "exactly_one_tier_item_reference should make this unreachable",
    );
  }
  const item = type === "PLACE" ? null : ITEMS.refOf(row);
  const id =
    type === "PLACE" ? row.placeId : item?.type === type ? item.id : null;
  if (id === null) {
    throw new ConflictError(
      `tier_list_item ${row.id} type=${type} but its FK column is null`,
    );
  }
  return { type, id };
};

const iso = (value: Date | null): string | null =>
  value === null ? null : value.toISOString();

/** `content_updated_at` is the one `NOT NULL` timestamp here (module doc). */
const requiredIso = (value: Date): string => value.toISOString();

const toItemDto = (row: TierListItemRow): TierListItemDto => ({
  id: row.id,
  tierListId: row.tierListId,
  band: row.band,
  position: row.position,
  notes: row.notes,
  entry: entryRefOf(row),
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

/** F-85: one count per band, `[MIN_BAND]` first, `[MAX_BAND]` last. */
const bandCountsOf = (rows: readonly { band: number }[]): number[] => {
  const counts = Array.from({ length: MAX_BAND - MIN_BAND + 1 }, () => 0);
  for (const row of rows) {
    const index = row.band - MIN_BAND;
    if (index >= 0 && index < counts.length) {
      counts[index] = (counts[index] ?? 0) + 1;
    }
  }
  return counts;
};

/** One band's ids in position order. */
const bandOrderOf = (
  rows: readonly { id: string; band: number; position: number }[],
  band: number,
): string[] =>
  rows
    .filter((row) => row.band === band)
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((row) => row.id);

/** A row as a REMOVE records it, so an Undo can put it back exactly. */
const snapshotOf = (row: TierListItemRow): EntrySnapshot => ({
  id: row.id,
  entry: entryRefOf(row),
  band: row.band,
  position: row.position,
  notes: row.notes,
  createdAt: iso(row.createdAt),
});

/** The one entry a reorder moved, with what it ranks, or `null`. */
const subjectOf = (
  before: BandOrders,
  after: BandOrders,
  byId: ReadonlyMap<string, TierListItemRow>,
): MoveSubject | null => {
  const moved = movedEntry(before, after);
  if (moved === null) return null;
  const row = byId.get(moved.id);
  return row === undefined ? null : { ...moved, entry: entryRefOf(row) };
};

/**
 * The history's `(tier_list_id, seq)` key refusing a write: this activation's
 * cache named a `seq` another writer had already taken, so its picture of the
 * list is stale (see the class doc on stale activations).
 */
const isStaleHistoryWrite = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const cause = (error as { cause?: unknown }).cause;
  const pg = (cause instanceof Error ? cause : error) as {
    code?: unknown;
    constraint?: unknown;
  };
  return (
    pg.code === "23505" &&
    pg.constraint === "tier_list_history_tier_list_id_seq_key"
  );
};

/** Throws instead of a non-null assertion (repo style) when a lookup "can't" miss. */
const mustGet = <K, V>(map: ReadonlyMap<K, V>, key: K, what: string): V => {
  const value = map.get(key);
  if (value === undefined) {
    throw new ConflictError(`${what} ${String(key)} vanished mid-turn`);
  }
  return value;
};

export class TierListActor
  extends EntityActorBase<TierListAggregate>
  implements TierListActorInterface
{
  static readonly category: ActorCategory = TierListActorDescriptor.category;

  readonly #generateInsights: InsightsGenerator;

  constructor(
    daprClient: DaprClient,
    id: ActorId,
    db: DbOrTx = actorDb(),
    generateInsights: InsightsGenerator = insightsGenerator(),
  ) {
    super(daprClient, id, db);
    this.#generateInsights = generateInsights;
  }

  protected async loadAggregate(id: string): Promise<TierListAggregate | null> {
    const [tierList] = await this.db
      .select()
      .from(tierLists)
      .where(eq(tierLists.id, id));
    if (tierList === undefined) return null;

    const items = await this.db
      .select()
      .from(tierListItems)
      .where(eq(tierListItems.tierListId, id))
      .orderBy(sql`${tierListItems.band} desc, ${tierListItems.position} asc`);

    const history = await this.db
      .select({
        seq: tierListHistory.seq,
        kind: tierListHistory.kind,
        targetSeq: tierListHistory.targetSeq,
      })
      .from(tierListHistory)
      .where(eq(tierListHistory.tierListId, id))
      .orderBy(tierListHistory.seq);

    return { tierList, items, history };
  }

  /* ---------------------------------------------------------------------- */
  /* Reads                                                                   */
  /* ---------------------------------------------------------------------- */

  async get(ctx: Ctx): Promise<TierListDto> {
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);
    return await this.#dtoFor(ctx, aggregate);
  }

  async items(ctx: Ctx, page: PageArgs): Promise<Page<TierListItemDto>> {
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);
    // X27: a place still under review is its creator's alone, so a public
    // list's entry for one is dropped for every other viewer — silently, as
    // if it were not on the list. Read fresh: `places` is not ours to cache.
    const rows = await this.#visibleItems(ctx, aggregate);
    return offsetPage(rows.map(toItemDto), page);
  }

  /**
   * X17's public share page. PUBLIC lists only — `canShareTierListAnonymously`
   * — and deliberately blind to `ctx`: the owner of a PRIVATE list and a
   * friend of a FRIENDS one get the same `NotFoundError` as a stranger, worded
   * exactly as a missing row (`refuseAsAbsent`), so the share URL is no
   * oracle for which lists exist. Signed-in viewers read `get` instead.
   *
   * Entries are described by the same FK-lookup read the insights path uses
   * (`resolveTierListEntries`), plus each ranked item's newest **public**
   * photo. A list is curated and small (module doc), so this is one select
   * per entry type present, not per entry.
   */
  async getShared(_ctx: Ctx): Promise<SharedTierListDto> {
    const { tierList, items } = this.requireAggregate();
    if (!canShareTierListAnonymously(tierList)) this.refuseAsAbsent();

    const refs = items.map(entryRefOf);
    const itemRefs = refs.flatMap((ref) =>
      ref.type === "PLACE" ? [] : [{ type: ref.type, id: ref.id }],
    );
    const [descriptors, images, ownerDisplayName] = await Promise.all([
      resolveTierListEntries(this.db, refs),
      publicItemImages(this.db, itemRefs),
      publicDisplayName(this.db, tierList.createdById),
    ]);

    return {
      id: tierList.id,
      name: tierList.name,
      description: tierList.description,
      listType: tierList.listType,
      privacy: tierList.privacy,
      ownerDisplayName,
      updatedAt: requiredIso(tierList.contentUpdatedAt),
      entries: items.map((row, index) => {
        const ref = refs[index] ?? entryRefOf(row);
        const found = descriptors.get(entryKey(ref));
        return {
          id: row.id,
          band: row.band,
          position: row.position,
          notes: row.notes,
          entryType: ref.type,
          entryId: ref.id,
          name: found?.name ?? null,
          location: found?.location ?? null,
          imageFileId:
            ref.type === "PLACE"
              ? null
              : (images.get(shareKey(ref))?.fileId ?? null),
        };
      }),
    };
  }

  /* ---------------------------------------------------------------------- */
  /* The tier list itself                                                    */
  /* ---------------------------------------------------------------------- */

  /** Provisional-id pattern: the caller mints `tierListId` (§2.1, like `FileActor`/`CellarActor`). */
  async create(ctx: Ctx, input: CreateTierListInput): Promise<TierListDto> {
    const creator = ctx.viewerId;
    if (creator === null) {
      throw new ForbiddenError("sign in to create a tier list");
    }
    if (this.aggregate !== null) {
      throw new ConflictError(`tier list ${this.key} already exists`);
    }
    const name = requireName(input.name);
    const startFrom = input.startFrom ?? "EMPTY";
    if (startFrom !== "EMPTY" && startFrom !== "RATINGS") {
      throw new ValidationError(`not a way to start a list: ${startFrom}`);
    }
    // X16: a list started from your ratings. The column default is
    // `'place'`, so an omitted `listType` is a place list here too.
    let seed: readonly EntrySnapshot[] = [];
    if (startFrom === "RATINGS") {
      const type = entryTypeOfListType(input.listType ?? "place");
      if (type === null) {
        throw new ValidationError(
          `a list of "${input.listType}" cannot start from your ratings`,
        );
      }
      const rated = await ratedEntries(this.db, creator, type);
      seed = appendedSnapshots(
        [],
        rated.map((row) => ({
          entry: row.entry,
          band: row.band,
          notes: null,
          id: randomUUID(),
        })),
      );
    }

    await this.tx(async (tx) => {
      await tx.insert(tierLists).values({
        id: this.key,
        name,
        description: input.description ?? null,
        createdById: creator,
        ...(input.privacy === undefined ? {} : { privacy: input.privacy }),
        ...(input.listType === undefined ? {} : { listType: input.listType }),
      });
      if (seed.length === 0) return;
      await this.#insertSnapshots(tx, seed);
      // The list's first edit, so `seq` 1: one Undo empties it again.
      await tx.insert(tierListHistory).values({
        tierListId: this.key,
        seq: 1,
        kind: "ADD",
        targetSeq: null,
        change: { kind: "ADD", rows: seed },
        userId: creator,
      });
      await this.#bumpContentAndEnqueueInsights(tx, ctx);
    });
    await this.reload();
    return await this.#dtoFor(ctx, this.requireAggregate());
  }

  /**
   * L03: a copy of a list you may see, as a new PRIVATE list of yours at this
   * actor's (caller-minted) id — "compare and clone" on a friend's profile.
   *
   * The source is read fresh and decided by the same rule `get` uses
   * (`canSeeTierList` over `tierListVisibility`), so a list you may not see
   * and one that does not exist answer with the same `NotFound`, worded as a
   * missing row. What is copied is what you would see on it: the entries, in
   * band and order, minus a place still under review (X27). Not the notes —
   * they are the owner's words — and not the description. Want-to-try is a
   * separate, private table (L42) and never part of a tier list, so a clone
   * cannot reach it.
   *
   * One edit, `seq` 1, like a list started from your ratings: Undo inside the
   * list empties it, and the client's Undo deletes the list outright.
   */
  async clone(ctx: Ctx, input: CloneTierListInput): Promise<TierListDto> {
    const creator = ctx.viewerId;
    if (creator === null) {
      throw new ForbiddenError("sign in to copy a tier list");
    }
    if (this.aggregate !== null) {
      throw new ConflictError(`tier list ${this.key} already exists`);
    }
    const absent = (): never => {
      throw new NotFoundError(
        `tier list ${input.sourceTierListId} does not exist`,
      );
    };
    const sourceId = isUuid(input.sourceTierListId)
      ? input.sourceTierListId
      : absent();
    const [source] = await this.db
      .select()
      .from(tierLists)
      .where(eq(tierLists.id, sourceId));
    if (
      source === undefined ||
      !canSeeTierList(ctx, await tierListVisibility(this.db, ctx, source))
    ) {
      absent();
    }
    const found = source as typeof tierLists.$inferSelect;
    const rows = await this.db
      .select()
      .from(tierListItems)
      .where(eq(tierListItems.tierListId, sourceId))
      .orderBy(sql`${tierListItems.band} desc, ${tierListItems.position} asc`);
    const hidden = await hiddenPlaceIds(
      this.db,
      ctx,
      rows.flatMap((row) => {
        const ref = entryRefOf(row);
        return ref.type === "PLACE" ? [ref.id] : [];
      }),
    );
    const seed = appendedSnapshots(
      [],
      rows.flatMap((row) => {
        const entry = entryRefOf(row);
        if (entry.type === "PLACE" && hidden.has(entry.id)) return [];
        return [{ entry, band: row.band, notes: null, id: randomUUID() }];
      }),
    );
    const [owner] = await this.db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(eq(user.id, found.createdById));
    const name = requireName(
      input.name === undefined ||
        input.name === null ||
        input.name.trim() === ""
        ? cloneName(found.name, owner ?? null, creator)
        : input.name,
    );

    await this.tx(async (tx) => {
      await tx.insert(tierLists).values({
        id: this.key,
        name,
        description: null,
        createdById: creator,
        privacy: "PRIVATE",
        listType: found.listType,
      });
      if (seed.length === 0) return;
      await this.#insertSnapshots(tx, seed);
      await tx.insert(tierListHistory).values({
        tierListId: this.key,
        seq: 1,
        kind: "ADD",
        targetSeq: null,
        change: { kind: "ADD", rows: seed },
        userId: creator,
      });
      await this.#bumpContentAndEnqueueInsights(tx, ctx);
    });
    await this.reload();
    return await this.#dtoFor(ctx, this.requireAggregate());
  }

  /** Creator only; header fields only. Never touches `content_updated_at`. */
  async update(ctx: Ctx, input: UpdateTierListInput): Promise<TierListDto> {
    const aggregate = this.requireAggregate();
    await this.#requireCreator(ctx, aggregate, "update this tier list");

    const patch: {
      name?: string;
      description?: string | null;
      privacy?: PermissionType;
    } = {};
    if (input.name !== undefined) patch.name = requireName(input.name);
    if (input.description !== undefined) patch.description = input.description;
    if (input.privacy !== undefined) patch.privacy = input.privacy;
    if (Object.keys(patch).length === 0)
      return await this.#dtoFor(ctx, aggregate);

    await this.tx(async (tx) => {
      await tx
        .update(tierLists)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(tierLists.id, this.key));
    });
    await this.reload();
    return await this.#dtoFor(ctx, this.requireAggregate());
  }

  /**
   * Creator only. `tier_list_items.tier_list_id` is `ON DELETE CASCADE`
   * (unlike `cellar_items`, `RESTRICT`), so this is one statement — see the
   * contracts module doc for why that difference from `CellarActor.delete`
   * is deliberate rather than an oversight.
   */
  async delete(ctx: Ctx): Promise<DeletedTierList> {
    const aggregate = this.requireAggregate();
    await this.#requireCreator(ctx, aggregate, "delete a tier list");

    await this.tx(async (tx) => {
      await tx.delete(tierLists).where(eq(tierLists.id, this.key));
    });
    this.setAggregate(null);
    return { id: this.key };
  }

  /* ---------------------------------------------------------------------- */
  /* Items                                                                   */
  /* ---------------------------------------------------------------------- */

  /**
   * §8.4: idempotent on `input.tierListItemId` when the caller passes one.
   * No outbox row delivers this method (and `forwardCtx` strips `delivery`
   * from onward calls), so there is no delivery key to fall back on: without
   * an id it mints a random one. Also
   * naturally idempotent on content — the same entry cannot sit twice in one
   * tier list (`unique_<type>_in_tier_list`), so a second `addItem` for an
   * entry already present is a `ConflictError`, not a silent duplicate.
   *
   * Position is `aggregate.items` filtered to the target band, `.length` —
   * read from the in-memory cache, never a `SELECT max(position)`, which is
   * what makes it race-free without a lock (§2.1: "no read-modify-write race").
   */
  async addItem(
    ctx: Ctx,
    input: AddTierListItemInput,
  ): Promise<TierListItemDto> {
    const aggregate = this.requireAggregate();
    await this.#requireCreator(ctx, aggregate, "add to this tier list");

    const band = input.band === undefined ? MIN_BAND : requireBand(input.band);
    // M7: a position names an index of a band, so it needs the band named
    // too — "position 2 of whatever the default is" is a caller's mistake.
    if (input.position !== undefined && input.band === undefined) {
      throw new ValidationError("a position needs its band");
    }
    const entry = requireEntry(input.entry);
    // X27: a place the viewer cannot see is a place that does not exist —
    // the same answer for a stranger's pending place as for an unknown id,
    // where the insert would otherwise succeed on one and fail its foreign
    // key on the other.
    if (
      entry.type === "PLACE" &&
      !(await placeIsVisible(this.db, ctx, entry.id))
    ) {
      throw new NotFoundError(`place ${entry.id} not found`);
    }
    const tierListItemId = requireUuid(
      input.tierListItemId ?? randomUUID(),
      "tierListItemId",
    );

    const existingById = aggregate.items.find(
      (row) => row.id === tierListItemId,
    );
    if (existingById !== undefined) return toItemDto(existingById);

    const alreadyPresent = aggregate.items.some((row) => {
      const ref = entryRefOf(row);
      return ref.type === entry.type && ref.id === entry.id;
    });
    if (alreadyPresent) {
      throw new ConflictError(
        `${entry.type} ${entry.id} is already in tier list ${this.key}`,
      );
    }

    // The band as it stands, top first. Without a position the entry goes on
    // the end (§2.1); with one (M7) it goes in at that index and every row at
    // or after it moves down one, in the same transaction and under the same
    // one `ADD` — so Undo (`planBandOrders`) takes it out and closes the gap,
    // and Redo puts it back at the recorded `position`.
    const bandOrder = bandOrderOf(aggregate.items, band);
    const position =
      input.position === undefined
        ? bandOrder.length
        : requirePosition(input.position, bandOrder.length);
    const createdAt = new Date();
    const notes = input.notes ?? null;

    await this.#recordedTx(async (tx) => {
      const inserted = await tx
        .insert(tierListItems)
        .values({
          id: tierListItemId,
          tierListId: this.key,
          band,
          position,
          notes,
          createdAt,
          updatedAt: createdAt,
          [entryProperty(entry.type)]: entry.id,
        })
        // Belt and braces for a redelivery racing itself, same as `CellarActor`.
        .onConflictDoNothing({ target: tierListItems.id })
        .returning({ id: tierListItems.id });
      if (inserted.length > 0) {
        // The rows from the insertion point down each move one slot lower —
        // only when the row really went in, so a redelivery that raced itself
        // leaves no gap.
        for (let i = position; i < bandOrder.length; i += 1) {
          const id = bandOrder[i];
          if (id === undefined) continue;
          await tx
            .update(tierListItems)
            .set({ position: i + 1, updatedAt: createdAt })
            .where(eq(tierListItems.id, id));
        }
        await this.#record(tx, ctx, {
          kind: "ADD",
          rows: [
            {
              id: tierListItemId,
              entry,
              band,
              position,
              notes,
              createdAt: createdAt.toISOString(),
            },
          ],
        });
      }
      await this.#bumpContentAndEnqueueInsights(tx, ctx);
    });
    await this.reload();
    return toItemDto(this.#requireItem(tierListItemId));
  }

  /**
   * X16's multi-add — see the contracts interface doc. One transaction, one
   * `ADD` history row holding every row added, so Undo takes them back
   * together. Idempotent on each `tierListItemId` like `addItem`: a retry
   * whose rows are already there reports them added again, not skipped.
   */
  async addItems(
    ctx: Ctx,
    inputs: readonly AddTierListItemInput[],
  ): Promise<AddTierListItemsResult> {
    const aggregate = this.requireAggregate();
    await this.#requireCreator(ctx, aggregate, "add to this tier list");
    if (inputs.length === 0) {
      throw new ValidationError("addItems needs at least one entry");
    }
    if (inputs.length > MAX_BATCH_ADD) {
      throw new ValidationError(
        `addItems takes at most ${MAX_BATCH_ADD} entries, got ${inputs.length}`,
      );
    }
    // M7's position is `addItem`'s alone: a batch appends each entry in the
    // order given, and an index into a band the batch is still growing would
    // mean nothing a caller could check.
    if (inputs.some((input) => input.position !== undefined)) {
      throw new ValidationError(
        "addItems appends; use addItem to put one entry at a position",
      );
    }
    const asked = inputs.map((input) => ({
      entry: requireEntry(input.entry),
      band: input.band === undefined ? MIN_BAND : requireBand(input.band),
      notes: input.notes ?? null,
      id: requireUuid(input.tierListItemId ?? randomUUID(), "tierListItemId"),
    }));
    // One id for two asks would record a row the insert's `ON CONFLICT DO
    // NOTHING` silently dropped, and report the first entry twice.
    if (new Set(asked.map((ask) => ask.id)).size !== asked.length) {
      throw new ValidationError("addItems names one tierListItemId twice");
    }

    const existingIds = new Set(aggregate.items.map((row) => row.id));
    const retried = asked.filter((ask) => existingIds.has(ask.id));
    const fresh = asked.filter((ask) => !existingIds.has(ask.id));

    // What can still be added: readable (an item that exists, a place this
    // viewer may see — X27), not on the list, and not asked for twice.
    const found = await resolveTierListEntries(
      this.db,
      fresh.map((ask) => ask.entry),
    );
    const hidden = await hiddenPlaceIds(
      this.db,
      ctx,
      fresh.flatMap((ask) =>
        ask.entry.type === "PLACE" ? [ask.entry.id] : [],
      ),
    );
    const onList = new Set(
      aggregate.items.map((row) => entryKey(entryRefOf(row))),
    );
    const addable = fresh.filter((ask) => {
      const key = entryKey(ask.entry);
      const readable =
        found.has(key) &&
        !(ask.entry.type === "PLACE" && hidden.has(ask.entry.id));
      if (!readable || onList.has(key)) return false;
      onList.add(key);
      return true;
    });
    const snapshots = appendedSnapshots(aggregate.items, addable);

    if (snapshots.length > 0) {
      await this.#recordedTx(async (tx) => {
        await this.#insertSnapshots(tx, snapshots);
        await this.#record(tx, ctx, { kind: "ADD", rows: snapshots });
        await this.#bumpContentAndEnqueueInsights(tx, ctx);
      });
      await this.reload();
    }

    const added = [...retried, ...addable].map((ask) =>
      toItemDto(this.#requireItem(ask.id)),
    );
    return { added, skipped: asked.length - added.length };
  }

  /**
   * X16: Add entry's sections — creator only (`[]` for anyone else who may
   * see the list), for the list's own type, none of them on it already.
   */
  async addSuggestions(ctx: Ctx): Promise<readonly TierListSuggestionDto[]> {
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);
    if (!isOwner(ctx, aggregate.tierList.createdById)) return [];
    const type = entryTypeOfListType(aggregate.tierList.listType);
    if (type === null) return [];
    const scope = viewerScopeOf(await visibilityScope(this.db, ctx));
    if (scope === null) return [];
    const onList = aggregate.items
      .map(entryRefOf)
      .filter((ref) => ref.type === type)
      .map((ref) => ref.id);
    return await addSuggestionsFor(this.db, scope, type, onList);
  }

  /**
   * X16: "Try this next" for the viewer — anyone who may see the list and is
   * signed in; seeded from what they may see of it. See `tryNextFor`.
   */
  async tryNext(
    ctx: Ctx,
    limit?: number | null,
  ): Promise<readonly TierListTryNextDto[]> {
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);
    const n = limit ?? TRY_NEXT_LIMIT;
    if (!Number.isInteger(n) || n < 1 || n > TRY_NEXT_LIMIT * 2) {
      throw new ValidationError(
        `limit must be an integer between 1 and ${TRY_NEXT_LIMIT * 2}`,
      );
    }
    const type = entryTypeOfListType(aggregate.tierList.listType);
    if (type === null) return [];
    const scope = viewerScopeOf(await visibilityScope(this.db, ctx));
    if (scope === null) return [];
    const entries = (await this.#visibleItems(ctx, aggregate)).map((row) => ({
      entry: entryRefOf(row),
      band: row.band,
      position: row.position,
    }));
    return await tryNextFor(this.db, scope, type, entries, n);
  }

  /** Inserts recorded rows as they are (ids, bands, positions). */
  async #insertSnapshots(
    tx: DbOrTx,
    snapshots: readonly EntrySnapshot[],
  ): Promise<void> {
    for (const snapshot of snapshots) {
      const createdAt =
        snapshot.createdAt === null ? new Date() : new Date(snapshot.createdAt);
      await tx
        .insert(tierListItems)
        .values({
          id: snapshot.id,
          tierListId: this.key,
          band: snapshot.band,
          position: snapshot.position,
          notes: snapshot.notes,
          createdAt,
          updatedAt: createdAt,
          [entryProperty(snapshot.entry.type)]: snapshot.entry.id,
        })
        .onConflictDoNothing({ target: tierListItems.id });
    }
  }

  /**
   * Deletes the row, then renumbers whatever remains in its band to clean
   * `0..n-1` — in the same transaction, so the "positions are always clean
   * sequential" invariant holds between calls, not just immediately after a
   * `reorderBand`.
   */
  async removeItem(
    ctx: Ctx,
    requestedItemId: string,
  ): Promise<RemovedTierListItem> {
    const aggregate = this.requireAggregate();
    await this.#requireCreator(ctx, aggregate, "remove from this tier list");
    const item = this.#requireItem(requestedItemId);
    const tierListItemId = item.id;

    const remaining = aggregate.items
      .filter((row) => row.band === item.band && row.id !== tierListItemId)
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((row) => row.id);

    await this.#recordedTx(async (tx) => {
      await tx
        .delete(tierListItems)
        .where(eq(tierListItems.id, tierListItemId));
      await this.#writePositions(tx, item.band, remaining);
      await this.#record(tx, ctx, {
        kind: "REMOVE",
        rows: [snapshotOf(item)],
      });
      await this.#bumpContentAndEnqueueInsights(tx, ctx);
    });
    await this.reload();
    return { id: tierListItemId };
  }

  /**
   * One transaction. See the class doc and the contracts interface doc for
   * the full contract; in short: `orderedIds` becomes `band`'s exact
   * membership and order, every id currently in `band` must be accounted
   * for, and any band that loses a member to this move is renumbered too.
   */
  async reorderBand(
    ctx: Ctx,
    band: number,
    orderedIds: readonly string[],
  ): Promise<readonly TierListItemDto[]> {
    const aggregate = this.requireAggregate();
    await this.#requireCreator(ctx, aggregate, "reorder this tier list");
    const targetBand = requireBand(band);

    const ids = orderedIds.map((id) => requireUuid(id, "orderedIds[]"));
    if (ids.length === 0) {
      throw new ValidationError("orderedIds must not be empty");
    }
    if (new Set(ids).size !== ids.length) {
      throw new ValidationError("orderedIds must not contain duplicates");
    }

    const byId = new Map(aggregate.items.map((row) => [row.id, row]));
    for (const id of ids) {
      if (!byId.has(id)) {
        throw new NotFoundError(
          `tier_list_item ${id} is not in tier list ${this.key}`,
        );
      }
    }

    const currentInTarget = aggregate.items
      .filter((row) => row.band === targetBand)
      .map((row) => row.id);
    const missing = currentInTarget.filter((id) => !ids.includes(id));
    if (missing.length > 0) {
      throw new ValidationError(
        `orderedIds is missing ${missing.length} item(s) currently in band ` +
          `${targetBand} (${missing.join(", ")}); reorderBand must fully ` +
          "describe the band, not drop items by omission — use removeItem " +
          "to take an item out of the tier list entirely",
      );
    }

    const movedIds = new Set(
      ids.filter(
        (id) => mustGet(byId, id, "tier_list_item").band !== targetBand,
      ),
    );
    const sourceBands = new Set(
      [...movedIds].map((id) => mustGet(byId, id, "tier_list_item").band),
    );

    // D4: the touched bands, before and after, are the MOVE's snapshot.
    const before: Record<string, string[]> = {
      [String(targetBand)]: currentInTarget,
    };
    const after: Record<string, string[]> = { [String(targetBand)]: [...ids] };

    await this.#recordedTx(async (tx) => {
      let moved = await this.#writePositions(tx, targetBand, ids, byId);
      for (const sourceBand of sourceBands) {
        const remaining = aggregate.items
          .filter((row) => row.band === sourceBand && !movedIds.has(row.id))
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((row) => row.id);
        before[String(sourceBand)] = bandOrderOf(aggregate.items, sourceBand);
        after[String(sourceBand)] = remaining;
        moved += await this.#writePositions(tx, sourceBand, remaining, byId);
      }
      // A reorder that reorders nothing is not a content change (see the class
      // doc, "A no-op reorder is not a content change"). `#writePositions`
      // already knows — it skips every row that is where it belongs — so the
      // count it returns is exactly "did anything move". Nor is it an edit
      // worth an Undo.
      if (moved > 0) {
        await this.#record(tx, ctx, {
          kind: "MOVE",
          before,
          after,
          subject: subjectOf(before, after, byId),
        });
        await this.#bumpContentAndEnqueueInsights(tx, ctx);
      }
    });
    await this.reload();

    return this.requireAggregate()
      .items.filter((row) => row.band === targetBand)
      .map(toItemDto);
  }

  /* ---------------------------------------------------------------------- */
  /* Edit history (D4)                                                       */
  /* ---------------------------------------------------------------------- */

  /**
   * Creator only, and `null` (not a refusal) for anyone else who may see the
   * list: a friend's page simply has no Undo. Invisible → `NotFound`.
   */
  async editHistory(ctx: Ctx): Promise<TierListEditHistoryDto | null> {
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);
    if (!isOwner(ctx, aggregate.tierList.createdById)) return null;
    return await this.#describeHistory(aggregate);
  }

  async undo(
    ctx: Ctx,
    expectedSeq: number,
  ): Promise<TierListHistoryStepResult> {
    return await this.#step(ctx, "UNDO", expectedSeq);
  }

  async redo(
    ctx: Ctx,
    expectedSeq: number,
  ): Promise<TierListHistoryStepResult> {
    return await this.#step(ctx, "REDO", expectedSeq);
  }

  /**
   * One Undo or Redo: the edit on top of the matching stack, applied
   * backwards (Undo) or forwards (Redo), and a new log row saying so — one
   * transaction, with the content bump every edit makes.
   *
   * Applying is forgiving by design (`planBandOrders`): an entry that is no
   * longer on the list is skipped, one already back is left alone, and every
   * touched band ends at clean `0..n-1`. The step is recorded either way, so
   * the stacks always advance — a history that refused to move past one
   * stale edit would strand every edit beneath it.
   *
   * **Only the edit the caller names** (wave B hardening): `expectedSeq` must
   * be the edit on top of the stack. The history is per list, not per tab,
   * so a tab that read it an hour ago and then pressed Undo used to take back
   * whatever was newest — possibly an edit made since on another device,
   * which that tab never showed. A mismatch writes nothing and says why
   * (`TIER_LIST_HISTORY_MOVED`). The stack is read from this activation's
   * aggregate, which every edit reloads in the same turn, so the comparison
   * and the write cannot interleave with another edit (one turn at a time).
   */
  async #step(
    ctx: Ctx,
    direction: "UNDO" | "REDO",
    expectedSeq: number,
  ): Promise<TierListHistoryStepResult> {
    const aggregate = this.requireAggregate();
    const what = direction === "UNDO" ? "undo" : "redo";
    await this.#requireCreator(ctx, aggregate, `${what} edits to this list`);
    if (!Number.isSafeInteger(expectedSeq) || expectedSeq < 1) {
      throw new ValidationError(
        `expectedSeq must be the seq of the edit to ${what} (an integer from 1)`,
      );
    }

    const stacks = historyStacks(aggregate.history);
    const stack = direction === "UNDO" ? stacks.undo : stacks.redo;
    const targetSeq = stack[stack.length - 1];
    if (targetSeq === undefined) {
      throw new ConflictError(
        `there is nothing to ${what} on this list (expected edit ` +
          `${String(expectedSeq)}); it changed since it was read`,
        "TIER_LIST_HISTORY_MOVED",
      );
    }
    if (targetSeq !== expectedSeq) {
      throw new ConflictError(
        `the edit to ${what} on this list is ${String(targetSeq)}, not ` +
          `${String(expectedSeq)}; it changed since it was read`,
        "TIER_LIST_HISTORY_MOVED",
      );
    }
    const [target] = await this.#historyRows([targetSeq]);
    if (target === undefined) {
      throw new ConflictError(`history row ${targetSeq} vanished mid-turn`);
    }
    // Described before the write, so nothing can fail after it commits. A
    // row whose snapshot no longer parses still advances the stacks (below)
    // and is named only by its kind.
    const [described] = await this.#describeEdits([target]);
    const applied: TierListEditDto = described ?? {
      seq: target.seq,
      kind: isEditKind(target.kind) ? target.kind : "MOVE",
      entry: null,
      entryName: null,
      fromBand: null,
      toBand: null,
      entryCount: 0,
      at: target.createdAt.toISOString(),
    };
    const change = parseChange(target.kind, target.change);

    await this.#recordedTx(async (tx) => {
      if (change !== null) {
        await this.#apply(tx, change, direction === "UNDO" ? "back" : "forth");
      }
      await this.#insertHistory(tx, ctx, {
        kind: direction,
        targetSeq,
        change: {},
      });
      await this.#bumpContentAndEnqueueInsights(tx, ctx);
    });
    await this.reload();

    return {
      applied,
      history: await this.#describeHistory(this.requireAggregate()),
    };
  }

  /**
   * One edit, backwards or forwards. ADD forwards and REMOVE backwards put a
   * row back; the other two take it out; a MOVE writes the touched bands'
   * `before` or `after` orders.
   */
  async #apply(
    tx: DbOrTx,
    change: EditChange,
    way: "back" | "forth",
  ): Promise<void> {
    if (change.kind === "MOVE") {
      await this.#writeOrders(
        tx,
        planBandOrders(
          this.requireAggregate().items,
          way === "back" ? change.before : change.after,
        ),
      );
      return;
    }
    const putBack =
      (change.kind === "ADD" && way === "forth") ||
      (change.kind === "REMOVE" && way === "back");
    if (putBack) await this.#putBack(tx, change.rows);
    else
      await this.#takeOut(
        tx,
        change.rows.map((row) => row.id),
      );
  }

  /** Removes those rows still there, and closes their bands' gaps. */
  async #takeOut(
    tx: DbOrTx,
    tierListItemIds: readonly string[],
  ): Promise<void> {
    const items = this.requireAggregate().items;
    const wanted = new Set(tierListItemIds);
    const rows = items.filter((item) => wanted.has(item.id));
    if (rows.length === 0) return;
    await tx.delete(tierListItems).where(
      inArray(
        tierListItems.id,
        rows.map((row) => row.id),
      ),
    );
    const rest = items.filter((item) => !wanted.has(item.id));
    const bands = [...new Set(rows.map((row) => row.band))];
    await this.#writeOrders(
      tx,
      new Map(bands.map((band) => [band, bandOrderOf(rest, band)])),
      rest,
    );
  }

  /**
   * Re-inserts recorded rows under their own ids, each at its recorded band
   * and position (clamped to the band's length by then), in the order
   * recorded. A row is skipped when it, or the same entry under another id,
   * is already on the list, or when what it ranked can no longer be read.
   */
  async #putBack(
    tx: DbOrTx,
    snapshots: readonly EntrySnapshot[],
  ): Promise<void> {
    const items = this.requireAggregate().items;
    const known: { id: string; band: number; position: number }[] = [...items];
    const present = new Set(items.map((row) => entryKey(entryRefOf(row))));
    const ids = new Set(items.map((row) => row.id));
    const found = await resolveTierListEntries(
      tx,
      snapshots.map((snapshot) => snapshot.entry),
    );
    const orders = new Map<number, string[]>();
    for (const snapshot of snapshots) {
      const key = entryKey(snapshot.entry);
      if (ids.has(snapshot.id) || present.has(key) || !found.has(key)) {
        continue;
      }
      const order = insertAt(
        orders.get(snapshot.band) ?? bandOrderOf(known, snapshot.band),
        snapshot.id,
        snapshot.position,
      );
      const position = order.indexOf(snapshot.id);
      const createdAt =
        snapshot.createdAt === null ? new Date() : new Date(snapshot.createdAt);
      await tx
        .insert(tierListItems)
        .values({
          id: snapshot.id,
          tierListId: this.key,
          band: snapshot.band,
          position,
          notes: snapshot.notes,
          createdAt,
          updatedAt: new Date(),
          [entryProperty(snapshot.entry.type)]: snapshot.entry.id,
        })
        .onConflictDoNothing({ target: tierListItems.id });
      orders.set(snapshot.band, order);
      known.push({ id: snapshot.id, band: snapshot.band, position });
      ids.add(snapshot.id);
      present.add(key);
    }
    if (orders.size > 0) await this.#writeOrders(tx, orders, known);
  }

  /**
   * Writes each band's complete order as `0..n-1`, skipping rows already
   * where they belong. `known` is where each row stands now (the cached
   * aggregate unless the caller has just inserted or deleted one).
   */
  async #writeOrders(
    tx: DbOrTx,
    orders: ReadonlyMap<number, readonly string[]>,
    known: readonly {
      id: string;
      band: number;
      position: number;
    }[] = this.requireAggregate().items,
  ): Promise<void> {
    const index = new Map(known.map((row) => [row.id, row]));
    for (const [band, ids] of orders) {
      for (const [position, id] of ids.entries()) {
        const current = index.get(id);
        if (current?.band === band && current.position === position) continue;
        await tx
          .update(tierListItems)
          .set({ band, position, updatedAt: new Date() })
          .where(
            and(
              eq(tierListItems.id, id),
              eq(tierListItems.tierListId, this.key),
            ),
          );
      }
    }
  }

  /**
   * `tx` for every write that appends to the history. A stale cache's write
   * is refused whole by the `seq` key; without a reload it would stay stale
   * and refuse every later edit until the activation went idle, so the cache
   * is rebuilt and the caller gets a retryable conflict — the next attempt
   * runs against the list as it is.
   */
  async #recordedTx(fn: (tx: DbOrTx) => Promise<void>): Promise<void> {
    try {
      await this.tx(fn);
    } catch (error) {
      if (!isStaleHistoryWrite(error)) throw error;
      await this.reload();
      throw new ConflictError("This list changed somewhere else. Try again.");
    }
  }

  /** Appends one edit to the log, at the next `seq`. */
  async #record(tx: DbOrTx, ctx: Ctx, change: EditChange): Promise<void> {
    await this.#insertHistory(tx, ctx, {
      kind: change.kind,
      targetSeq: null,
      change,
    });
  }

  async #insertHistory(
    tx: DbOrTx,
    ctx: Ctx,
    row: {
      kind: string;
      targetSeq: number | null;
      change: EditChange | Record<string, never>;
    },
  ): Promise<void> {
    const { lastSeq } = historyStacks(this.requireAggregate().history);
    await tx.insert(tierListHistory).values({
      tierListId: this.key,
      seq: lastSeq + 1,
      kind: row.kind,
      targetSeq: row.targetSeq,
      change: row.change,
      userId: ctx.viewerId,
    });
  }

  async #historyRows(seqs: readonly number[]): Promise<
    readonly {
      seq: number;
      kind: string;
      change: unknown;
      createdAt: Date;
    }[]
  > {
    if (seqs.length === 0) return [];
    return await this.db
      .select({
        seq: tierListHistory.seq,
        kind: tierListHistory.kind,
        change: tierListHistory.change,
        createdAt: tierListHistory.createdAt,
      })
      .from(tierListHistory)
      .where(
        and(
          eq(tierListHistory.tierListId, this.key),
          inArray(tierListHistory.seq, [...seqs]),
        ),
      );
  }

  async #describeHistory(
    aggregate: TierListAggregate,
  ): Promise<TierListEditHistoryDto> {
    const stacks = historyStacks(aggregate.history);
    const undoSeq = stacks.undo[stacks.undo.length - 1];
    const redoSeq = stacks.redo[stacks.redo.length - 1];
    const wanted = [undoSeq, redoSeq].filter(
      (seq): seq is number => seq !== undefined,
    );
    const edits = await this.#describeEdits(await this.#historyRows(wanted));
    const bySeq = new Map(edits.map((edit) => [edit.seq, edit]));
    return {
      editCount: stacks.editCount,
      undo: undoSeq === undefined ? null : (bySeq.get(undoSeq) ?? null),
      redo: redoSeq === undefined ? null : (bySeq.get(redoSeq) ?? null),
    };
  }

  /**
   * Edit rows as a person reads them, the entries' names read now (one
   * batched read per entry type, as the insights path does).
   */
  async #describeEdits(
    rows: readonly {
      seq: number;
      kind: string;
      change: unknown;
      createdAt: Date;
    }[],
  ): Promise<TierListEditDto[]> {
    const parsed = rows.flatMap((row) => {
      const change = parseChange(row.kind, row.change);
      return change === null ? [] : [{ row, change }];
    });
    // A row whose snapshot no longer parses is still a step on the stack: it
    // is described by its seq and kind alone, so `editHistory` can name it —
    // Undo and Redo take an `expectedSeq`, and a step the page cannot name is
    // a step it could never take (`#step` steps past it, applying nothing).
    const unparsed = new Map(
      rows
        .filter((row) => parseChange(row.kind, row.change) === null)
        .map((row): [number, TierListEditDto] => [
          row.seq,
          {
            seq: row.seq,
            kind: isEditKind(row.kind) ? row.kind : "MOVE",
            entry: null,
            entryName: null,
            fromBand: null,
            toBand: null,
            entryCount: 0,
            at: row.createdAt.toISOString(),
          },
        ]),
    );
    const soleEntry = (change: EditChange): TierListEntryRef | null =>
      change.kind === "MOVE"
        ? (change.subject?.entry ?? null)
        : change.rows.length === 1
          ? (change.rows[0]?.entry ?? null)
          : null;
    const refs = parsed.flatMap(({ change }) => {
      const ref = soleEntry(change);
      return ref === null ? [] : [ref];
    });
    const names =
      refs.length === 0
        ? new Map()
        : await resolveTierListEntries(this.db, refs);
    const described = parsed.map(({ row, change }): TierListEditDto => {
      const entry = soleEntry(change);
      const name =
        entry === null ? null : (names.get(entryKey(entry))?.name ?? null);
      const at = row.createdAt.toISOString();
      if (change.kind === "MOVE") {
        return {
          seq: row.seq,
          kind: "MOVE",
          entry,
          entryName: name,
          fromBand: change.subject?.fromBand ?? null,
          toBand: change.subject?.toBand ?? null,
          entryCount:
            change.subject === null
              ? movedCount(change.before, change.after)
              : 1,
          at,
        };
      }
      // A multi-add names one band only when every row went to it.
      const bands = new Set(change.rows.map((snapshot) => snapshot.band));
      const band = bands.size === 1 ? (change.rows[0]?.band ?? null) : null;
      return {
        seq: row.seq,
        kind: change.kind,
        entry,
        entryName: name,
        fromBand: change.kind === "REMOVE" ? band : null,
        toBand: change.kind === "ADD" ? band : null,
        entryCount: change.rows.length,
        at,
      };
    });
    return [...described, ...unparsed.values()].sort((a, b) => a.seq - b.seq);
  }

  /**
   * SV-A (L12): the open-time trigger. See the contract's doc.
   *
   * Creator only, checked before anything is read off the list. Then it asks
   * only when `insightsStatus` reads `IDLE` — enough entries, a provider, no
   * insights yet, nothing pending or failed — so it is idempotent by status:
   * the bump to `insightsRequestedAt` turns the next read `PENDING`, and
   * `enqueueOutboxOnce` keeps one live row whatever races it. A FAILED list
   * (a budget refusal included) is not re-asked here; the next edit or the
   * stored retry does that, as before.
   */
  async requestInsights(ctx: Ctx): Promise<TierListDto> {
    const aggregate = this.requireAggregate();
    await this.#requireCreator(ctx, aggregate, "ask for insights on");
    if (this.#insightsStatus(ctx, aggregate).insightsStatus !== "IDLE") {
      return await this.#dtoFor(ctx, aggregate);
    }
    await this.tx(async (tx) => {
      await tx
        .update(tierLists)
        .set({ insightsRequestedAt: new Date() })
        .where(eq(tierLists.id, this.key));
      await enqueueOutboxOnce(
        tx,
        OUTBOX_TARGETS["TierListActor.generateInsights"],
        { targetId: this.key, payload: {} },
        // Attributed to the owner: the generation's reservation is booked to
        // them, which is what makes it count against their allowance.
        { attributeTo: ctx },
      );
    });
    await this.reload();
    return await this.#dtoFor(ctx, this.requireAggregate());
  }

  /**
   * F-86: "Rewrite" — a fresh write of insights that are already READY. See
   * the contract's doc. Creator only, like `requestInsights`; a no-op from
   * any status but READY. The delivery carries `{ rewrite: true }`, which is
   * the one thing that lets `generateInsights` past its once-a-day throttle;
   * the generation is attributed to the caller, so their
   * `ai_model/tier_list_insights` allowance is what bounds how often.
   *
   * A refresh already queued (an edit waiting out the throttle) becomes the
   * rewrite, due now, rather than a second row beside it.
   */
  async rewriteInsights(ctx: Ctx): Promise<TierListDto> {
    const aggregate = this.requireAggregate();
    await this.#requireCreator(ctx, aggregate, "rewrite the insights on");
    if (this.#insightsStatus(ctx, aggregate).insightsStatus !== "READY") {
      return await this.#dtoFor(ctx, aggregate);
    }
    const target = OUTBOX_TARGETS["TierListActor.generateInsights"];
    const payload = { rewrite: true } as const;
    await this.tx(async (tx) => {
      await tx
        .update(tierLists)
        .set({ insightsRequestedAt: new Date() })
        .where(eq(tierLists.id, this.key));
      const queued = await tx.execute<{ id: string }>(sql`
        update public.outbox
        set payload = ${JSON.stringify(payload)}::jsonb, run_after = now()
        where target_actor = ${target.actorType}
          and target_id = ${this.key}
          and method = ${target.method}
          and status = 'pending'
        returning id
      `);
      if (queued.rows.length === 0) {
        await enqueueOutboxOnce(
          tx,
          target,
          { targetId: this.key, payload },
          { attributeTo: ctx },
        );
      }
    });
    await this.reload();
    return await this.#dtoFor(ctx, this.requireAggregate());
  }

  /**
   * `system`, via the outbox (§1.7-style split: this method exists only to be
   * *delivered*, never called directly by a request). Idempotent by
   * recomputation — see the class doc.
   */
  async generateInsights(
    ctx: Ctx,
    payload: Record<string, unknown> = {},
  ): Promise<GenerateInsightsResult> {
    // The one outbox-delivered method. `system` is constructed only by
    // `OutboxActor` and job actors (§1.6); an administrator is the manual
    // repair path for a dead-lettered delivery, same as `UserActor`'s. The
    // caller goes first, so a real private id and a made-up one answer an
    // ordinary caller the same way.
    const aggregate = this.requirePrivilegedAggregate(
      ctx,
      "TierListActor.generateInsights is delivered by the outbox; a request " +
        "may never call it directly",
    );

    if (aggregate.items.length < MIN_ITEMS_FOR_INSIGHTS) {
      return {
        tierListId: this.key,
        skipped: true,
        reason: `fewer than ${MIN_ITEMS_FOR_INSIGHTS} items`,
      };
    }
    const generatedAt = aggregate.tierList.insightsGeneratedAt;
    // F-86: a `rewriteInsights` delivery is the owner asking for a fresh
    // write now; their model allowance, not the daily throttle, bounds it.
    const rewrite = payload.rewrite === true;
    if (
      !rewrite &&
      generatedAt !== null &&
      Date.now() - generatedAt.getTime() < INSIGHTS_THROTTLE_MS
    ) {
      // Only a list that changed since its insights is worth a refresh; a
      // redelivery with nothing new must not schedule a daily regeneration.
      if (aggregate.tierList.contentUpdatedAt > generatedAt) {
        await this.#deferThrottled(ctx, generatedAt);
      }
      return { tierListId: this.key, skipped: true, reason: "throttled" };
    }

    let insights: Record<string, unknown>;
    try {
      insights = await this.#generateInsights(ctx, {
        tierListId: this.key,
        name: aggregate.tierList.name,
        description: aggregate.tierList.description,
        listType: aggregate.tierList.listType,
        entries: await this.#describeEntries(aggregate.items),
      });
    } catch (error) {
      // N07: write the failure down where the read can see it — its class,
      // reason and retry time — then fail the delivery exactly as before, so
      // the outbox's retry schedule is unchanged.
      await this.#recordInsightsFailure(error);
      throw error;
    }

    await this.tx(async (tx) => {
      await tx
        .update(tierLists)
        .set({
          aiInsights: insights,
          insightsGeneratedAt: new Date(),
          insightsFailure: null,
          insightsFailedAt: null,
          insightsRetryAt: null,
          updatedAt: new Date(),
        })
        .where(eq(tierLists.id, this.key));
    });
    await this.reload();
    return { tierListId: this.key, skipped: false, reason: "generated" };
  }

  /**
   * A change inside the once-a-day throttle used to be dropped: the delivery
   * answered "throttled" and nothing ever asked again, while the panel said
   * "Updated insights will generate automatically". Now the throttled
   * delivery queues the refresh for the moment the throttle lifts —
   * `enqueueOutboxOnce`, so a burst of changes still leaves one row — and
   * records that moment, which the read reports as `PENDING` until then.
   */
  async #deferThrottled(ctx: Ctx, generatedAt: Date): Promise<void> {
    const runAt = new Date(generatedAt.getTime() + INSIGHTS_THROTTLE_MS);
    await this.tx(async (tx) => {
      await enqueueOutboxOnce(
        tx,
        OUTBOX_TARGETS["TierListActor.generateInsights"],
        {
          targetId: this.key,
          payload: {},
          // A minute's floor: the throttle is judged on this host's clock and
          // the delay on the database's, so a delivery that fires a moment
          // early must not re-defer itself in a tight loop.
          delayMs: Math.max(60_000, runAt.getTime() - Date.now()),
        },
        { attributeTo: ctx },
      );
      await tx
        .update(tierLists)
        .set({ insightsRetryAt: runAt })
        .where(eq(tierLists.id, this.key));
    });
    await this.reload();
  }

  /**
   * The failed attempt, as `insightsStatus` will read it: a stored failure
   * (`CODE[REASON]: message`, so the reason survives), when, and the
   * refusal's `retryAt` when it had one (a budget window).
   */
  async #recordInsightsFailure(error: unknown): Promise<void> {
    const retryAt =
      isActorError(error) && error.retryAt !== null
        ? new Date(error.retryAt)
        : null;
    await this.tx(async (tx) => {
      await tx
        .update(tierLists)
        .set({
          insightsFailure: formatStoredFailure(error),
          insightsFailedAt: new Date(),
          insightsRetryAt: retryAt,
        })
        .where(eq(tierLists.id, this.key));
    });
    await this.reload();
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * The aggregate's rows, each joined to what it actually points at (B7b).
   *
   * Another §1.1 FK read, like the friendship read in `canSee` — batched to one
   * statement per entry type present, and issued only on the insights path, so
   * `get`/`items` still serve straight from the activation cache with no extra
   * query. An entry whose row could not be read keeps its band, position and
   * notes and carries nulls for the rest; `requireGroundedEntries` in the seam
   * decides whether what survived is enough to ask a model about.
   */
  async #describeEntries(
    rows: readonly TierListItemRow[],
  ): Promise<readonly TierListInsightsEntry[]> {
    const refs = rows.map(entryRefOf);
    const descriptors = await resolveTierListEntries(this.db, refs);
    return rows.map((row, index) => {
      const ref = refs[index] ?? entryRefOf(row);
      const found = descriptors.get(entryKey(ref));
      return {
        ref,
        name: found?.name ?? null,
        attributes: found?.attributes ?? [],
        location: found?.location ?? null,
        summary: found?.summary ?? null,
        publicRating: found?.publicRating ?? null,
        publicRatingCount: found?.publicRatingCount ?? null,
        priceLevel: found?.priceLevel ?? null,
        band: row.band,
        position: row.position,
        notes: row.notes,
      };
    });
  }

  /**
   * The four-branch rule (`packages/policy`), with the friendship read — of
   * `UserActor`'s table, fresh per turn — done by `../lib/visibility.ts`. The
   * base class's `requireVisible` / `requireAllowed` turn a "no" into
   * `NotFound`: absence and denial are indistinguishable.
   */
  protected override async canSee(
    ctx: Ctx,
    aggregate: TierListAggregate,
  ): Promise<boolean> {
    return canSeeTierList(
      ctx,
      await tierListVisibility(this.db, ctx, aggregate.tierList),
    );
  }

  /** Creator only — no co-owner concept exists for tier lists (module doc). */
  async #requireCreator(
    ctx: Ctx,
    aggregate: TierListAggregate,
    what: string,
  ): Promise<void> {
    await this.requireAllowed(
      ctx,
      isOwner(ctx, aggregate.tierList.createdById),
      `tier list ${this.key} is not yours to ${what}`,
      aggregate,
    );
  }

  /**
   * Case-insensitive, like `CellarActor.#requireItem`: the cached ids are
   * Postgres's lowercase spelling, and an uppercase copy names the same row.
   * Callers use the row's own `id` afterwards.
   */
  #requireItem(tierListItemId: string): TierListItemRow {
    const wanted = String(tierListItemId).toLowerCase();
    const item = this.requireAggregate().items.find((row) => row.id === wanted);
    if (item === undefined) {
      throw new NotFoundError(
        `tier_list_item ${tierListItemId} is not in tier list ${this.key}`,
      );
    }
    return item;
  }

  async #bumpContentAndEnqueueInsights(tx: DbOrTx, ctx: Ctx): Promise<void> {
    // `insightsRequestedAt` is what `insightsStatus` reads as "asked for and
    // not yet answered" (N07). Bumped only when the list is long enough for a
    // generation to run, so a two-entry list never reads as pending.
    const now = new Date();
    const enough = (await this.#itemCount(tx)) >= MIN_ITEMS_FOR_INSIGHTS;
    await tx
      .update(tierLists)
      .set({
        contentUpdatedAt: now,
        ...(enough ? { insightsRequestedAt: now } : {}),
      })
      .where(eq(tierLists.id, this.key));
    // `enqueueOutboxOnce`, not `enqueueOutbox`: at most one live row per tier
    // list. See the class doc, "Bounding what one request can enqueue".
    await enqueueOutboxOnce(
      tx,
      OUTBOX_TARGETS["TierListActor.generateInsights"],
      {
        targetId: this.key,
        payload: {},
      },
      { attributeTo: ctx },
    );
  }

  /**
   * Assigns `0..n-1` to `ids` (in order) within `band`, skipping any row
   * already at its target `(band, position)` — cheap, and it keeps a
   * `reorderBand` call's write set exactly the rows that actually moved.
   * `originalById` defaults to the current aggregate's index, since every
   * caller already has one handy except `removeItem`, which does not need it
   * (its `ids` never include a cross-band move).
   *
   * **Returns how many rows it wrote**, which is what makes the skip above
   * observable to the caller. `reorderBand` needs it to tell a real reorder
   * from a no-op; the skip itself is not new, only the fact that anybody can
   * now ask about it.
   */
  async #writePositions(
    tx: DbOrTx,
    band: number,
    ids: readonly string[],
    originalById?: ReadonlyMap<string, TierListItemRow>,
  ): Promise<number> {
    const index =
      originalById ??
      new Map(this.requireAggregate().items.map((row) => [row.id, row]));
    let written = 0;
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      if (id === undefined) continue;
      const current = mustGet(index, id, "tier_list_item");
      if (current.band === band && current.position === i) continue;
      await tx
        .update(tierListItems)
        .set({ band, position: i, updatedAt: new Date() })
        .where(eq(tierListItems.id, id));
      written += 1;
    }
    return written;
  }

  /** N07: see `lib/tier-list-insights-status.ts` for the rule. */
  #insightsStatus(
    ctx: Ctx,
    aggregate: TierListAggregate,
  ): Pick<
    TierListDto,
    "insightsStatus" | "insightsFailureReason" | "insightsRetryAt"
  > {
    const row = aggregate.tierList;
    const status = tierListInsightsStatus({
      itemCount: aggregate.items.length,
      minimumItems: MIN_ITEMS_FOR_INSIGHTS,
      hasInsights: row.aiInsights !== null,
      aiAvailable: aiCapabilities().tierListInsights,
      requestedAt: row.insightsRequestedAt,
      generatedAt: row.insightsGeneratedAt,
      failedAt: row.insightsFailedAt,
      failure: row.insightsFailure,
      retryAt: row.insightsRetryAt,
      throttleMs: INSIGHTS_THROTTLE_MS,
      now: new Date(),
    });
    // A per-user limit is the creator's own allowance (generation is
    // attributed to them), and its retryAt is a reading of their usage
    // window. Anyone else who can see the list learns only that the attempt
    // failed — and is never told "you've reached your limit" for someone
    // else's.
    if (status.failureReason === "USER_CAP" && !isOwner(ctx, row.createdById)) {
      return {
        insightsStatus: status.status,
        insightsFailureReason: null,
        insightsRetryAt: null,
      };
    }
    return {
      insightsStatus: status.status,
      insightsFailureReason: status.failureReason,
      insightsRetryAt: status.retryAt,
    };
  }

  /**
   * The list's entry count as of this transaction — the write that called
   * `#bumpContentAndEnqueueInsights` has already added or removed its row,
   * which the cached aggregate does not yet show.
   */
  async #itemCount(tx: DbOrTx): Promise<number> {
    const [row] = await tx
      .select({ count: sql<string>`count(*)` })
      .from(tierListItems)
      .where(eq(tierListItems.tierListId, this.key));
    return Number(row?.count ?? 0);
  }

  /**
   * The entries `ctx` may see (X27): an entry for a place still under review
   * is its creator's alone, so for anyone else it is not on the list — not in
   * `items`, and not in `itemCount` either, or "5 entries" over four rows
   * would say a hidden place is there. Read fresh: `places` is not ours to
   * cache.
   */
  async #visibleItems(
    ctx: Ctx,
    aggregate: TierListAggregate,
  ): Promise<TierListAggregate["items"]> {
    const hidden = await hiddenPlaceIds(
      this.db,
      ctx,
      aggregate.items.flatMap((row) =>
        row.placeId === null ? [] : [row.placeId],
      ),
    );
    return hidden.size === 0
      ? aggregate.items
      : aggregate.items.filter(
          (row) => row.placeId === null || !hidden.has(row.placeId),
        );
  }

  /** {@link #toDto}, with `itemCount` as `ctx` may read it. */
  async #dtoFor(ctx: Ctx, aggregate: TierListAggregate): Promise<TierListDto> {
    const visible = await this.#visibleItems(ctx, aggregate);
    return {
      ...this.#toDto(ctx, aggregate),
      itemCount: visible.length,
      bandCounts: bandCountsOf(visible),
    };
  }

  #toDto(ctx: Ctx, aggregate: TierListAggregate): TierListDto {
    return {
      id: aggregate.tierList.id,
      name: aggregate.tierList.name,
      description: aggregate.tierList.description,
      createdById: aggregate.tierList.createdById,
      privacy: aggregate.tierList.privacy,
      listType: aggregate.tierList.listType,
      itemCount: aggregate.items.length,
      bandCounts: bandCountsOf(aggregate.items),
      aiInsights:
        (aggregate.tierList.aiInsights as Record<string, unknown> | null) ??
        null,
      insightsGeneratedAt: iso(aggregate.tierList.insightsGeneratedAt),
      contentUpdatedAt: requiredIso(aggregate.tierList.contentUpdatedAt),
      ...this.#insightsStatus(ctx, aggregate),
      createdAt: iso(aggregate.tierList.createdAt),
      updatedAt: iso(aggregate.tierList.updatedAt),
    };
  }
}
