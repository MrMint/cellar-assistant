/**
 * The two AI seams the menu-scan pipeline needs — B8.
 *
 * Same shape and same reason as `item-defaults.ts` (B2) and
 * `google-places.ts` (B5): `services/actors` has no AI provider wired, so what
 * lives here is a *type* plus an injectable implementation whose default
 * **throws loudly rather than faking success**. A stub that returned an empty
 * extraction would mark a scan `completed` with zero items and no error, which
 * is the worst possible failure for a pipeline whose whole output is a list.
 *
 * ## Two seams, because they run in two different actors
 *
 * | seam | runs in | why there |
 * |---|---|---|
 * | `MenuExtractionProvider` | `MenuScanActor.process` | §2.1 puts extraction on the scan aggregate, and the scan id confines the wait to one scan — B2's `ItemOnboardingActor` argument exactly |
 * | `MenuMatchVerifier` | `MenuMatchJobActor.processBatch` | §8.5: the matching pass may not run in an entity actor's turn *and* may not call a search actor from one, so it is a job |
 *
 * ## The verifier is reached only for an ambiguous candidate
 *
 * §2.1 asks for AI verification "in the 0.4–0.9 band" (`bandOf` in
 * `@cellar-assistant/contracts`). A candidate at or above `0.9` is suggested
 * without a model call and one below `0.4` is dropped without one, so a
 * deployment with no verifier configured still matches the confident half of a
 * menu — the batch fails only when a genuinely ambiguous line needs a second
 * opinion. That is the intended behaviour: the outbox retries the batch, and
 * the failure names the missing configuration.
 *
 * Nothing here is called by any test. `menu-scan-actor.test.ts` and
 * `menu-match-job-actor.test.ts` inject fakes and additionally assert that
 * both defaults throw.
 */
import type { Ctx, ScannedItemType } from "@cellar-assistant/contracts";
import { ConflictError } from "@cellar-assistant/contracts";

/* -------------------------------------------------------------------------- */
/* Vision extraction                                                           */
/* -------------------------------------------------------------------------- */

export type MenuExtractionRequest = {
  readonly menuScanId: string;
  /** `files.id` of the photo, already verified by `FileActor`. */
  readonly originalImageId: string;
  readonly processedImageId: string | null;
  /** The place the scan is filed against, when one is known. Prompt context. */
  readonly placeId: string | null;
};

/**
 * One line the model read off the menu.
 *
 * `searchName` is the pipeline's existing `search_name`: the AI-normalised
 * name the matcher searches with, as distinct from the menu's own wording
 * ("Ch. Margaux '15 — glass" vs "Château Margaux 2015"). It is stored in
 * `place_menu_items.search_name` (the Nhost pipeline kept it in
 * `extracted_attributes`; `20260928182317_place_menu_items_scan_columns`
 * moved it).
 */
export type ExtractedMenuLine = {
  readonly name: string;
  readonly description?: string | null;
  readonly price?: number | null;
  readonly menuCategory?: string | null;
  readonly itemType: ScannedItemType;
  readonly searchName?: string | null;
  /** 0–1, the model's confidence in *this line*, not in the page. */
  readonly confidence?: number | null;
  /** Anything else the prompt produced; merged into `extracted_attributes`. */
  readonly attributes?: Record<string, unknown> | null;
};

