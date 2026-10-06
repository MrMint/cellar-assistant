/**
 * `MenuScanActor` and `MenuMatchJobActor` — B8 (migration plan §2.1, §1.4,
 * §8.5).
 *
 * > **`MenuScanActor(scanId)`**
 * > - Owns: `menu_scans`, `item_match_suggestions`.
 * > - Methods: `get`, `create(fileId, placeHint)`, `process` (system, outbox:
 * >   AI extraction, then `PlaceActor.addMenuFromScan`, then `match`), `match`
 * >   (system: vector match via `ItemSearchActor` / `RecipeSearchActor`, AI
 * >   verification in the 0.4–0.9 band), `actOnSuggestion`.
 * > - Visibility: scan owner only.
 * > - Replaces the `processing_status` event trigger, the HTTP shim
 * >   `onMenuScanComplete`, and the raw `fetch` from the server action.
 *
 * ## Two shapes §2.1 could not have anticipated
 *
 * 1. **`create(fileId, placeHint)` cannot be two scalars.** Every method here
 *    is reachable from a resolver and `process`/`match` are reachable from the
 *    outbox, whose payload is a JSON object (§1.4, and B4's finding that a
 *    bare scalar payload cannot be delivered at all). So every input below is
 *    an object, and the outbox-delivered ones are `Record<string, unknown>`-
 *    compatible by construction.
 * 2. **`match` may not call a search actor itself.** §8.5: "Entity actors
 *    never call collection, view, or search actors synchronously", and the
 *    outbox is one-way so it cannot carry an answer back. `match` therefore
 *    *starts* `MenuMatchJobActor`, which is a job actor and is on §8.5's
 *    "job → entity / registry / search" edge. See that actor's module doc.
 */
import type { ActorDescriptor } from "./actors.ts";
import type { Ctx } from "./ctx.ts";
import type {
  CompensationResult,
  DeadDeliveryNotice,
} from "./dead-delivery.ts";
import type { ItemRef } from "./items.ts";
import type { Page, PageArgs } from "./page.ts";
import type { PlaceMenuItemDto } from "./places.ts";

/* -------------------------------------------------------------------------- */
/* Enumerations                                                                */
/* -------------------------------------------------------------------------- */

/** `menu_scans.processing_status`, per its check constraint. */
export const MENU_SCAN_STATUSES = [
  "pending",
  "processing",
  "completed",
  "failed",
] as const;
export type MenuScanStatus = (typeof MENU_SCAN_STATUSES)[number];

export const isMenuScanStatus = (value: string): value is MenuScanStatus =>
  (MENU_SCAN_STATUSES as readonly string[]).includes(value);

/**
 * What the vision pass may call a line on a drinks menu.
 *
 * **This used to be deliberately wider than `MenuItemType`** — §2.1's pipeline
 * handles "wine, beer, spirit, coffee, sake, cocktail", while
 * `place_menu_items.detected_item_type`'s check constraint allowed only
 * `wine|beer|spirit|coffee|unknown`, so `MenuScanActor` wrote `unknown` for
 * the three types it could not spell and carried the real value in
 * `extracted_attributes.scanItemType` instead. B8b (migration plan) widened
 * the constraint to this exact list — `MenuItemType` is now defined in terms
 * of this type, not a narrower sibling of it — so `detected_item_type` holds
 * every value here directly. `20260928182317_place_menu_items_scan_columns`
 * backfilled the JSONB copy into the column and removed it, and the
 * AI-normalised search phrase moved out of the JSONB into
 * `place_menu_items.search_name` in the same change: both are columns, once.
 */
export const SCANNED_ITEM_TYPES = [
  "wine",
  "beer",
  "spirit",
  "coffee",
  "sake",
  "tea",
  "cocktail",
  "unknown",
] as const;
export type ScannedItemType = (typeof SCANNED_ITEM_TYPES)[number];

export const isScannedItemType = (value: string): value is ScannedItemType =>
  (SCANNED_ITEM_TYPES as readonly string[]).includes(value);

/* -------------------------------------------------------------------------- */
/* The confidence bands                                                        */
/* -------------------------------------------------------------------------- */

/**
 * §2.1: "AI verification in the 0.4–0.9 band."
 *
 * Confidence here is a *similarity*, not a distance: `1 - distance / 2` over
 * pgvector's cosine distance, which is the conversion the Nhost pipeline used
 * and the one `item_match_suggestions.confidence_score` (`numeric(3,2)`)
 * stores. Below `MIN` a candidate is dropped; at or above `AUTO` it is
 * suggested as-is; between the two it is put to the verifier.
 */
export const MATCH_MIN_CONFIDENCE = 0.4;
export const MATCH_AUTO_CONFIDENCE = 0.9;

/** Cosine distance (0–2) to the similarity the tables store. */
export const similarityFromDistance = (distance: number): number =>
  Math.max(0, Math.min(1, 1 - distance / 2));

/** The inverse, for handing a search actor a `maxDistance` cut-off. */
export const distanceFromSimilarity = (similarity: number): number =>
  Math.max(0, Math.min(2, 2 * (1 - similarity)));

