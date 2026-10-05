/**
 * `MenuMatchJobActor` — B8 (migration plan §2.1's `MenuScanActor.match`, §8.5,
 * §2.6).
 *
 * ## Why a job actor exists for something §2.1 put on `MenuScanActor`
 *
 * §2.1 describes `match` as "vector match via `ItemSearchActor` /
 * `RecipeSearchActor`, AI verification in the 0.4–0.9 band". §8.5 forbids
 * exactly that from where §2.1 put it:
 *
 * > Entity actors never call collection, view, or search actors synchronously
 * > except `CellarActor` → `EmbeddingActor`.
 *
 * The outbox is not an escape hatch here, because it is one-way — a search
 * *answer* cannot come back through it. §8.5's own call graph names the one
 * caller that may do this work: **`job → entity / registry / search`**. So the
 * search half of `match` lives in a job actor, which may legally call
 * `ItemSearchActor` / `RecipeSearchActor` *and* call `MenuScanActor` back to
 * store what it found. `MenuScanActor.match` still exists and is still the
 * outbox's target; it schedules this job and nothing else.
 *
 * That split buys two things §2.1's shape could not have: a menu of several
 * hundred lines is chunked into `MENU_MATCH_BATCH_SIZE` turns instead of one
 * enormous one (§8.5: "anything over a few seconds is outbox-driven"), and a
 * host killed mid-menu resumes from the last committed cursor.
 *
 * ## Routing (`lib/menu-matching.ts`)
 *
 * A `cocktail` line is matched against `recipe_vectors` through
 * `RecipeSearchActor`; every other type against `item_vectors` through
 * `ItemSearchActor`, narrowed to that one item type. The scanned type is
 * `place_menu_items.detected_item_type` and the phrase searched with is
 * `place_menu_items.search_name` (the menu's own wording when that is blank).
 * Both used to be read out of `extracted_attributes` (`scanItemType`,
 * `search_name`), a copy left over from the column's old CHECK;
 * `20260928182317_place_menu_items_scan_columns` backfilled the columns from
 * it and removed the keys, so there is no JSONB fallback to keep.
 *
 * ## The bands
 *
 * `bandOf` (contracts): `>= 0.9` is suggested as-is, `< 0.4` is dropped, and
 * everything between goes to `MenuMatchVerifier`. A deployment with no
 * verifier configured therefore still matches the confident half of a menu and
 * fails loudly — batch retried by the outbox — only on a line that genuinely
 * needed a second opinion.
 *
 * ## Idempotency (§8.4)
 *
 * Three layers, none of which relies on the others:
 *
 *  1. `JobActor.runBatch` drops a delivery whose batch number is behind the
 *     stored cursor;
 *  2. the cursor is a menu-item id, so a re-run of batch *n* reads the same
 *     rows;
 *  3. `MenuScanActor.recordSuggestions` **replaces** the un-acted suggestions
 *     for the menu items in the batch rather than adding to them.
 *
 * Which is why a redelivered match run produces the same suggestions, not
 * twice as many.
 */

