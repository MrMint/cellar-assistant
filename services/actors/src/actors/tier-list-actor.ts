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
 * invariant this method exists to guarantee.
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
  CreateTierListInput,
  Ctx,
  DeletedTierList,
  GenerateInsightsResult,
  Page,
  PageArgs,
  PermissionType,
  RemovedTierListItem,
  TierListActorInterface,
  TierListDto,
  TierListEntryRef,
  TierListItemDto,
  UpdateTierListInput,
} from "@cellar-assistant/contracts";
import {
  ConflictError,
  ForbiddenError,
  isTierListEntryType,
  MAX_BAND,
  MIN_BAND,
  NotFoundError,
  offsetPage,
  TierListActorDescriptor,
  ValidationError,
} from "@cellar-assistant/contracts";
import { tierListItems, tierLists } from "@cellar-assistant/db";
import { eq, sql } from "@cellar-assistant/db/orm";
import { canSeeTierList, isOwner } from "@cellar-assistant/policy";
import type { ActorId, DaprClient } from "@dapr/dapr";
import { EntityActorBase } from "../lib/actor-base.ts";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import { ARCS } from "../lib/item-arcs.ts";
import { enqueueOutboxOnce } from "../lib/outbox.ts";
import { OUTBOX_TARGETS } from "../lib/outbox-targets.ts";
import type { TierListEntryDescriptor } from "../lib/tier-list-entries.ts";
import {
  entryKey,
  MIN_GROUNDED_ENTRIES,
  resolveTierListEntries,
} from "../lib/tier-list-entries.ts";
import { requireUuid } from "../lib/uuid.ts";
import { tierListVisibility } from "../lib/visibility.ts";

type TierListRow = typeof tierLists.$inferSelect;
type TierListItemRow = typeof tierListItems.$inferSelect;

export type TierListAggregate = {
  readonly tierList: TierListRow;
  /** Every row, `band desc, position asc` — the plan's own read ordering. */
  readonly items: readonly TierListItemRow[];
};

/**
 * `generateInsights`'s content gate: the old function's `MIN_ITEMS`.
 *
 * B7b moved the number itself into `lib/tier-list-entries.ts`, which applies
 * the same threshold to *describable* entries rather than to the row count, so
 * the two gates are one constant.
 */
const MIN_ITEMS_FOR_INSIGHTS = MIN_GROUNDED_ENTRIES;