export type MenuExtractionResult = {
  readonly lines: readonly ExtractedMenuLine[];
  /** Verbatim, into `menu_scans.extracted_text`. */
  readonly rawText: string;
  /** Into `menu_scans.processing_model`. */
  readonly model: string;
  /** 0–1, into `menu_scans.confidence_score` (`numeric(3,2)`). */
  readonly confidence: number;
  /** Into `menu_scans.processing_duration_ms`. */
  readonly durationMs?: number | null;
  /**
   * **The model's answer to "is this a menu at all" (B8c).**
   *
   * `lines: []` alone cannot carry this, because it conflates two different
   * scans: a photograph of a wall, and a real menu the model could not read a
   * single line off. Both end `completed` with nothing filed — that part is
   * right, and `processing_status` deliberately has no fifth value for it
   * (`menu_scans_processing_status_check` allows four) — but only one of them
   * should ever be phrased to the user as "we could not find a menu in this
   * photo".
   *
   * Required rather than optional, so that a second extraction provider has to
   * answer the question rather than inherit a default. The honest answer when
   * a provider genuinely cannot tell is `false`: it claims a menu was looked
   * for, not that none was there.
   *
   * Note the polarity against the model's own field, which is the positive
   * `menuIsLegible`. That is deliberate and measured — `MENU_EXTRACTION_SCHEMA`
   * §3 has a real menu the model read correctly and then declared absent, when
   * the field it was handed was named for the absence. The inversion happens
   * once, in `providerMenuExtraction`.
   */
  readonly noMenuDetected: boolean;
  /**
   * The model's one-sentence account of what it could actually see — "A solid
   * grey image." for the 1×1 pixel that started B8c.
   *
   * Its first job is inside the schema rather than out here: forcing the model
   * to ground itself before it answers the verdict is what makes the
   * abstention reachable at all (`MENU_EXTRACTION_SCHEMA` §2). Carrying it out is
   * the cheap part, and it is the sentence a "we could not find a menu in this
   * photo" message would want to quote. Nothing writes it to a column: there
   * isn't one, and `menu_scans.extracted_text` is not it — that renders to the
   * user under "What the scanner read", and this is not something the scanner
   * read.
   */
  readonly imageDescription: string | null;
};

export type MenuExtractionProvider = (
  ctx: Ctx,
  request: MenuExtractionRequest,
) => Promise<MenuExtractionResult>;

/**
 * `ConflictError`, not a bare `Error`: a missing provider is a *state* problem,
 * so the API reports "this cannot be done right now" rather than `INTERNAL`,
 * and the outbox retries the delivery instead of dead-lettering it on the
 * first attempt.
 */
export const unconfiguredMenuExtraction: MenuExtractionProvider = async () => {
  throw new ConflictError(
    "no AI provider is configured for menu scanning. `MenuScanActor.process` " +
      "cannot extract menu lines until AI_PROVIDER is set — `installAI()` " +
      "installed nothing at boot. Set AI_PROVIDER=ollama for a local model that " +
      `needs no credentials. See services/actors/README.md · Local AI.`,
  );
};

let extraction: MenuExtractionProvider = unconfiguredMenuExtraction;

export const setMenuExtractionProvider = (
  next: MenuExtractionProvider,
): void => {
  extraction = next;
};

export const menuExtractionProvider = (): MenuExtractionProvider => extraction;

/* -------------------------------------------------------------------------- */
/* Match verification                                                          */
/* -------------------------------------------------------------------------- */

/** One thing the vector search proposed, as the verifier sees it. */
export type MenuMatchCandidateSummary = {
  /** Opaque to the model; echoed back as `acceptedKey`. */
  readonly key: string;
  readonly name: string;
  /** 0–1, `similarityFromDistance` of the vector distance. */
  readonly similarity: number;
};

export type MenuMatchVerificationRequest = {
  readonly placeMenuItemId: string;
  readonly menuItemName: string;
  readonly menuItemDescription: string | null;
  readonly itemType: ScannedItemType;
  readonly candidates: readonly MenuMatchCandidateSummary[];
};

export type MenuMatchVerification = {
  /** `null` means "none of these", which is a verification too. */
  readonly acceptedKey: string | null;
  /** 0–1. Replaces the vector similarity on the stored suggestion. */
  readonly confidence: number;
  /** Into `item_match_suggestions.match_reasoning`. */
  readonly reasoning: string;
  readonly model: string;
};

export type MenuMatchVerifier = (
  ctx: Ctx,
  request: MenuMatchVerificationRequest,
) => Promise<MenuMatchVerification>;

export const unconfiguredMenuMatchVerifier: MenuMatchVerifier = async () => {
  throw new ConflictError(
    "no AI provider is configured to verify an ambiguous menu match " +
      "(migration plan §2.1: the 0.4–0.9 confidence band). AI_PROVIDER is unset, " +
      "so `installAI()` installed nothing at boot. Confident matches (>= 0.9) " +
      `and clear misses (< 0.4) are still decided without it. See services/actors/README.md · Local AI.`,
  );
};

let verifier: MenuMatchVerifier = unconfiguredMenuMatchVerifier;

export const setMenuMatchVerifier = (next: MenuMatchVerifier): void => {
  verifier = next;
};

export const menuMatchVerifier = (): MenuMatchVerifier => verifier;
