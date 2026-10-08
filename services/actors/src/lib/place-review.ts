/**
 * The AI place review's seam — what a reviewer is handed, what it owes, and
 * how its verdict becomes columns (X27).
 *
 * This used to live in `actors/place-creation-actor.ts`, because the review ran
 * inside `PlaceCreationActor.createPlace` while the user stared at the form
 * (§8.5's request-driven exception; N09 then bounded it at ~8 s). X27 / D28
 * moved it out of the turn: the place is inserted `pending` and visible to its
 * creator only, and `PlaceReviewActor` runs the review from the outbox. Two
 * actors and the AI installer need these definitions now, so they are here;
 * `place-creation-actor.ts` re-exports them so older imports keep working.
 *
 * ## The rule that did not move: never an approval nobody made
 *
 * `unconfiguredPlaceReviewer` **throws**. A review that throws, times out,
 * returns no verdict, or cannot run at all leaves the place `pending` —
 * creator-only — exactly as D28 asks ("a rejected or unreviewed place is
 * creator-only and pending"). Before X27 that same failure produced
 * `review: null` and a *shared* place at the neutral confidence; that path is
 * gone, which is the point of the change.
 */
import type { Ctx, LngLat, PlaceReview } from "@cellar-assistant/contracts";
import { ConflictError, isLngLat } from "@cellar-assistant/contracts";
import { isPlaceCategory } from "@cellar-assistant/contracts/place-categories";

/**
 * What the AI review is handed — `functions/reviewUserPlace`'s request body,
 * field for field (checked against `a5b90784^`), with two shape changes and no
 * content changes: the pair `latitude`/`longitude` is this stack's `LngLat`,
 * and the names are camelCase. `postcode` and `email` are absent here because
 * they were absent there — the review judges what a stranger could recognise
 * the venue by, and a postcode adds nothing to that judgement.
 */
export type PlaceReviewSubject = {
  readonly name: string;
  readonly categories: readonly string[];
  readonly location: LngLat;
  readonly streetAddress: string | null;
  readonly locality: string | null;
  readonly region: string | null;
  readonly countryCode: string | null;
  readonly phone: string | null;
  readonly website: string | null;
  readonly description: string | null;
};

/**
 * `signal`, when given, fires when the caller stops waiting: a reviewer should
 * hand it to the model call so the request is cancelled rather than left
 * running and metered. An aborted review rejects — which leaves the place
 * `pending`, never approved.
 */
export type PlaceReviewer = (
  ctx: Ctx,
  subject: PlaceReviewSubject,
  signal?: AbortSignal,
) => Promise<PlaceReview>;

/**
 * What a reviewer owes before it calls anything, whichever model is behind it.
 *
 * Every row `PlaceReviewActor` reviews passed `PlaceActor.create`'s (or
 * `editUnshared`'s) validation, so this never fires from the delivery. It is
 * here for the reason `requireExtractableInput` is in `./item-defaults.ts`:
 * the precondition belongs to the *seam*, not to one implementation. "Review
 * this place" over a blank name and no categories is not a hard question, it
 * is an empty one — and a model asked an empty question does not abstain, it
 * invents a venue and returns a verdict on it (measured, for the item-defaults
 * seam: a Château d'Yquem, vintage and all, from no input whatsoever). The old
 * `reviewUserPlace` answered the same case with a 400; this is that 400,
 * moved to where every caller passes through it.
 */
export const requirePlaceReviewSubject = (
  subject: PlaceReviewSubject,
): void => {
  const problems: string[] = [];
  if (subject.name.trim() === "") problems.push("a name");
  if (subject.categories.length === 0) problems.push("at least one category");
  if (!isLngLat(subject.location)) problems.push("a location");
  if (problems.length === 0) return;
  throw new ConflictError(
    `this place submission cannot be reviewed: it is missing ${problems.join(
      ", ",
    )}. A review is a judgement about a specific venue; asked about nothing, ` +
      "a model returns a confident verdict on a venue it made up rather than " +
      "declining — see requireExtractableInput in lib/item-defaults.ts.",
  );
};

/** The `reason` an unconfigured reviewer throws with. */
export const AI_UNCONFIGURED = "AI_UNCONFIGURED";

/**
 * What a caller reaches when no AI provider is configured. Throws.
 *
 * Running with `AI_PROVIDER` unset is a supported state, not a broken one: the
 * host starts, places are still created, and every AI feature fails naming
 * itself rather than producing something plausible. For a place that means it
 * stays `pending` — saved, on its creator's map with "Under review", and on
 * nobody else's. `PlaceReviewActor` recognises this refusal by its reason and
 * does not throw it on to the outbox: no retry can configure a provider.
 *
 * (This used to say `services/actors` had no AI client and that a
 * `PlaceReviewer` had to be injected through the constructor. Both halves were
 * false by the time anyone read them — X1 delivered `lib/ai/`, and Dapr
 * constructs actors with `(daprClient, id)` alone, so there is no injection
 * site above the actor file. Together they were the whole of B5b: the default
 * was this stub, so AI place review threw on every production activation while
 * every test passed its own reviewer and stayed green.)
 */
