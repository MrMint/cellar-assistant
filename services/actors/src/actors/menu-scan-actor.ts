/**
 * `MenuScanActor` — B8 (migration plan §2.1, §1.3, §1.4, §1.5, §1.6, §8.4, §8.5).
 *
 * > **`MenuScanActor(scanId)`**
 * > - Owns: `menu_scans`, `item_match_suggestions`.
 * > - Methods: `get`, `create(fileId, placeHint)`, `process` (system, outbox:
 * >   AI extraction, then `PlaceActor.addMenuFromScan`, then `match`), `match`
 * >   (system: vector match via `ItemSearchActor` / `RecipeSearchActor`, AI
 * >   verification in the 0.4–0.9 band), `actOnSuggestion`.
 * > - Visibility: scan owner only. …
 * > - Replaces the `processing_status` event trigger, the HTTP shim
 * >   `onMenuScanComplete`, and the raw `fetch` from the server action.
 *
 * ## What replaced the trigger, exactly
 *
 * Today a Hasura event trigger on `menu_scans.processing_status` fires an HTTP
 * shim (`onMenuScanComplete`) which raw-`fetch`es `matchMenuItems`. Three
 * things were wrong with that and all three are gone: the trigger fires on a
 * *column value*, so a manual `UPDATE` in psql started a pipeline; the shim
 * had no retry and no idempotency key, so a 500 lost the match run silently;
 * and the server action's `fetch` had neither timeout nor auth. Here the chain
 * is three outbox rows, each committed in the transaction that justifies it
 * (§1.4) and each idempotent (§8.4):
 *
 * ```
 * create  ── tx ─▶ menu_scans row + outbox(MenuScanActor.process)
 * process ── tx ─▶ scan updated  + outbox(PlaceActor.addMenuFromScan)
 *                                + outbox(MenuScanActor.match)
 * match   ── tx ─▶ outbox(MenuMatchJobActor.start)
 * ```
 *
 * `outbox.seq` (A7b) gives the two rows `process` writes their first-attempt
 * order, so the menu items exist before `match` looks for them; if they do not
 * — a lost race, a failed `addMenuFromScan` — the matching job's first batch
 * finds nothing and completes, and re-running `match` is free.
 *
 * ## `match` does not match. §8.5 is why
 *
 * §2.1 puts "vector match via `ItemSearchActor` / `RecipeSearchActor`" on this
 * method, but §8.5 says "Entity actors never call collection, view, or search
 * actors synchronously except `CellarActor` → `EmbeddingActor`", and an outbox
 * row is one-way so it cannot bring a result back. So `match` **starts a job**:
 * one outbox row targeting `MenuMatchJobActor(jobId).start`, with `jobId`
 * derived deterministically from the scan id. That actor is on §8.5's
 * "job → entity / registry / search" edge, which lets it do both halves of the
 * work legally: call the two search actors, then call `recordSuggestions` back
 * on this actor. See `menu-match-job-actor.ts`.
 *
 * ## What this actor caches, and what it deliberately does not (§1.3)
 *
 * The aggregate is **the `menu_scans` row and nothing else**. §2.1 also gives
 * this actor `item_match_suggestions`, which it does write — but *which*
 * suggestions belong to this scan is decided by `place_menu_items.menu_scan_id`,
 * a column `PlaceActor` owns and writes (`addMenuFromScan`). Caching the list
 * would be B6's bug exactly: a member set whose membership another actor
 * controls, with nothing to invalidate it. Every suggestion read here is a
 * fresh query, and `requireVisible` runs at the top of every method, before any
 * cached value is touched — §1.5's rule, added after C1 served an anonymous
 * request from a warm cache.
 *
 * ## The AI call runs in this actor's turn, on purpose
 *
 * Same argument as B2's `ItemOnboardingActor` (`lib/item-defaults.ts`): a
 * multi-second vision call may not sit in an actor that serves other traffic,
 * so it sits in one keyed so that the only thing queued behind it is the scan
 * it belongs to. Unlike onboarding it is not request-driven either — `process`
 * is `system`, delivered by the outbox — which is the stronger form of §8.5's
 * "anything over a few seconds is outbox-driven".
 */