export type MatchBand = "auto" | "verify" | "drop";

export const bandOf = (confidence: number): MatchBand => {
  if (confidence >= MATCH_AUTO_CONFIDENCE) return "auto";
  if (confidence >= MATCH_MIN_CONFIDENCE) return "verify";
  return "drop";
};

/* -------------------------------------------------------------------------- */
/* DTOs                                                                        */
/* -------------------------------------------------------------------------- */

export type MenuScanDto = {
  readonly id: string;
  readonly userId: string;
  /** The confirmed place, once one is known. */
  readonly placeId: string | null;
  readonly estimatedPlaceId: string | null;
  readonly manualPlaceOverride: string | null;
  /**
   * `manualPlaceOverride ?? placeId ?? estimatedPlaceId` — the place this scan
   * actually files its menu against. Derived, never stored.
   */
  readonly effectivePlaceId: string | null;
  readonly originalImageId: string;
  readonly processedImageId: string | null;
  readonly extractedText: string | null;
  readonly processingStatus: MenuScanStatus;
  readonly processingError: string | null;
  readonly confidenceScore: number | null;
  readonly processingModel: string | null;
  readonly processingDurationMs: number | null;
  readonly itemsDetected: number;
  readonly itemsMatched: number;
  readonly scannedAt: string | null;
  readonly processedAt: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
};

/**
 * Exactly one of the seven `suggested_*_id` columns
 * (`check_single_suggested_item`), collapsed.
 */
export type MatchSuggestionTarget =
  | { readonly kind: "ITEM"; readonly item: ItemRef }
  | { readonly kind: "RECIPE"; readonly recipeId: string };

export type MatchSuggestionDto = {
  readonly id: string;
  /** Derived through `place_menu_items.menu_scan_id`; §2.2 asks for it. */
  readonly menuScanId: string | null;
  readonly placeMenuItemId: string;
  /**
   * UI parity G20: `place_menu_items.place_id` — the place whose menu the
   * line is on, so `/discoveries` can say where without a `menuScan` read per
   * suggestion. Every producer already joins `place_menu_items`.
   */
  readonly placeId: string;
  readonly menuItemName: string;
  readonly target: MatchSuggestionTarget;
  readonly confidenceScore: number;
  readonly matchReasoning: string | null;
  readonly similarityMetrics: Record<string, unknown> | null;
  readonly accepted: boolean | null;
  readonly rejected: boolean | null;
  readonly actedBy: string | null;
  readonly actedAt: string | null;
  readonly createdAt: string | null;
};

/* -------------------------------------------------------------------------- */
/* Inputs and results                                                          */
/* -------------------------------------------------------------------------- */

export type MenuScanPlaceHint = {
  /** A place the user picked. Written to `menu_scans.place_id`. */
  readonly placeId?: string | null;
  /** A guess from the map. Written to `menu_scans.estimated_place_id`. */
  readonly estimatedPlaceId?: string | null;
  /** Where the photo was taken; `menu_scans.scan_location` (`geography`). */
  readonly location?: { readonly lng: number; readonly lat: number } | null;
};

export type CreateMenuScanInput = {
  /** A `files.id` that `FileActor` has verified. */
  readonly originalImageId: string;
  readonly processedImageId?: string | null;
  readonly placeHint?: MenuScanPlaceHint | null;
};

export type ProcessMenuScanResult = {
  readonly menuScanId: string;
  readonly status: MenuScanStatus;
  /** True when this delivery found the scan already extracted and did nothing. */
  readonly alreadyProcessed: boolean;
  readonly itemsDetected: number;
  /** The place the menu was filed against, if any. */
  readonly placeId: string | null;
  readonly reason: string;
};

export type MatchMenuScanResult = {
  readonly menuScanId: string;
  /** The `MenuMatchJobActor` id, deterministic in the scan id. */
  readonly jobId: string | null;
  readonly started: boolean;
  readonly reason: string;
};

/** One suggestion as `MenuMatchJobActor` hands it back. */
export type RecordedSuggestion = {
  readonly placeMenuItemId: string;
  readonly target: MatchSuggestionTarget;
  readonly confidenceScore: number;
  readonly matchReasoning?: string | null;
  readonly similarityMetrics?: Record<string, unknown> | null;
};

export type RecordSuggestionsInput = {
  /**
   * The menu items this batch covered — including the ones that matched
   * nothing, so a re-run can clear a stale pending suggestion rather than
   * leaving it behind.
   */
  readonly placeMenuItemIds: readonly string[];
  readonly suggestions: readonly RecordedSuggestion[];
};

export type RecordSuggestionsResult = {
  readonly menuScanId: string;
  readonly replaced: number;
  readonly created: number;
  /** `menu_scans.items_matched`, recomputed from rows rather than incremented. */
  readonly itemsMatched: number;
};

export const SUGGESTION_ACTIONS = ["ACCEPT", "REJECT"] as const;
export type SuggestionAction = (typeof SUGGESTION_ACTIONS)[number];

