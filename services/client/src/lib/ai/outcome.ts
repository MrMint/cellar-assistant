/**
 * The one mapper from an AI failure to what a person reads — N07.
 *
 * Before this, each AI surface rendered `error.message`, which is the actor's
 * English written for an operator: "no AI provider is configured … Set
 * AI_PROVIDER=ollama for a local model …" reached the add-bottle form as-is.
 * The API now says *which* outcome it was (`reason`, plus `retryAt` on a
 * budget refusal), so the words are chosen here, from a closed set, and
 * `message` is never shown for an AI failure.
 *
 * Pure: no React, no clock of its own (the caller passes `now`), no locale of
 * its own (the caller passes one, or the runtime's is used) — so the
 * migration to new markup only swaps the component that renders an
 * {@link AiOutcome}, and the table below is unit-tested as data.
 */
import type { ActorErrorCode, ActorErrorReason } from "@/lib/api/errors";

/** The part of an `ApiFailure` (or a stored status) this needs. */
export type AiFailureLike = {
  readonly code: ActorErrorCode | "TRANSPORT" | "UNKNOWN" | null;
  readonly reason: ActorErrorReason | null;
  readonly retryAt?: string | null;
};

/**
 * What kind of outcome it was, for a caller that branches — say, to hide a
 * retry button for `unavailable` — without comparing strings.
 */
export type AiOutcomeKind =
  /** The deployment cannot do this at all; nothing to retry. */
  | "unavailable"
  /** This account's allowance for now; clears on its own. */
  | "user-cap"
  /** The service's allowance; clears when the month turns, or by an operator. */
  | "service-budget"
  /** The model found nothing to read in what it was given. */
  | "nothing-read"
  /** No answer arrived; asking again can work. */
  | "retryable"
  /** The input was refused; a different input may work. */
  | "rejected";

export type AiOutcome = {
  readonly kind: AiOutcomeKind;
  readonly title: string;
  readonly message: string;
  /** Echoed for a caller that schedules its own retry. */
  readonly retryAt: string | null;
  /** Whether "try again" (same input) is worth offering. */
  readonly canRetry: boolean;
  /** Joy colour the status renders in; never "danger" for a limit. */
  readonly tone: "neutral" | "warning" | "danger";
};

export type AiOutcomeOptions = {
  /**
   * What the person can do instead when the feature is not available here —
   * "fill in the details yourself", "search by name or scan a barcode". Ends
   * the `unavailable` and `nothing-read` messages when given.
   */
  readonly fallback?: string;
  /**
   * What the person handed over, for the one message that names it: a
   * refused `photo` (the default) or a refused text `search`. A search box
   * must never answer "That photo couldn't be used".
   */
  readonly subject?: "photo" | "search";
  /** For `retryAt` phrasing; defaults to the current instant. */
  readonly now?: Date;
  /** For `retryAt` phrasing; defaults to the runtime's. */
  readonly locale?: string;
  /** For `retryAt` phrasing; defaults to the runtime's. */
  readonly timeZone?: string;
};

const sentence = (text: string): string =>
  text.length === 0 ? text : `${text[0]?.toUpperCase() ?? ""}${text.slice(1)}`;

/**
 * "after 3:40 PM", "tomorrow after 9:00 AM", or "after Nov 1" — the shortest
 * phrase that is still right. `null` for a missing, unparseable or past time.
 */
export const retryPhrase = (
  retryAt: string | null | undefined,
  options: Pick<AiOutcomeOptions, "now" | "locale" | "timeZone"> = {},
): string | null => {
  if (retryAt === null || retryAt === undefined) return null;
  const at = new Date(retryAt);
  const now = options.now ?? new Date();
  if (Number.isNaN(at.getTime()) || at.getTime() <= now.getTime()) return null;

  const zone =
    options.timeZone === undefined ? {} : { timeZone: options.timeZone };
  const day = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...zone,
  });
  const time = new Intl.DateTimeFormat(options.locale, {
    hour: "numeric",
    minute: "2-digit",
    ...zone,
  }).format(at);
  const tomorrow = new Date(now.getTime() + 86_400_000);
  if (day.format(at) === day.format(now)) return `after ${time}`;
  if (day.format(at) === day.format(tomorrow)) return `tomorrow after ${time}`;
  const date = new Intl.DateTimeFormat(options.locale, {
    month: "short",
    day: "numeric",
    ...zone,
  }).format(at);
  return `after ${date}`;
};

/**
 * The outcome for an AI failure. Branches on `reason` first, then `code`,
 * never on the message (`lib/api/result.ts`'s rule).
 */
export const aiOutcome = (
  failure: AiFailureLike,
  options: AiOutcomeOptions = {},
): AiOutcome => {
  const retryAt = failure.retryAt ?? null;
  const when = retryPhrase(retryAt, options);
  const instead =
    options.fallback === undefined ? "" : ` You can ${options.fallback}.`;

  switch (failure.reason) {
    case "AI_UNCONFIGURED":
    case "IMAGE_SEARCH_UNAVAILABLE":
      return {
        kind: "unavailable",
        title: "Not available right now",
        message: `This isn't available here right now.${instead}`,
        retryAt: null,
        canRetry: false,
        tone: "neutral",
      };
    case "USER_CAP":
      return {
        kind: "user-cap",
        title: "You've reached your limit for now",
        message:
          when === null
            ? `You can try again a little later.${instead}`
            : `${sentence(`you can try again ${when}`)}.${instead}`,
        retryAt,
        canRetry: false,
        tone: "warning",
      };
    case "SERVICE_BUDGET":
      return {
        kind: "service-budget",
        title: "Taking a break",
        message:
          when === null
            ? `AI features are paused for now. Try again later.${instead}`
            : `AI features are paused for now. Try again ${when}.${instead}`,
        retryAt,
        canRetry: false,
        tone: "warning",
      };
    case "NOTHING_READ":
      return {
        kind: "nothing-read",
        title: "Nothing to read",
        message: `We couldn't read anything in that photo. Try a closer, sharper shot.${instead}`,
        retryAt: null,
        canRetry: false,
        tone: "neutral",
      };
    default:
      break;
  }

  switch (failure.code) {
    case "BUDGET_EXCEEDED":
      // An older API, or a budget refusal with no reason: service-wide is the
      // honest default — nothing says it was this account.
      return aiOutcome({ ...failure, reason: "SERVICE_BUDGET" }, options);
    case "VALIDATION":
      return {
        kind: "rejected",
        title: "That didn't work",
        message:
          options.subject === "search"
            ? "That search couldn't be run. Try different words."
            : `That photo couldn't be used. Try a different one.${instead}`,
        retryAt: null,
        canRetry: false,
        tone: "danger",
      };
    default:
      return {
        kind: "retryable",
        title: "That didn't go through",
        message: `Try again in a moment.${instead}`,
        retryAt: null,
        canRetry: true,
        tone: "danger",
      };
  }
};