/** `generateInsights`'s throttle: the old function's `THROTTLE_MS`, 24h. */
const INSIGHTS_THROTTLE_MS = 24 * 60 * 60 * 1000;

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

    return { tierList, items };
  }

  /* ---------------------------------------------------------------------- */
  /* Reads                                                                   */
  /* ---------------------------------------------------------------------- */

  async get(ctx: Ctx): Promise<TierListDto> {
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);
    return this.#toDto(aggregate);
  }

  async items(ctx: Ctx, page: PageArgs): Promise<Page<TierListItemDto>> {
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);
    return offsetPage(aggregate.items.map(toItemDto), page);
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

    await this.tx(async (tx) => {
      await tx.insert(tierLists).values({
        id: this.key,
        name,
        description: input.description ?? null,
        createdById: creator,
        ...(input.privacy === undefined ? {} : { privacy: input.privacy }),
        ...(input.listType === undefined ? {} : { listType: input.listType }),
      });
    });
    await this.reload();
    return this.#toDto(this.requireAggregate());
  }

  /** Creator only; header fields only. Never touches `content_updated_at`. */
  async update(ctx: Ctx, input: UpdateTierListInput): Promise<TierListDto> {
    const aggregate = this.requireAggregate();
    await this.#requireCreator(ctx, aggregate, "update this tier list");

    const patch: {
      name?: string;
      description?: string | null;
      privacy?: PermissionType;
      isEditingLocked?: boolean;
    } = {};
    if (input.name !== undefined) patch.name = requireName(input.name);
    if (input.description !== undefined) patch.description = input.description;
    if (input.privacy !== undefined) patch.privacy = input.privacy;
    if (input.isEditingLocked !== undefined) {
      patch.isEditingLocked = input.isEditingLocked;
    }
    if (Object.keys(patch).length === 0) return this.#toDto(aggregate);

    await this.tx(async (tx) => {
      await tx
        .update(tierLists)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(tierLists.id, this.key));
    });
    await this.reload();
    return this.#toDto(this.requireAggregate());
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
    const entry = requireEntry(input.entry);
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

    const position = aggregate.items.filter((row) => row.band === band).length;

    await this.tx(async (tx) => {
      await tx
        .insert(tierListItems)
        .values({
          id: tierListItemId,
          tierListId: this.key,
          band,
          position,
          notes: input.notes ?? null,
          [entryProperty(entry.type)]: entry.id,
        })
        // Belt and braces for a redelivery racing itself, same as `CellarActor`.
        .onConflictDoNothing({ target: tierListItems.id });
      await this.#bumpContentAndEnqueueInsights(tx, ctx);
    });
    await this.reload();
    return toItemDto(this.#requireItem(tierListItemId));
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

    await this.tx(async (tx) => {
      await tx
        .delete(tierListItems)
        .where(eq(tierListItems.id, tierListItemId));
      await this.#writePositions(tx, item.band, remaining);
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

    await this.tx(async (tx) => {
      let moved = await this.#writePositions(tx, targetBand, ids, byId);
      for (const sourceBand of sourceBands) {
        const remaining = aggregate.items
          .filter((row) => row.band === sourceBand && !movedIds.has(row.id))
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((row) => row.id);
        moved += await this.#writePositions(tx, sourceBand, remaining, byId);
      }
      // A reorder that reorders nothing is not a content change (see the class
      // doc, "A no-op reorder is not a content change"). `#writePositions`
      // already knows — it skips every row that is where it belongs — so the
      // count it returns is exactly "did anything move".
      if (moved > 0) await this.#bumpContentAndEnqueueInsights(tx, ctx);
    });
    await this.reload();

    return this.requireAggregate()
      .items.filter((row) => row.band === targetBand)
      .map(toItemDto);
  }

  /**
   * `system`, via the outbox (§1.7-style split: this method exists only to be
   * *delivered*, never called directly by a request). Idempotent by
   * recomputation — see the class doc.
   */
  async generateInsights(
    ctx: Ctx,
    _payload: Record<string, unknown> = {},
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
    if (
      generatedAt !== null &&
      Date.now() - generatedAt.getTime() < INSIGHTS_THROTTLE_MS
    ) {
      return { tierListId: this.key, skipped: true, reason: "throttled" };
    }

    const insights = await this.#generateInsights(ctx, {
      tierListId: this.key,
      name: aggregate.tierList.name,
      description: aggregate.tierList.description,
      listType: aggregate.tierList.listType,
      entries: await this.#describeEntries(aggregate.items),
    });

    await this.tx(async (tx) => {
      await tx
        .update(tierLists)
        .set({
          aiInsights: insights,
          insightsGeneratedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(tierLists.id, this.key));
    });
    await this.reload();
    return { tierListId: this.key, skipped: false, reason: "generated" };
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
    await tx
      .update(tierLists)
      .set({ contentUpdatedAt: new Date() })
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

  #toDto(aggregate: TierListAggregate): TierListDto {
    return {
      id: aggregate.tierList.id,
      name: aggregate.tierList.name,
      description: aggregate.tierList.description,
      createdById: aggregate.tierList.createdById,
      privacy: aggregate.tierList.privacy,
      listType: aggregate.tierList.listType,
      isEditingLocked: aggregate.tierList.isEditingLocked,
      itemCount: aggregate.items.length,
      aiInsights:
        (aggregate.tierList.aiInsights as Record<string, unknown> | null) ??
        null,
      insightsGeneratedAt: iso(aggregate.tierList.insightsGeneratedAt),
      contentUpdatedAt: requiredIso(aggregate.tierList.contentUpdatedAt),
      createdAt: iso(aggregate.tierList.createdAt),
      updatedAt: iso(aggregate.tierList.updatedAt),
    };
  }
}