import type {
  ActOnSuggestionInput,
  ActOnSuggestionResult,
  ActorCategory,
  CompensationResult,
  CreateMenuScanInput,
  Ctx,
  DeadDeliveryNotice,
  MatchMenuScanResult,
  MatchSuggestionDto,
  MatchSuggestionTarget,
  MenuScanActorInterface,
  MenuScanDto,
  MenuScanStatus,
  Page,
  PageArgs,
  PlaceMenuItemDto,
  ProcessMenuScanResult,
  RecordSuggestionsInput,
  RecordSuggestionsResult,
  ScannedMenuItemInput,
} from "@cellar-assistant/contracts";
import {
  ConflictError,
  DEAD_DELIVERY_REASONS,
  ForbiddenError,
  formatStoredFailure,
  isMenuScanStatus,
  isScannedItemType,
  keysetPage,
  MENU_MATCH_JOB_ACTOR_TYPE,
  MENU_MATCH_JOB_NAMESPACE,
  MenuScanActorDescriptor,
  mapPage,
  matchableMenuItemType,
  NotFoundError,
  offsetCursor,
  offsetPage,
  parseOffsetCursor,
  ValidationError,
} from "@cellar-assistant/contracts";
import {
  itemMatchSuggestions,
  menuScans,
  placeMenuItems,
} from "@cellar-assistant/db";
import { and, asc, eq, inArray, isNull, sql } from "@cellar-assistant/db/orm";
import { isOwner } from "@cellar-assistant/policy";
import type { ActorId, DaprClient } from "@dapr/dapr";
import { EntityActorBase } from "../lib/actor-base.ts";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import { finalDeliveryFailure } from "../lib/delivery-attempt.ts";
import { derivedUuid } from "../lib/derived-uuid.ts";
import {
  daprVerifyFile,
  requireVerifiedFile,
  type VerifyFile,
} from "../lib/file-verification.ts";
import { requireSystem } from "../lib/guards.ts";
import { ARCS, type ArcSqlRow } from "../lib/item-arcs.ts";
import type {
  ExtractedMenuLine,
  MenuExtractionProvider,
  MenuExtractionResult,
} from "../lib/menu-ai.ts";
import { menuExtractionProvider } from "../lib/menu-ai.ts";
import { enqueueOutbox } from "../lib/outbox.ts";
import { OUTBOX_TARGETS } from "../lib/outbox-targets.ts";
import { menuItemRowToDto } from "../lib/place-menu-items.ts";
import { emit } from "../lib/telemetry.ts";
import { isUuid, requireUuid } from "../lib/uuid.ts";

type ScanRow = typeof menuScans.$inferSelect;

export type MenuScanAggregate = { readonly row: ScanRow };

/** The refusal for a method the outbox or a job delivers (admin: the repair path). */
const deliveredOnly = (method: string): string =>
  `MenuScanActor.${method} is delivered by the outbox or a job; a ` +
  "request may never call it directly (§1.6)";

/**
 * The `MenuMatchJobActor` id for a scan. Stable, so `match` is idempotent.
 *
 * C4c hoisted the deterministic-uuid helper this calls to
 * `../lib/derived-uuid.ts` — it used to be a local copy (kept local, per the
 * comment that used to sit here, so that an actor module never imports
 * another actor module and trips the §8.5 static call-graph fence; `src/lib/`
 * has no such restriction). That local copy joined `namespace`/`name` with a
 * plain space rather than the NUL byte the other two copies used, so this id
 * changes value with the hoist — see `derived-uuid.ts`'s own comment for why
 * that is safe here: nothing persists this value as an expected constant, it
 * only addresses a Dapr actor.
 */
export const menuMatchJobId = (menuScanId: string): string =>
  derivedUuid(menuScanId, MENU_MATCH_JOB_NAMESPACE);

/**
 * Drizzle's typed `select` hands back a `Date`; a raw `db.execute` hands back
 * whatever `pg` parsed, which for the join queries below is the timestamp
 * string. Both are accepted rather than one being cast at every call site.
 */
const iso = (value: Date | string | null): string | null => {
  if (value === null) return null;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
};

const num = (value: string | number | null): number | null =>
  value === null ? null : Number(value);

const statusOf = (value: string): MenuScanStatus =>
  isMenuScanStatus(value) ? value : "pending";

/** `manualPlaceOverride ?? placeId ?? estimatedPlaceId` — §2.1's three columns. */
export const effectivePlaceId = (row: ScanRow): string | null =>
  row.manualPlaceOverride ?? row.placeId ?? row.estimatedPlaceId;

