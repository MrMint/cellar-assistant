"use client";

/**
 * F-182: the Insights card's "Rewrite" (F-86, `rewriteTierListInsights`).
 * Its own hook rather than a `useTierListActions` member, so the panel and
 * its tests own it. The answer is the list's new status (PENDING while the
 * new write runs) or the refusal, which the panel says as "Limit reached".
 */
import { useCallback } from "react";
import { type OperationResult, useMutation } from "urql";
import type { ResultOf } from "@/lib/api/graphql";
import {
  type ApiFailure,
  failureFromTransport,
  unwrapResult,
} from "@/lib/api/result";
import { RewriteTierListInsightsMutation } from "../queries";
import type { InsightsStatus } from "./insights-view";

export type RewriteInsightsResult =
  | { success: true; status: InsightsStatus }
  | { success: false; failure: ApiFailure };

type Response = Pick<
  OperationResult<ResultOf<typeof RewriteTierListInsightsMutation>>,
  "data" | "error"
>;

/** One answer → success with the list's status, or the failure it carried. */
export const rewriteResultOf = (response: Response): RewriteInsightsResult => {
  if (response.error !== undefined) {
    return { success: false, failure: failureFromTransport(response.error) };
  }
  const result = unwrapResult(
    response.data?.rewriteTierListInsights ?? undefined,
    "TierList",
  );
  return result.ok
    ? { success: true, status: result.data.insightsStatus as InsightsStatus }
    : { success: false, failure: result.error };
};

export function useRewriteInsights(): (
  tierListId: string,
) => Promise<RewriteInsightsResult> {
  const [, rewrite] = useMutation(RewriteTierListInsightsMutation);
  return useCallback(
    async (tierListId: string) =>
      rewriteResultOf(await rewrite({ tierListId })),
    [rewrite],
  );
}