export const unconfiguredPlaceReviewer: PlaceReviewer = async () => {
  throw new ConflictError(
    "no AI provider is configured to review a user-submitted place: " +
      "AI_PROVIDER is unset, so `installAI()` installed nothing at boot. Set " +
      "AI_PROVIDER=ollama for a local model that needs no credentials — see " +
      "services/actors/README.md · Local AI. Until then each new place stays " +
      "pending: visible to its creator, shared with nobody.",
    AI_UNCONFIGURED,
  );
};

/**
 * The installed reviewer, defaulting to the loud one above.
 *
 * The registry exists because a constructor cannot be reached: Dapr's
 * `ActorManager` builds every actor as `new ActorCls(daprClient, actorId)` and
 * offers no factory hook, so a constructor parameter's *default* is the only
 * wiring production ever sees. `installAI()` calls `setPlaceReviewer` at boot
 * when a provider is configured; a process that never calls it — every test
 * here, and any deployment with `AI_PROVIDER` unset — still gets
 * `unconfiguredPlaceReviewer` and still throws. This is
 * `tier-list-actor.ts`'s `InsightsGenerator` registry, exactly.
 */
let installedPlaceReviewer: PlaceReviewer = unconfiguredPlaceReviewer;

export const setPlaceReviewer = (next: PlaceReviewer): void => {
  installedPlaceReviewer = next;
};

export const placeReviewer = (): PlaceReviewer => installedPlaceReviewer;

/* -------------------------------------------------------------------------- */
/* From a verdict to columns                                                   */
/* -------------------------------------------------------------------------- */

/** The neutral starting confidence the AI review adjusts. */
export const BASE_CONFIDENCE = 0.5;
export const CONFIDENCE_FLOOR = 0.1;
export const CONFIDENCE_CEILING = 0.9;
/** `reviewUserPlace` clamps its own output to this; so does the actor. */
export const MAX_CONFIDENCE_ADJUSTMENT = 0.3;

const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, value));

/** `0.5 + adjustment`, both halves clamped, to two decimals for `numeric(3,2)`. */
export const confidenceFromReview = (review: PlaceReview | null): number => {
  if (review === null) return BASE_CONFIDENCE;
  const adjustment = Number.isFinite(review.confidenceAdjustment)
    ? clamp(
        review.confidenceAdjustment,
        -MAX_CONFIDENCE_ADJUSTMENT,
        MAX_CONFIDENCE_ADJUSTMENT,
      )
    : 0;
  return Number(
    clamp(
      BASE_CONFIDENCE + adjustment,
      CONFIDENCE_FLOOR,
      CONFIDENCE_CEILING,
    ).toFixed(2),
  );
};

/** At most this many "also tagged as …" chips. */
export const MAX_SUGGESTED_CATEGORIES = 4;

/**
 * The review's suggested categories, as the creator will be offered them:
 * in the one category list (`PLACE_CATEGORIES`, D15 — the review schema's
 * `enum` constrains a grammar-backed provider to it, and this holds every
 * other provider to the same list), not already on the place, de-duplicated, at
 * most {@link MAX_SUGGESTED_CATEGORIES}, in the model's order.
 *
 * Stored, not applied: `PlaceActor.acceptSuggestion` is the only way one
 * reaches `places.categories`, and only the creator can call it.
 */
export const suggestedCategoriesFrom = (
  review: PlaceReview,
  current: readonly string[],
): readonly string[] => {
  const out: string[] = [];
  for (const raw of review.suggestedCategories ?? []) {
    const category = raw.trim();
    if (!isPlaceCategory(category)) continue;
    if (current.includes(category) || out.includes(category)) continue;
    out.push(category);
    if (out.length === MAX_SUGGESTED_CATEGORIES) break;
  }
  return out;
};

/** The longest suggested description kept — the column's own bound. */
export const SUGGESTED_DESCRIPTION_MAX = 1000;

/**
 * The review's `enrichedDescription`, as an offer: trimmed, blank as none,
 * and only for a place that has no description of its own — a model's prose
 * is never offered *over* the creator's words.
 */
export const suggestedDescriptionFrom = (
  review: PlaceReview,
  currentDescription: string | null,
): string | null => {
  if (currentDescription !== null && currentDescription.trim() !== "") {
    return null;
  }
  const text = review.enrichedDescription?.trim() ?? "";
  if (text === "") return null;
  return text.slice(0, SUGGESTED_DESCRIPTION_MAX);
};

/** What a rejected creator reads when the model gave no reason of its own. */
export const DEFAULT_REJECTION_REASON =
  "This place couldn't be confirmed as a real venue. Check the name, " +
  "categories and address, then edit it to send it for review again.";

/** The reason a rejection carries: the model's, trimmed, or the default. */
export const rejectionReasonFrom = (review: PlaceReview): string => {
  const reason = review.rejectionReason?.trim() ?? "";
  return reason === "" ? DEFAULT_REJECTION_REASON : reason.slice(0, 500);
};