export const scanRowToDto = (row: ScanRow): MenuScanDto => ({
  id: row.id,
  userId: row.userId,
  placeId: row.placeId,
  estimatedPlaceId: row.estimatedPlaceId,
  manualPlaceOverride: row.manualPlaceOverride,
  effectivePlaceId: effectivePlaceId(row),
  originalImageId: row.originalImageId,
  processedImageId: row.processedImageId,
  extractedText: row.extractedText,
  processingStatus: statusOf(row.processingStatus),
  processingError: row.processingError,
  confidenceScore: num(row.confidenceScore),
  processingModel: row.processingModel,
  processingDurationMs: row.processingDurationMs,
  itemsDetected: row.itemsDetected ?? 0,
  itemsMatched: row.itemsMatched ?? 0,
  scannedAt: iso(row.scannedAt),
  processedAt: iso(row.processedAt),
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

/** `item_match_suggestions`' arc: its six `suggested_<type>_id` columns. */
const SUGGESTED = ARCS.itemMatchSuggestions;

/** `place_menu_items`' four, for the acceptance that propagates. */
type SuggestionJoinRow = {
  readonly id: string;
  readonly place_menu_item_id: string;
  readonly menu_scan_id: string | null;
  readonly place_id: string;
  readonly menu_item_name: string;
  readonly suggested_recipe_id: string | null;
  readonly confidence_score: string;
  readonly match_reasoning: string | null;
  readonly similarity_metrics: Record<string, unknown> | null;
  readonly accepted: boolean | null;
  readonly rejected: boolean | null;
  readonly acted_by: string | null;
  readonly acted_at: Date | string | null;
  readonly created_at: Date | string | null;
} & ArcSqlRow;

const targetOf = (row: SuggestionJoinRow): MatchSuggestionTarget => {
  if (row.suggested_recipe_id !== null) {
    return { kind: "RECIPE", recipeId: row.suggested_recipe_id };
  }
  const item = SUGGESTED.refOf(row, "column");
  if (item !== null) return { kind: "ITEM", item };
  // `check_single_suggested_item` makes this unreachable from the database.
  throw new ConflictError(
    `item_match_suggestion ${row.id} names no suggested item`,
  );
};

const suggestionRowToDto = (row: SuggestionJoinRow): MatchSuggestionDto => ({
  id: row.id,
  menuScanId: row.menu_scan_id,
  placeMenuItemId: row.place_menu_item_id,
  placeId: row.place_id,
  menuItemName: row.menu_item_name,
  target: targetOf(row),
  confidenceScore: Number(row.confidence_score),
  matchReasoning: row.match_reasoning,
  similarityMetrics: row.similarity_metrics,
  accepted: row.accepted,
  rejected: row.rejected,
  actedBy: row.acted_by,
  actedAt: iso(row.acted_at),
  createdAt: iso(row.created_at),
});

/**
 * One extracted line as `PlaceActor.addMenuFromScan` stores it. The scanned
 * type goes in `detected_item_type` and the AI-normalised search phrase in
 * `search_name` — both columns, once each. Until
 * `20260928182317_place_menu_items_scan_columns` both were also (or only) in
 * `extracted_attributes`, under `scanItemType` and `search_name`, a leftover
 * from `detected_item_type`'s old CHECK that could not spell sake, tea or
 * cocktail; that migration backfilled the columns and removed the keys.
 * `extracted_attributes` now carries only what the model added beyond the
 * columns.
 */
export const lineToScannedItem = (
  line: ExtractedMenuLine,
): ScannedMenuItemInput => {
  const itemType = isScannedItemType(line.itemType) ? line.itemType : "unknown";
  const name = line.name.trim();
  return {
    name,
    description: line.description ?? null,
    price: line.price ?? null,
    menuCategory: line.menuCategory ?? null,
    detectedItemType: itemType,
    confidenceScore: line.confidence ?? null,
    extractedAttributes: { ...(line.attributes ?? {}) },
    searchName: (line.searchName ?? name).trim(),
  };
};

/* -------------------------------------------------------------------------- */
/* The actor                                                                   */
/* -------------------------------------------------------------------------- */

export class MenuScanActor
  extends EntityActorBase<MenuScanAggregate>
  implements MenuScanActorInterface
{
  static readonly category: ActorCategory = MenuScanActorDescriptor.category;

  readonly #extract: MenuExtractionProvider;
  readonly #verifyFile: VerifyFile;

  constructor(
    daprClient: DaprClient,
    id: ActorId,
    db: DbOrTx = actorDb(),
    extract: MenuExtractionProvider = menuExtractionProvider(),
    verifyFile: VerifyFile = daprVerifyFile,
  ) {
    super(daprClient, id, db);
    this.#extract = extract;
    this.#verifyFile = verifyFile;
  }

  protected async loadAggregate(id: string): Promise<MenuScanAggregate | null> {
    if (!isUuid(id)) return null;
    const [row] = await this.db
      .select()
      .from(menuScans)
      .where(eq(menuScans.id, id));
    return row === undefined ? null : { row };
  }

  /**
   * §2.1: "Visibility: scan owner only." Not friends, not the public.
   *
   * The refusal was already `NotFoundError` and that was never the leak — the
   * **wording** was. `menu scan <id> not found` and `requireAggregate()`'s
   * `MenuScanActor(<id>) has no row` are two strings for the two cases this
   * guard exists to merge, so a stranger who sweeps ids still learns which
   * ones name a real scan; `services/api` returns the actor's message
   * verbatim (`menu-scan.ts`'s own field description claims the opposite).
   *
   * `c35fa111` made exactly this change to `ItemOnboardingActor.#requireOwner`
   * and swept for the tell elsewhere; this actor is the other owner-only
   * entity actor and the sweep missed it. Same remedy, and for the same
   * reason: reuse `requireAggregate()`'s own wording, because any different
   * message restores the difference it is meant to erase — which is now the
   * base class's `requireVisible`, the only spelling there is.
   */
  protected override canSee(ctx: Ctx, aggregate: MenuScanAggregate): boolean {
    return isOwner(ctx, aggregate.row.userId);
  }

  /* ---------------------------------------------------------------------- */
  /* Reads                                                                   */
  /* ---------------------------------------------------------------------- */

  async get(ctx: Ctx): Promise<MenuScanDto> {
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);
    return scanRowToDto(aggregate.row);
  }

  /**
   * This scan's match suggestions, newest and most confident first.
   *
   * Not in §2.1's method list; added because §1.5 pages child lists from the
   * owning actor and `/scans` has nowhere else to get them (D5's UI, C3's
   * `MatchSuggestionsCollectionActor` serves the cross-scan `/discoveries`
   * feed instead). Read fresh, never cached — see the module doc.
   */
  async suggestions(
    ctx: Ctx,
    page: PageArgs,
  ): Promise<Page<MatchSuggestionDto>> {
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);
    const rows = await this.#readSuggestions();
    return offsetPage(rows.map(suggestionRowToDto), page);
  }

  /**
   * UI parity G19 — every line this scan extracted, matched or not. The old
   * scan page drew `place_menu_items(where menu_scan_id)` grouped by
   * category; `suggestions` only reaches lines that got a suggestion, so an
   * unmatched line was invisible.
   *
   * `place_menu_items` is `PlaceActor`'s table, so this reads it fresh and
   * caches nothing (§1.3), exactly as `#readSuggestions` does — and pages in
   * SQL rather than in memory, since a scan can be hundreds of lines (§1.5).
   * The owner check runs before the read.
   */
  async menuItems(ctx: Ctx, page: PageArgs): Promise<Page<PlaceMenuItemDto>> {
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);
    // Offset cursors, as `suggestions` mints: the cursor is the row's index
    // in this order, which `id` makes total.
    const start = page.after === null ? 0 : parseOffsetCursor(page.after) + 1;
    const rows = await this.db
      .select()
      .from(placeMenuItems)
      .where(eq(placeMenuItems.menuScanId, aggregate.row.id))
      .orderBy(
        sql`${placeMenuItems.menuCategory} asc nulls last`,
        asc(placeMenuItems.menuItemName),
        asc(placeMenuItems.id),
      )
      .limit(page.first + 1)
      .offset(start);
    const [counted] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(placeMenuItems)
      .where(eq(placeMenuItems.menuScanId, aggregate.row.id));
    const paged = keysetPage(
      rows.map((row, index) => ({ row, index: start + index })),
      page,
      (entry) => offsetCursor(entry.index),
      Number(counted?.n ?? 0),
    );
    return {
      ...mapPage(paged, (entry) => menuItemRowToDto(entry.row)),
      hasPreviousPage: start > 0,
    };
  }

  async #readSuggestions(): Promise<readonly SuggestionJoinRow[]> {
    const { rows } = await this.db.execute<SuggestionJoinRow>(sql`
      select s.*, i.menu_scan_id, i.place_id, i.menu_item_name
      from public.item_match_suggestions s
      join public.place_menu_items i on i.id = s.place_menu_item_id
      where i.menu_scan_id = ${this.key}::uuid
      order by (s.accepted is null and s.rejected is null) desc,
               s.confidence_score desc,
               s.id asc
    `);
    return rows;
  }

  /* ---------------------------------------------------------------------- */
  /* create                                                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * Record the upload and schedule its extraction.
   *
   * §8.4: idempotent on `this.key`. A second `create` for the same scan id
   * returns the existing row and enqueues **no** second `process`, so a
   * retried mutation cannot produce two extractions of one photo.
   *
   * ## The upload has to have happened (E2d)
   *
   * A `files` row is minted by `createUploadTarget` **before any bytes move**,
   * so a file id proves only that somebody asked for an upload URL. Until E2d
   * this method took the id on trust: the FK to `files` passed, the scan was
   * created `pending`, and the defect only surfaced three outbox hops later
   * when `process` asked a vision model to read an object that does not exist
   * — leaving a junk `menu_scans` row and a failed scan the user has to make
   * sense of. `verifyUpload`, `files.verified_at` and `files_unverified_idx`
   * all existed for this and none of them was consulted.
   *
   * The browser already tried to cover the gap — `src/lib/api/menu-scans.ts`
   * calls `uploadFile(…, { verify: true })` precisely because "nothing on this
   * path verifies for you". That is a *client* doing the right thing, which is
   * not a guard: any other caller of the mutation simply does not, and
   * target-stack §4's rule is "never trust a client's 'done'". The only
   * server-side fact is `files.verified_at`, and the only thing that sets it is
   * `FileActor.verify` asking the object store. So that is what this asks —
   * §8.5's sanctioned entity → `FileActor` edge, through
   * `lib/file-verification.ts` so `ItemActor.attachImage` and this share one
   * implementation rather than two that drift.
   *
   * Both ids are checked. `processedImageId` is nullable and rarer, but it is
   * the same caller-supplied id with the same FK and the same nothing behind
   * it. The check sits after the idempotency return, so a retry of an
   * already-created scan costs no sidecar hop.
   */
  async create(ctx: Ctx, input: CreateMenuScanInput): Promise<MenuScanDto> {
    requireUuid(this.key, "menuScanId");
    const userId = ctx.viewerId;
    if (userId === null) {
      throw new ForbiddenError("sign in to scan a menu");
    }

    const existing = this.aggregate;
    if (existing !== null) {
      await this.requireVisible(ctx, existing);
      return scanRowToDto(existing.row);
    }

    const originalImageId = requireUuid(
      input.originalImageId,
      "originalImageId",
    );
    const processedImageId =
      input.processedImageId == null
        ? null
        : requireUuid(input.processedImageId, "processedImageId");

    // Before the insert, not after: a scan row whose image has no bytes is the
    // junk row this method exists to stop creating.
    await requireVerifiedFile(
      this.#verifyFile,
      ctx,
      originalImageId,
      "a menu scan",
    );
    if (processedImageId !== null) {
      await requireVerifiedFile(
        this.#verifyFile,
        ctx,
        processedImageId,
        "a menu scan",
      );
    }

    const hint = input.placeHint ?? {};
    const values = {
      id: this.key,
      userId,
      originalImageId,
      processedImageId,
      placeId:
        hint.placeId == null ? null : requireUuid(hint.placeId, "placeId"),
      estimatedPlaceId:
        hint.estimatedPlaceId == null
          ? null
          : requireUuid(hint.estimatedPlaceId, "estimatedPlaceId"),
      ...(hint.location == null ? {} : { scanLocation: hint.location }),
      processingStatus: "pending" as const,
    };

    try {
      await this.tx(async (tx) => {
        await tx
          .insert(menuScans)
          .values(values)
          .onConflictDoNothing({ target: menuScans.id });
        // §1.4: the row and the intent to process it commit together, so a
        // crash between "the upload was accepted" and "extraction started"
        // cannot lose the scan. This is what the `processing_status` event
        // trigger used to do, without the retry or the idempotency key.
        await enqueueOutbox(
          tx,
          OUTBOX_TARGETS["MenuScanActor.process"],
          {
            targetId: this.key,
            payload: { menuScanId: this.key },
          },
          { attributeTo: ctx },
        );
      });
    } catch (error) {
      throw translateFkViolation(error);
    }
    await this.reload();
    return scanRowToDto(this.requireAggregate().row);
  }

  /* ---------------------------------------------------------------------- */
  /* process                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * Extract the menu, file it against the place, and schedule the match.
   *
   * §8.4: idempotent on `menu_scans.processing_status`. A redelivery that
   * finds `completed` returns `alreadyProcessed` and enqueues nothing — which
   * is B8's acceptance criterion, because a second `addMenuFromScan` row is
   * what would duplicate menu items. (`PlaceActor.addMenuFromScan` is *also*
   * idempotent on `menuScanId`, so the guarantee holds even if both fail.)
   *
   * ## `failed` means the outbox has given up, not that one attempt did
   *
   * A failed extraction is rethrown so the outbox retries it, and while it is
   * being retried the scan is still `processing`, with the latest error in
   * `processing_error`. It becomes `failed` only on the failure the outbox
   * will not retry — a permanent one, the last attempt, or a run an admin
   * forced by hand (`finalDeliveryFailure`), the same rule
   * `JobActor.runBatch` applies to a job. This used to write `failed` on every
   * failed attempt and `processing` again at the top of the next, so the
   * status flapped for the whole ~17-minute backoff ladder and a scan that
   * went on to succeed had told its owner "failed" up to nine times.
   *
   * The error survives the next attempt's start for the same reason: an
   * attempt in flight has not cleared it. Only completion does.
   */
  async process(
    ctx: Ctx,
    _input: Record<string, unknown> = {},
  ): Promise<ProcessMenuScanResult> {
    const aggregate = this.requirePrivilegedAggregate(
      ctx,
      deliveredOnly("process"),
    );

    if (aggregate.row.processingStatus === "completed") {
      return {
        menuScanId: this.key,
        status: "completed",
        alreadyProcessed: true,
        itemsDetected: aggregate.row.itemsDetected ?? 0,
        placeId: effectivePlaceId(aggregate.row),
        reason: "this scan has already been extracted",
      };
    }

    await this.tx(async (tx) => {
      await tx
        .update(menuScans)
        .set({ processingStatus: "processing", updatedAt: new Date() })
        .where(eq(menuScans.id, this.key));
    });
    await this.reload();

    const startedAt = Date.now();
    let result: MenuExtractionResult;
    try {
      // Outside `this.tx`, deliberately: a 30-second vision call must not hold
      // a Postgres transaction open for its duration.
      result = await this.#extract(ctx, {
        menuScanId: this.key,
        originalImageId: aggregate.row.originalImageId,
        processedImageId: aggregate.row.processedImageId,
        placeId: effectivePlaceId(aggregate.row),
      });
    } catch (error) {
      /*
       * Two readers, two needs, and they are not the same string.
       *
       * The **operator** needs all of it: `lib/ai/http.ts` deliberately builds
       * a message carrying the provider, the status, the endpoint and the
       * first 500 bytes of the body, because "the model call failed" with no
       * detail is the thing you cannot debug from a dead-lettered row — and
       * that detail is what identified a corrupt 1x1 PNG fixture as the real
       * cause of thirteen dead scans. It stays, verbatim, in the column, and
       * now also goes to Loki as `menu_scan.extraction_failed`.
       *
       * The **user** must not see any of it: an internal hostname and port on
       * a `/map/scans` card is useless to them and useful to an attacker.
       * `services/api/src/schema/failure-summary.ts` is where that split is
       * made, for every client at once.
       *
       * `formatStoredFailure` is the one change to what is written. The AI
       * layer classifies every failure it raises (400 → `ValidationError`,
       * 5xx/408/429 → `ConflictError` — see `lib/ai/http.ts`), and that code
       * used to be dropped here, leaving the reader to substring-match English
       * prose to recover it. `contracts/stored-failure.ts` writes it down
       * instead: `"VALIDATION: <message unchanged>"`.
       */
      const stored = formatStoredFailure(error);
      // Retrying, or finished? Only the latter is `failed` (method doc).
      const final = await finalDeliveryFailure(this.db, ctx, error);
      emit({
        name: "menu_scan.extraction_failed",
        severity: final === null ? "WARN" : "ERROR",
        message: stored,
        attributes: {
          menu_scan_id: this.key,
          "menu_scan.final_reason": final ?? "retrying",
        },
      });
      await this.tx(async (tx) => {
        await tx
          .update(menuScans)
          .set({
            processingStatus: final === null ? "processing" : "failed",
            processingError: stored,
            updatedAt: new Date(),
          })
          .where(eq(menuScans.id, this.key));
      });
      await this.reload();
      // Rethrown so the outbox retries with backoff and eventually
      // dead-letters, rather than recording a silent success.
      throw error;
    }

    const items = result.lines.map(lineToScannedItem);
    const placeId = effectivePlaceId(aggregate.row);
    const durationMs = result.durationMs ?? Date.now() - startedAt;

    await this.tx(async (tx) => {
      await tx
        .update(menuScans)
        .set({
          processingStatus: "completed",
          processingError: null,
          extractedText: result.rawText,
          processingModel: result.model,
          processingDurationMs: durationMs,
          confidenceScore: clamp01(result.confidence).toFixed(2),
          itemsDetected: items.length,
          processedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(menuScans.id, this.key));

      // §1.4 + §8.5: two entity → entity calls, both through the outbox, in
      // `outbox.seq` order so the menu items exist before the match looks.
      if (placeId !== null && items.length > 0) {
        await enqueueOutbox(
          tx,
          OUTBOX_TARGETS["PlaceActor.addMenuFromScan"],
          {
            targetId: placeId,
            payload: { menuScanId: this.key, items },
          },
          { attributeTo: ctx },
        );
        await enqueueOutbox(
          tx,
          OUTBOX_TARGETS["MenuScanActor.match"],
          {
            targetId: this.key,
            payload: { menuScanId: this.key },
          },
          { attributeTo: ctx },
        );
      }
    });
    await this.reload();

    return {
      menuScanId: this.key,
      status: "completed",
      alreadyProcessed: false,
      itemsDetected: items.length,
      placeId,
      /*
       * "Completed, and there was no menu here" is its own outcome (B8c).
       *
       * It is not a failure — `processing_status` stays `completed`, which is
       * what `menu_scans_processing_status_check` allows and what the scan
       * genuinely is: the pipeline ran, and the honest answer was nothing.
       * But it is not `extracted 0 line(s)` either, which is what an
       * unreadable *menu* produces, so the two are said differently here
       * rather than collapsed. `MenuExtractionResult.noMenuDetected` carries
       * the distinction; this is the first place it is phrased.
       */
      reason: result.noMenuDetected
        ? `${result.model} found no menu in this image, so nothing was ` +
          `extracted${result.imageDescription === null ? "" : ` (${result.imageDescription})`}`
        : placeId === null
          ? "no place is known for this scan, so nothing was filed or matched"
          : `extracted ${items.length} line(s) with ${result.model}`,
    };
  }

  /**
   * The outbox gave up on this scan's extraction: the scan has failed.
   *
   * `process`'s `onDead` (`services/actors/src/lib/outbox-targets.ts`), enqueued by
   * the drainer alone in the statement that makes the `process` row `dead`.
   * `process` writes `failed` itself on the failure it knows is final; this
   * covers the one it cannot know about — the host dying mid-extraction on
   * the last attempt, which the reclaim sweep dead-letters without invoking
   * anything, and which used to leave the scan `processing` forever.
   *
   * Idempotent: a scan already `completed` or `failed` is left alone, and a
   * missing one is `absent`. The stored error is kept if a failing attempt
   * wrote one; otherwise it says, unclassified, why the scan ended.
   */
  async markFailed(
    ctx: Ctx,
    notice: DeadDeliveryNotice,
  ): Promise<CompensationResult> {
    requireSystem(
      ctx,
      "MenuScanActor.markFailed is the outbox's compensation for a dead " +
        "extraction; it is not callable from a request (§1.6)",
    );
    if (!DEAD_DELIVERY_REASONS.includes(notice?.reason)) {
      throw new ValidationError(
        `markFailed needs a dead-delivery reason, got ${String(notice?.reason)}`,
      );
    }
    await this.reload();
    const row = this.aggregate?.row;
    if (row === undefined) return { compensated: false, reason: "absent" };
    if (
      row.processingStatus === "completed" ||
      row.processingStatus === "failed"
    ) {
      return { compensated: false, reason: "terminal" };
    }

    await this.tx(async (tx) => {
      await tx
        .update(menuScans)
        .set({
          processingStatus: "failed",
          processingError:
            row.processingError ??
            `the outbox gave up on this scan's extraction (${notice.reason})`,
          updatedAt: new Date(),
        })
        .where(eq(menuScans.id, this.key));
    });
    await this.reload();
    emit({
      name: "menu_scan.failed",
      severity: "ERROR",
      message: `menu scan ${this.key} failed: the outbox gave up on its extraction (${notice.reason})`,
      attributes: {
        menu_scan_id: this.key,
        "menu_scan.final_reason": notice.reason,
        "outbox.dead_id": notice.deadOutboxId,
      },
    });
    return { compensated: true };
  }

  /* ---------------------------------------------------------------------- */
  /* match                                                                   */
  /* ---------------------------------------------------------------------- */

  /**
   * Start the matching run.
   *
   * See the module doc for why this schedules a job rather than searching:
   * §8.5 forbids an entity actor from calling a search actor, and a one-way
   * outbox row cannot bring an answer back.
   *
   * §8.4: idempotent on the derived job id. `JobActor.start` returns the
   * existing row without scheduling a second chain, and this method checks
   * `jobs` first so a redelivery does not even enqueue.
   */
  async match(
    ctx: Ctx,
    _input: Record<string, unknown> = {},
  ): Promise<MatchMenuScanResult> {
    const aggregate = this.requirePrivilegedAggregate(
      ctx,
      deliveredOnly("match"),
    );

    if (aggregate.row.processingStatus !== "completed") {
      // Not an error the outbox should swallow: `process` may still be in
      // flight, and a `ConflictError` is retried with backoff.
      throw new ConflictError(
        `menu scan ${this.key} is '${aggregate.row.processingStatus}'; ` +
          "matching runs after extraction completes",
      );
    }

    const placeId = effectivePlaceId(aggregate.row);
    if (placeId === null) {
      return {
        menuScanId: this.key,
        jobId: null,
        started: false,
        reason:
          "no place is known for this scan, so there are no menu items to match",
      };
    }

    const jobId = menuMatchJobId(this.key);
    // `jobs` belongs to `JobActor` (§3) and is read fresh, never cached (§1.3).
    const { rows } = await this.db.execute<{ id: string }>(
      sql`select id from public.jobs where id = ${jobId}::uuid`,
    );
    if (rows.length > 0) {
      return {
        menuScanId: this.key,
        jobId,
        started: false,
        reason: "a matching job for this scan already exists",
      };
    }

    await this.tx(async (tx) => {
      await enqueueOutbox(
        tx,
        OUTBOX_TARGETS["MenuMatchJobActor.start"],
        {
          targetId: jobId,
          payload: { menuScanId: this.key },
        },
        { attributeTo: ctx },
      );
    });

    return {
      menuScanId: this.key,
      jobId,
      started: true,
      reason: `queued ${MENU_MATCH_JOB_ACTOR_TYPE}(${jobId})`,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* recordSuggestions                                                       */
  /* ---------------------------------------------------------------------- */

  /**
   * Write one batch of the matching job's findings.
   *
   * Not in §2.1's list, and unavoidable: §1.2 makes this actor the single
   * writer of `item_match_suggestions`, so the job that computes the matches
   * cannot insert them itself.
   *
   * §8.4: idempotent **by replacement**, not by an idempotency key. The
   * transaction deletes every *un-acted* suggestion for the menu items in this
   * batch and inserts the batch's own, so re-running batch *n* — an outbox
   * redelivery, a job restarted after a crash, a manual re-match — converges
   * on the same rows rather than doubling them. A suggestion a user has
   * already accepted or rejected is never touched.
   */
  async recordSuggestions(
    ctx: Ctx,
    input: RecordSuggestionsInput,
  ): Promise<RecordSuggestionsResult> {
    this.requirePrivilegedAggregate(ctx, deliveredOnly("recordSuggestions"));

    const menuItemIds = input.placeMenuItemIds.map((id) =>
      requireUuid(id, "placeMenuItemId"),
    );
    if (menuItemIds.length === 0) {
      return {
        menuScanId: this.key,
        replaced: 0,
        created: 0,
        itemsMatched: this.requireAggregate().row.itemsMatched ?? 0,
      };
    }

    // `place_menu_items` is `PlaceActor`'s table: read fresh, and used only to
    // prove every id in the batch really belongs to this scan. A job actor
    // could otherwise be handed another scan's menu item id.
    const { rows: owned } = await this.db.execute<{ id: string }>(sql`
      select id from public.place_menu_items
      where menu_scan_id = ${this.key}::uuid
        and id = any(${sql.raw(`'{${menuItemIds.join(",")}}'::uuid[]`)})
    `);
    const ownedIds = new Set(owned.map((row) => row.id));
    const foreign = menuItemIds.filter((id) => !ownedIds.has(id));
    if (foreign.length > 0) {
      throw new ValidationError(
        `place_menu_item(s) ${foreign.join(", ")} are not on menu scan ${this.key}`,
      );
    }

    const suggestions = input.suggestions.filter((entry) =>
      ownedIds.has(entry.placeMenuItemId),
    );

    let replaced = 0;
    await this.tx(async (tx) => {
      const deleted = await tx
        .delete(itemMatchSuggestions)
        .where(
          and(
            inArray(itemMatchSuggestions.placeMenuItemId, [...ownedIds]),
            isNull(itemMatchSuggestions.accepted),
            isNull(itemMatchSuggestions.rejected),
          ),
        )
        .returning({ id: itemMatchSuggestions.id });
      replaced = deleted.length;

      if (suggestions.length > 0) {
        await tx.insert(itemMatchSuggestions).values(
          suggestions.map((entry) => ({
            placeMenuItemId: entry.placeMenuItemId,
            ...columnsFor(entry.target),
            confidenceScore: clamp01(entry.confidenceScore).toFixed(2),
            matchReasoning: entry.matchReasoning ?? null,
            similarityMetrics: entry.similarityMetrics ?? null,
          })),
        );
      }

      // Recomputed from rows, never incremented — B6's rule, and the reason a
      // redelivery has nothing to double.
      await tx.execute(sql`
        update public.menu_scans set
          items_matched = (
            select count(distinct s.place_menu_item_id)
            from public.item_match_suggestions s
            join public.place_menu_items i on i.id = s.place_menu_item_id
            where i.menu_scan_id = ${this.key}::uuid
          ),
          updated_at = now()
        where id = ${this.key}::uuid
      `);
    });
    await this.reload();

    return {
      menuScanId: this.key,
      replaced,
      created: suggestions.length,
      itemsMatched: this.requireAggregate().row.itemsMatched ?? 0,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* actOnSuggestion                                                         */
  /* ---------------------------------------------------------------------- */

  /**
   * Accept or reject one suggestion.
   *
   * Owner only (§2.1's "Visibility: scan owner only"), and the suggestion has
   * to be on *this* scan — a suggestion id from someone else's scan reads as
   * `NotFound`, so the id is not an oracle.
   *
   * An acceptance is propagated through an outbox row targeting `PlaceActor`
   * (§1.7: the cross-aggregate write belongs to the owning actor). Which
   * method depends on what was matched, because the two targets have different
   * homes:
   *
   *   - an item, of any type → `verifyMenuItemMatch`, which sets the matching
   *     FK column on `place_menu_items` (a sake or tea stopped at
   *     `item_match_suggestions` until the table gained their columns in
   *     `20260928043553_place_menu_items_sake_tea_matches`);
   *   - a **recipe** → `linkMenuItemRecipe`, which inserts into
   *     `menu_item_recipes` (**B8c**). `check_single_item_type` gives
   *     `place_menu_items` no column for a cocktail, so before B8c an accepted
   *     cocktail had nowhere to land.
   *
   * §8.4: idempotent, twice over. Re-applying the action already recorded
   * returns the stored row and enqueues nothing; and if a redelivery does
   * reach `PlaceActor`, both target methods are idempotent themselves.
   */
  async actOnSuggestion(
    ctx: Ctx,
    input: ActOnSuggestionInput,
  ): Promise<ActOnSuggestionResult> {
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);

    const suggestionId = requireUuid(input.suggestionId, "suggestionId");
    if (input.action !== "ACCEPT" && input.action !== "REJECT") {
      throw new ValidationError(
        `action must be ACCEPT or REJECT, got ${String(input.action)}`,
      );
    }

    const { rows } = await this.db.execute<SuggestionJoinRow>(sql`
      select s.*, i.menu_scan_id, i.place_id, i.menu_item_name
      from public.item_match_suggestions s
      join public.place_menu_items i on i.id = s.place_menu_item_id
      where s.id = ${suggestionId}::uuid and i.menu_scan_id = ${this.key}::uuid
    `);
    const row = rows[0];
    if (row === undefined) {
      throw new NotFoundError(
        `suggestion ${suggestionId} is not on menu scan ${this.key}`,
      );
    }

    const accept = input.action === "ACCEPT";
    const already = accept ? row.accepted === true : row.rejected === true;
    if (already) {
      return { suggestion: suggestionRowToDto(row), propagated: false };
    }

    const target = targetOf(row);
    // Every accepted target has a home now: an item's FK column on
    // `place_menu_items`, or a recipe's `menu_item_recipes` row.
    const propagates = accept;

    await this.tx(async (tx) => {
      await tx
        .update(itemMatchSuggestions)
        .set({
          accepted: accept,
          rejected: !accept,
          actedBy: ctx.viewerId,
          actedAt: new Date(),
        })
        .where(eq(itemMatchSuggestions.id, suggestionId));

      if (propagates && target.kind === "ITEM") {
        await enqueueOutbox(
          tx,
          OUTBOX_TARGETS["PlaceActor.verifyMenuItemMatch"],
          {
            // Keyed by the *place*, not the menu item: `PlaceActor(placeId)` is
            // the single writer of `place_menu_items` (§1.2).
            targetId: row.place_id,
            payload: {
              menuItemId: row.place_menu_item_id,
              match: {
                type: matchableMenuItemType(target.item.type),
                id: target.item.id,
              },
            },
          },
          { attributeTo: ctx },
        );
      }

      if (propagates && target.kind === "RECIPE") {
        // B8c. Same shape as the item branch and for the same reason: the
        // write belongs to `PlaceActor`, which owns `menu_item_recipes` (§1.2,
        // §3), and the hop is the outbox so §8.5's closed set of synchronous
        // entity→entity edges is untouched.
        await enqueueOutbox(
          tx,
          OUTBOX_TARGETS["PlaceActor.linkMenuItemRecipe"],
          {
            targetId: row.place_id,
            payload: {
              menuItemId: row.place_menu_item_id,
              recipeId: target.recipeId,
            },
          },
          { attributeTo: ctx },
        );
      }
    });

    const { rows: after } = await this.db.execute<SuggestionJoinRow>(sql`
      select s.*, i.menu_scan_id, i.place_id, i.menu_item_name
      from public.item_match_suggestions s
      join public.place_menu_items i on i.id = s.place_menu_item_id
      where s.id = ${suggestionId}::uuid
    `);
    const updated = after[0];
    if (updated === undefined) {
      throw new ConflictError(`suggestion ${suggestionId} vanished mid-turn`);
    }
    return { suggestion: suggestionRowToDto(updated), propagated: propagates };
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/** All seven target columns: the target's set, the other six `null`. */
const columnsFor = (
  target: MatchSuggestionTarget,
): Record<string, string | null> => ({
  ...SUGGESTED.assign(target.kind === "ITEM" ? target.item : null),
  suggestedRecipeId: target.kind === "RECIPE" ? target.recipeId : null,
});

/**
 * `menu_scans.original_image_id` and the two place columns are real foreign
 * keys. A bad id is a caller mistake, not a 500 — the same translation B5's
 * `PlaceActor` does for `verifyMenuItemMatch`.
 */
const translateFkViolation = (error: unknown): unknown => {
  const code = (error as { code?: unknown } | null)?.code;
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  if (code === "23503" || cause === "23503") {
    return new NotFoundError(
      "a menu scan names a file or place that does not exist",
    );
  }
  return error;
};
