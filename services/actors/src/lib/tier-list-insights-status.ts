/**
 * Where a tier list's generated insights stand — N07's `insightsStatus`.
 *
 * The client used to infer it: "no `aiInsights` and three or more entries"
 * meant "Generating Insights", polled eight times and then shown forever.
 * That was the wrong answer every time generation could not happen — no AI
 * provider, an exhausted budget, a dead-lettered delivery, entries too thin to
 * describe — and the client had no way to know. The actor does know, so it
 * says, and this is the rule it says it by: a pure function of the row, so
 * the whole table of outcomes is unit-tested without a database.
 *
 * The inputs are four timestamps the actor keeps (`tier_lists`):
 *
 *  - `requestedAt` — the content bump that enqueued a generation;
 *  - `generatedAt` — the last successful one;
 *  - `failedAt` — the last failed attempt, with its stored failure;
 *  - `retryAt` — when the next attempt can or will happen (a budget window,
 *    or the end of the once-a-day throttle).
 */
import type {
  ActorErrorReason,
  TierListInsightsStatus,
} from "@cellar-assistant/contracts";
import { parseStoredFailure } from "@cellar-assistant/contracts";

export type InsightsStatusInput = {
  /** Entries on the list now. */
  readonly itemCount: number;
  /** The fewest entries a generation will run on. */
  readonly minimumItems: number;
  /** Whether `aiInsights` holds an answer. */
  readonly hasInsights: boolean;
  /** Whether this process has an AI provider for insights at all. */
  readonly aiAvailable: boolean;
  readonly requestedAt: Date | null;
  readonly generatedAt: Date | null;
  readonly failedAt: Date | null;
  /** `insights_failure`, a stored failure (`CODE[REASON]: message`). */
  readonly failure: string | null;
  readonly retryAt: Date | null;
  /** For `retryAt` in the past, which is no longer worth reporting. */
  readonly now: Date;
};

export type InsightsStatus = {
  readonly status: TierListInsightsStatus;
  readonly failureReason: ActorErrorReason | null;
  readonly retryAt: string | null;
};

const after = (a: Date | null, b: Date | null): boolean =>
  a !== null && (b === null || a.getTime() > b.getTime());

const atOrAfter = (a: Date | null, b: Date | null): boolean =>
  a !== null && (b === null || a.getTime() >= b.getTime());

export const tierListInsightsStatus = (
  input: InsightsStatusInput,
): InsightsStatus => {
  const none = { failureReason: null, retryAt: null } as const;
  const future =
    input.retryAt !== null && input.retryAt.getTime() > input.now.getTime()
      ? input.retryAt.toISOString()
      : null;

  if (input.itemCount < input.minimumItems) {
    return { status: "NOT_ENOUGH_ENTRIES", ...none };
  }
  // No provider: earlier insights are still worth showing; otherwise nothing
  // will ever run here, and saying "generating" would be the original bug.
  if (!input.aiAvailable) {
    return { status: input.hasInsights ? "READY" : "UNAVAILABLE", ...none };
  }
  // The latest attempt failed: after the last success, and not superseded by
  // a newer request (a change since the failure asks again).
  if (
    after(input.failedAt, input.generatedAt) &&
    atOrAfter(input.failedAt, input.requestedAt)
  ) {
    return {
      status: "FAILED",
      failureReason:
        input.failure === null
          ? null
          : parseStoredFailure(input.failure).reason,
      retryAt: future,
    };
  }
  if (after(input.requestedAt, input.generatedAt)) {
    return { status: "PENDING", failureReason: null, retryAt: future };
  }
  if (input.hasInsights) return { status: "READY", ...none };
  return { status: "IDLE", ...none };
};
