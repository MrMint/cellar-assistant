/**
 * X27 / D28 — what a place under review looks like, as plain data.
 *
 * A place someone adds is saved at once as PENDING: on their own map with
 * "Under review", on nobody else's. The AI review then shares it (APPROVED)
 * or keeps it to them with a reason (REJECTED), which they can fix with Edit
 * (sent for review again) or remove with Delete. Everything the UI decides
 * about that — the words, which controls show, when to keep checking, what to
 * say when the verdict lands — lives here, so it is tested once and every
 * surface (the place page, the map drawer, search results, the pin) says the
 * same thing.
 */

export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

export const isReviewStatus = (value: unknown): value is ReviewStatus =>
  value === "PENDING" || value === "APPROVED" || value === "REJECTED";

/** Only the person who added it can see a place in either of these states. */
export const isUnshared = (
  status: ReviewStatus | null | undefined,
): status is "PENDING" | "REJECTED" =>
  status === "PENDING" || status === "REJECTED";

export type ReviewBadge = {
  readonly label: string;
  /** For a screen reader: what the badge means, not just what it says. */
  readonly description: string;
  readonly tone: "pending" | "rejected";
};

/** The chip an unshared place carries; nothing for a shared one. */
export const reviewBadge = (
  status: ReviewStatus | null | undefined,
): ReviewBadge | null => {
  if (status === "PENDING") {
    return {
      label: "Under review",
      description: "Under review — only you can see this place for now",
      tone: "pending",
    };
  }
  if (status === "REJECTED") {
    return {
      label: "Not approved",
      description: "Not approved — only you can see this place",
      tone: "rejected",
    };
  }
  return null;
};

/** The pin's second label line, so the map says it as well as the drawer. */
export const reviewPinLabel = (
  status: ReviewStatus | null | undefined,
): string | null => reviewBadge(status)?.label ?? null;

/** The panel's explanation under the badge, by state. */
export const reviewExplanation = (
  status: "PENDING" | "REJECTED",
  rejectionReason: string | null | undefined,
): string =>
  status === "PENDING"
    ? "Saved. Only you can see it until it's been checked; then it's on " +
      "everyone's map."
    : (rejectionReason?.trim() ||
        "This place couldn't be confirmed as a real venue.") +
      " Only you can see it. Edit it to send it for review again, or delete it.";

/* -------------------------------------------------------------------------- */
/* Waiting for the verdict                                                     */
/* -------------------------------------------------------------------------- */

/** How often the place page re-reads a pending place. */
export const REVIEW_POLL_INTERVAL_MS = 4_000;
/**
 * How long it keeps asking. A review is one short model call, so a place
 * still pending after this is waiting on something a page cannot hurry (no
 * provider, a retry backoff) — the page stops polling and keeps the calm
 * "Under review" state rather than spinning.
 */
export const REVIEW_POLL_LIMIT_MS = 90_000;

export const shouldPollReview = (
  status: ReviewStatus | null | undefined,
  startedAtMs: number,
  nowMs: number,
): boolean =>
  status === "PENDING" && nowMs - startedAtMs < REVIEW_POLL_LIMIT_MS;

/**
 * What to tell the creator when the verdict lands while they watch — and
 * only then: a change from PENDING to a decision. Anything else (first load,
 * a re-read with no change) says nothing.
 */
export const reviewVerdictNotice = (
  before: ReviewStatus | null | undefined,
  after: ReviewStatus | null | undefined,
): { message: string; tone: "success" | "error" } | null => {
  if (before !== "PENDING" || after === before) return null;
  if (after === "APPROVED") {
    return {
      message: "Approved — it's on the map for everyone",
      tone: "success",
    };
  }
  if (after === "REJECTED") {
    return { message: "Not approved — see why below", tone: "error" };
  }
  return null;
};

/* -------------------------------------------------------------------------- */
/* Suggestions                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The "also tagged as …" chips: the review's suggestions minus anything the
 * place already has (an optimistic accept may not have reached the server's
 * list yet) and minus what the creator just took.
 */
export const visibleSuggestions = (
  suggested: readonly string[],
  categories: readonly string[],
  taken: ReadonlySet<string>,
): string[] =>
  suggested.filter(
    (category, index) =>
      !categories.includes(category) &&
      !taken.has(category) &&
      suggested.indexOf(category) === index,
  );