export type ActOnSuggestionInput = {
  readonly suggestionId: string;
  readonly action: SuggestionAction;
};

export type ActOnSuggestionResult = {
  readonly suggestion: MatchSuggestionDto;
  /**
   * True when the acceptance was propagated beyond `item_match_suggestions`
   * through an outbox row targeting `PlaceActor` — `verifyMenuItemMatch` for an
   * item of any type (`place_menu_items` has a column per type), or
   * `linkMenuItemRecipe` for a recipe (B8c).
   *
   * False for a rejection and for a repeat of an action already taken. (Also
   * for a `SAKE` or `TEA` until `place_menu_items` gained their columns in
   * `20260928043553_place_menu_items_sake_tea_matches`.)
   */
  readonly propagated: boolean;
};

/* -------------------------------------------------------------------------- */
/* MenuScanActor                                                               */
/* -------------------------------------------------------------------------- */

export type MenuScanActorInterface = {
  get(ctx: Ctx): Promise<MenuScanDto>;
  /** Paged (§1.5): a scanned menu can be hundreds of lines. */
  suggestions(ctx: Ctx, page: PageArgs): Promise<Page<MatchSuggestionDto>>;
  /**
   * UI parity G19 — every line this scan extracted (`place_menu_items` with
   * `menu_scan_id = this scan`), matched or not: the scan page groups them by
   * menu category, so the order is category (uncategorised last), then name,
   * then id. Scan owner only, exactly as `get`.
   */
  menuItems(ctx: Ctx, page: PageArgs): Promise<Page<PlaceMenuItemDto>>;
  create(ctx: Ctx, input: CreateMenuScanInput): Promise<MenuScanDto>;
  actOnSuggestion(
    ctx: Ctx,
    input: ActOnSuggestionInput,
  ): Promise<ActOnSuggestionResult>;
};

/**
 * Delivered by the outbox — never by a resolver, which cannot name them.
 * `process` and `match` used to sit on the public interface although both
 * refuse anything but a privileged ctx and no resolver ever called either;
 * a public method is one `services/api` can type a call to, so they are here.
 */
export type InternalMenuScanActorInterface = {
  /** `system`; delivered by the outbox. Idempotent on `processing_status`. */
  process(
    ctx: Ctx,
    input?: Record<string, unknown>,
  ): Promise<ProcessMenuScanResult>;
  /** `system`; delivered by the outbox. Idempotent on the derived job id. */
  match(
    ctx: Ctx,
    input?: Record<string, unknown>,
  ): Promise<MatchMenuScanResult>;
  /**
   * `process`'s `onDead`: the outbox gave up on this scan's extraction, so
   * the scan has failed. Enqueued by the drainer alone, in the statement that
   * dead-letters the `process` row — including on the reclaim path, where
   * `process` never got the turn to write `failed` itself. `system` only;
   * idempotent (a `completed` or `failed` scan is left alone).
   */
  markFailed(ctx: Ctx, notice: DeadDeliveryNotice): Promise<CompensationResult>;
  /** `system`; called by `MenuMatchJobActor` (job → entity, §8.5). */
  recordSuggestions(
    ctx: Ctx,
    input: RecordSuggestionsInput,
  ): Promise<RecordSuggestionsResult>;
};

export const MenuScanActorDescriptor: ActorDescriptor<
  MenuScanActorInterface,
  InternalMenuScanActorInterface
> = {
  actorType: "MenuScanActor",
  category: "entity",
  methods: {
    get: {},
    suggestions: {},
    menuItems: {},
    // Enqueues menu extraction, then match verification.
    create: { modelBacked: true },
    actOnSuggestion: {},
  },
  internalMethods: {
    process: {},
    match: {},
    markFailed: {},
    // One batch of suggestions from `MenuMatchJobActor`, in one transaction.
    recordSuggestions: { timeoutMs: 20_000 },
  },
};

/* -------------------------------------------------------------------------- */
/* MenuMatchJobActor                                                           */
/* -------------------------------------------------------------------------- */

/** `jobs.kind` for the matching chain. */
export const MENU_MATCH_JOB_KIND = "menu-match";

/** How many menu lines one batch matches. */
export const MENU_MATCH_BATCH_SIZE = 25;

/** How many candidates a single line is allowed to produce. */
export const MENU_MATCH_MAX_CANDIDATES = 3;

export type MenuMatchJobPayload = {
  readonly menuScanId: string;
};

/**
 * The Dapr actor type. Nothing in `services/api` may address this job actor
 * (§8.5 starts a job from an entity actor's outbox row, never from a resolver);
 * its descriptor, `MenuMatchJobActorDescriptor` in `./jobs.ts`, exists so the
 * actor host's registry can tie the class to its contract.
 */
export const MENU_MATCH_JOB_ACTOR_TYPE = "MenuMatchJobActor";

/** `MenuScanActor.match` derives the job id from the scan id (§8.4). */
export const MENU_MATCH_JOB_NAMESPACE = "menu-match";
