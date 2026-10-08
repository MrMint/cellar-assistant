/**
 * What the Insights tab shows for a list's `insightsStatus` — N07.
 *
 * The panel used to decide this itself: no `aiInsights` and three or more
 * entries meant a "Generating Insights" skeleton, polled eight times and then
 * left on screen for good. That was the wrong answer whenever generation
 * could not happen (no AI provider, a spent allowance, a dead-lettered
 * delivery), and the panel could not know. The server now says
 * (`TierList.insightsStatus`), and this turns the status into a view model.
 *
 * Every line is worded for whoever is looking — the creator, or a friend
 * reading a shared list — so none of them says "your" or asks for an edit
 * only the creator could make. (A per-user limit, the one outcome that is
 * about a person, only ever reaches the creator: the actor redacts it for
 * everyone else.)
 *
 * Pure — no React, no router — so the markup can change (the shadcn
 * migration) without touching the rules, and the rules are tested as data.
 */

import type { AiOutcome } from "@/lib/ai/outcome";
import { aiOutcome, retryPhrase } from "@/lib/ai/outcome";
import type { ActorErrorReason } from "@/lib/api/errors";

export type InsightsStatus =
  | "NOT_ENOUGH_ENTRIES"
  | "UNAVAILABLE"
  | "PENDING"
  | "FAILED"
  | "READY"
  | "IDLE";

/** The fewest entries insights run on (`MIN_GROUNDED_ENTRIES` server-side). */
export const MIN_INSIGHT_ENTRIES = 3;

/** A refresh further off than this is not worth polling for. */
const POLL_HORIZON_MS = 2 * 60_000;

export type InsightsViewInput = {
  /** `null` from an API older than N07 — derived the old way, but bounded. */
  readonly status: InsightsStatus | null;
  readonly failureReason: ActorErrorReason | null;
  readonly retryAt: string | null;
  readonly hasInsights: boolean;
  readonly itemCount: number;
};

export type InsightsView = {
  /** The skeleton card: only while an answer is genuinely on its way. */
  readonly generating: boolean;
  /** Whether the page should re-fetch to pick the answer up. */
  readonly poll: boolean;
  /** A status card in place of the skeleton (unavailable, a limit, a failure). */
  readonly notice: AiOutcome | null;
  /** One quiet line: what will happen next, when nothing is wrong. */
  readonly hint: string | null;
};

const quiet = (hint: string | null = null): InsightsView => ({
  generating: false,
  poll: false,
  notice: null,
  hint,
});

export const insightsView = (
  input: InsightsViewInput,
  options: { now?: Date; locale?: string; timeZone?: string } = {},
): InsightsView => {
  const now = options.now ?? new Date();
  const status = input.status ?? legacyStatus(input);

  switch (status) {
    case "NOT_ENOUGH_ENTRIES":
      return quiet(
        input.itemCount === 0
          ? null
          : `Insights appear once this list has at least ${MIN_INSIGHT_ENTRIES} entries.`,
      );
    case "UNAVAILABLE":
      return {
        ...quiet(),
        notice: {
          ...aiOutcome({ code: "CONFLICT", reason: "AI_UNCONFIGURED" }),
          title: "Insights aren't available here",
          message:
            "Your rankings and charts below still work; generated insights aren't offered on this server.",
        },
      };
    case "PENDING": {
      const at = input.retryAt === null ? null : Date.parse(input.retryAt);
      const soon = at === null || at - now.getTime() <= POLL_HORIZON_MS;
      const when = retryPhrase(input.retryAt, { ...options, now });
      if (input.hasInsights) {
        return {
          ...quiet(
            when === null
              ? "This list has changed. Updated insights are on the way."
              : `This list has changed. Insights refresh at most once a day; the next one is ${when}.`,
          ),
          poll: soon,
        };
      }
      return { generating: soon, poll: soon, notice: null, hint: null };
    }
    case "FAILED": {
      const outcome = aiOutcome(
        {
          code: null,
          reason: input.failureReason,
          retryAt: input.retryAt,
        },
        { ...options, now },
      );
      return {
        ...quiet(),
        notice:
          outcome.kind === "retryable" || outcome.kind === "rejected"
            ? {
                ...outcome,
                title: "Couldn't generate insights",
                message:
                  "That attempt didn't finish. Insights are asked for again whenever the list changes.",
                canRetry: false,
              }
            : outcome.kind === "nothing-read"
              ? {
                  ...outcome,
                  title: "Not enough to go on yet",
                  message:
                    "Insights need entries with names or notes; they're generated once there are a few more.",
                }
              : outcome,
      };
    }
    case "IDLE":
      return quiet(
        input.hasInsights
          ? null
          : "Insights are generated after the next change to this list.",
      );
    default:
      return quiet();
  }
};

/**
 * An API without `insightsStatus`: the old inference, which is all there is
 * — but `poll` is still bounded by the panel's own poll budget.
 */
const legacyStatus = (input: InsightsViewInput): InsightsStatus => {
  if (input.itemCount < MIN_INSIGHT_ENTRIES) return "NOT_ENOUGH_ENTRIES";
  return input.hasInsights ? "READY" : "PENDING";
};