import type {
  ActorCategory,
  Ctx,
  InternalJobActorInterface,
  JobActorInterface,
  MatchSuggestionTarget,
  MenuMatchJobPayload,
  RecordedSuggestion,
  RecordSuggestionsInput,
  RecordSuggestionsResult,
  ScannedItemType,
} from "@cellar-assistant/contracts";
import {
  bandOf,
  ConflictError,
  isScannedItemType,
  MATCH_AUTO_CONFIDENCE,
  MENU_MATCH_BATCH_SIZE,
  MENU_MATCH_JOB_KIND,
  MENU_MATCH_MAX_CANDIDATES,
  MenuMatchJobActorDescriptor,
  MenuScanActorDescriptor,
  ValidationError,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import type { ActorId, DaprClient } from "@dapr/dapr";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import { requireSystem } from "../lib/guards.ts";
import { internal } from "../lib/internal-client.ts";
import type { MenuMatchVerifier } from "../lib/menu-ai.ts";
import { menuMatchVerifier } from "../lib/menu-ai.ts";
import type { MenuMatchCandidate, MenuSearcher } from "../lib/menu-matching.ts";
import {
  daprMenuSearcher,
  itemHitToCandidate,
  recipeHitToCandidate,
  routeFor,
} from "../lib/menu-matching.ts";
import type { BatchInput, BatchOutcome } from "./job-actor/index.ts";
import { JobActor } from "./job-actor/index.ts";

/** Where the next batch starts: menu items are walked in `id` order. */
export type MenuMatchCursor = { readonly lastMenuItemId: string };

type MenuItemRow = {
  readonly id: string;
  readonly menu_item_name: string;
  readonly menu_item_description: string | null;
  readonly detected_item_type: string | null;
  readonly search_name: string | null;
};

/* -------------------------------------------------------------------------- */
/* The seam back onto MenuScanActor (§8.5: job → entity)                       */
/* -------------------------------------------------------------------------- */

export type SuggestionRecorder = (
  ctx: Ctx,
  menuScanId: string,
  input: RecordSuggestionsInput,
) => Promise<RecordSuggestionsResult>;

export const daprRecordSuggestions: SuggestionRecorder = (
  ctx,
  menuScanId,
  input,
) =>
  internal(ctx)(MenuScanActorDescriptor, menuScanId).recordSuggestions(input);

/* -------------------------------------------------------------------------- */
/* Reading a scanned line                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The scanned type: `detected_item_type`, or `unknown` when it is missing or
 * not a value the CHECK allows (which a row from another write path could, in
 * principle, still carry).
 */
export const scannedTypeOf = (
  row: Pick<MenuItemRow, "detected_item_type">,
): ScannedItemType => {
  const detected = row.detected_item_type;
  if (detected !== null && isScannedItemType(detected)) return detected;
  return "unknown";
};

/** The phrase the vector search is run with. */
export const searchTextOf = (
  row: Pick<MenuItemRow, "search_name" | "menu_item_name">,
): string => {
  const normalised = row.search_name?.trim() ?? "";
  return normalised !== "" ? normalised : row.menu_item_name.trim();
};

/* -------------------------------------------------------------------------- */
/* The actor                                                                   */
/* -------------------------------------------------------------------------- */

export class MenuMatchJobActor
  extends JobActor<MenuMatchCursor, MenuMatchJobPayload>
  implements JobActorInterface<MenuMatchJobPayload>, InternalJobActorInterface
{
  static override readonly category: ActorCategory =
    MenuMatchJobActorDescriptor.category;

  protected readonly kind = MENU_MATCH_JOB_KIND;

  readonly #search: MenuSearcher;
  readonly #verify: MenuMatchVerifier;
  readonly #record: SuggestionRecorder;

  constructor(
    daprClient: DaprClient,
    id: ActorId,
    db: DbOrTx = actorDb(),
    search: MenuSearcher = daprMenuSearcher,
    verify: MenuMatchVerifier = menuMatchVerifier(),
    record: SuggestionRecorder = daprRecordSuggestions,
  ) {
    super(daprClient, id, db);
    this.#search = search;
    this.#verify = verify;
    this.#record = record;
  }

  /**
   * **`system` only.** This job is started by exactly one thing: the outbox
   * row `MenuScanActor.match` writes, at a job id derived from the scan
   * (§8.5). It used to inherit `JobActor.start`'s old rule — refuse anonymous,
   * admit everyone else — so any signed-in user who could reach the actor id
   * could start a matching run over someone else's scan, and have it make
   * paid model calls. `services/api`'s actor-surface registry already
   * described it as system-only; now it is.
   */
  protected authorizeStart(ctx: Ctx): void {
    requireSystem(
      ctx,
      "MenuMatchJobActor.start is delivered by the outbox from " +
        "MenuScanActor.match; it is not callable from a request (§8.5)",
    );
  }

  protected async processBatch(
    ctx: Ctx,
    { cursor, payload }: BatchInput<MenuMatchCursor, MenuMatchJobPayload>,
  ): Promise<BatchOutcome<MenuMatchCursor>> {
    const menuScanId = payload.menuScanId;
    if (typeof menuScanId !== "string" || menuScanId === "") {
      throw new ValidationError(
        "a menu-match job's payload must carry `menuScanId`",
      );
    }

    // `place_menu_items` belongs to `PlaceActor` (§1.2). A job actor reads any
    // table (§1.1) but caches none of it — this is a fresh query every batch,
    // which also means a scan whose menu items arrive late (the outbox row for
    // `addMenuFromScan` still in flight) is simply matched on a later run.
    const after = cursor?.lastMenuItemId ?? null;
    const { rows } = await this.db.execute<MenuItemRow>(sql`
      select id, menu_item_name, menu_item_description,
             detected_item_type, search_name
      from public.place_menu_items
      where menu_scan_id = ${menuScanId}::uuid
        and (${after}::uuid is null or id > ${after}::uuid)
      order by id asc
      limit ${MENU_MATCH_BATCH_SIZE}
    `);

    if (rows.length === 0) {
      return { cursor: null, processed: 0, done: true };
    }

    const suggestions: RecordedSuggestion[] = [];
    for (const row of rows) {
      suggestions.push(...(await this.#matchOne(ctx, row)));
    }

    await this.#record(ctx, menuScanId, {
      placeMenuItemIds: rows.map((row) => row.id),
      suggestions,
    });

    const last = rows.at(-1);
    return {
      cursor: last === undefined ? null : { lastMenuItemId: last.id },
      processed: rows.length,
      done: rows.length < MENU_MATCH_BATCH_SIZE,
    };
  }

  /** One menu line: route, search, band, verify. */
  async #matchOne(
    ctx: Ctx,
    row: MenuItemRow,
  ): Promise<readonly RecordedSuggestion[]> {
    const itemType = scannedTypeOf(row);
    const searchText = searchTextOf(row);
    if (searchText === "") return [];

    const route = routeFor(itemType, searchText);
    const candidates = (
      route.kind === "RECIPE"
        ? (await this.#search.searchRecipes(ctx, route.input)).map(
            recipeHitToCandidate,
          )
        : (await this.#search.searchItems(ctx, route.input)).map(
            itemHitToCandidate,
          )
    )
      .filter((candidate) => bandOf(candidate.similarity) !== "drop")
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, MENU_MATCH_MAX_CANDIDATES);

    const best = candidates[0];
    if (best === undefined) return [];

    const metrics = (
      candidate: MenuMatchCandidate,
    ): Record<string, unknown> => ({
      vectorSimilarity: candidate.similarity,
      route: route.kind,
      searchText,
      scanItemType: itemType,
    });

    if (bandOf(best.similarity) === "auto") {
      // Confident enough that §2.1 does not spend a model call on it.
      return candidates
        .filter((candidate) => bandOf(candidate.similarity) === "auto")
        .map((candidate) => ({
          placeMenuItemId: row.id,
          target: candidate.target,
          confidenceScore: candidate.similarity,
          matchReasoning: `vector similarity ${candidate.similarity.toFixed(
            2,
          )} >= ${MATCH_AUTO_CONFIDENCE} (${route.kind.toLowerCase()} search)`,
          similarityMetrics: metrics(candidate),
        }));
    }

    // §2.1's 0.4–0.9 band: ambiguous, so ask the model which one — if any.
    const verification = await this.#verify(ctx, {
      placeMenuItemId: row.id,
      menuItemName: row.menu_item_name,
      menuItemDescription: row.menu_item_description,
      itemType,
      candidates: candidates.map(({ key, name, similarity }) => ({
        key,
        name,
        similarity,
      })),
    });
    if (verification.acceptedKey === null) return [];
    const chosen = candidates.find(
      (candidate) => candidate.key === verification.acceptedKey,
    );
    if (chosen === undefined) {
      /*
       * `ConflictError`, not `ValidationError` — and the difference is the
       * whole lifetime of the batch.
       *
       * `OutboxActor.isPermanentFailure` dead-letters `VALIDATION` on the
       * first attempt, and says exactly what earns that: "the one code whose
       * own definition is 'input the actor rejected before touching the
       * database' — a pure function of a payload that, in an `outbox` row, is
       * frozen". The payload here is frozen; the *answer* is not. This branch
       * fires when a model hallucinated a candidate key, which is the textbook
       * transient, and the same batch re-asked will usually get a real one. A
       * `ValidationError` spent the retries this failure is most likely to
       * survive.
       *
       * `lib/ai/seams.ts`'s `providerMenuMatchVerifier` detects the identical
       * condition and already throws `ConflictError`, so with the shipped
       * verifier this check never fires at all — it is the backstop for an
       * injected one. That made the inconsistency cheap to miss and does not
       * make it less wrong: the backstop must classify the failure the same
       * way the seam does, or a non-default verifier gets a permanently dead
       * row for a fault the default one retries out of.
       */
      throw new ConflictError(
        `the match verifier answered with '${verification.acceptedKey}', ` +
          `which was not one of the candidates offered for menu item ${row.id}`,
      );
    }
    return [
      {
        placeMenuItemId: row.id,
        target: chosen.target satisfies MatchSuggestionTarget,
        confidenceScore: verification.confidence,
        matchReasoning: verification.reasoning,
        similarityMetrics: {
          ...metrics(chosen),
          verifiedBy: verification.model,
          verifiedConfidence: verification.confidence,
        },
      },
    ];
  }
}
