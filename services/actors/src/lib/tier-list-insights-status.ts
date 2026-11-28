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
  /**
   * The once-a-day throttle (`INSIGHTS_THROTTLE_MS`): no generation runs
   * sooner than this after `generatedAt`, whatever asked for one.
   */
  readonly throttleMs: number;
  /** For `retryAt` in the past, which is no longer worth reporting. */
  readonly now: Date;
};

/**
 * How long a request may stay unanswered past the moment it was due before
 * it reads as `FAILED` rather than `PENDING`.
 *
 * A failure *inside* the generation is written down (`insights_failed_at`)
 * and reads as `FAILED` at once. One outside it is not: a delivery that
 * dead-letters before the generator runs, a host that dies mid-call, a
 * delivery timeout. Nothing then ever writes again, and the list said
 * "Generating Insights" for good — the N07 bug from the other side. The
 * outbox retries for roughly 17 minutes (2 s doubling to 512 s, nine
 * retries; `backoffMs`) before it dead-letters, so half an hour past due is
 * comfortably beyond any delivery still coming. A late success still wins:
 * it writes `generatedAt`, which reads `READY`; and the next change asks
 * again, which reads `PENDING`.
 */
export const INSIGHTS_PENDING_STALE_MS = 30 * 60_000;

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
  const now = input.now.getTime();
  // The throttle is known the moment a change lands, so a change inside it
  // reports when the refresh will run straight away — not "on the way" until
  // the first delivery has deferred itself and stored `retryAt`.
  const throttledUntil =
    input.generatedAt === null
      ? null
      : input.generatedAt.getTime() + input.throttleMs;
  const nextRun = Math.max(input.retryAt?.getTime() ?? 0, throttledUntil ?? 0);
  const future = nextRun > now ? new Date(nextRun).toISOString() : null;

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
    // Due when it was asked for, or when the throttle or a budget window
    // lets it run, whichever is later.
    const due = Math.max(input.requestedAt?.getTime() ?? 0, nextRun);
    if (now - due > INSIGHTS_PENDING_STALE_MS) {
      return { status: "FAILED", ...none };
    }
    return { status: "PENDING", failureReason: null, retryAt: future };
  }
  if (input.hasInsights) return { status: "READY", ...none };
  return { status: "IDLE", ...none };
};
