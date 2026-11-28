/** F-182: `rewriteTierListInsights`' answer → the panel's result. */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CombinedError } from "urql";
import { rewriteResultOf } from "./useRewriteInsights";

describe("rewriteResultOf", () => {
  test("the list's new status, or the refusal it carried", () => {
    assert.deepEqual(
      rewriteResultOf({
        data: {
          rewriteTierListInsights: {
            __typename: "TierList",
            id: "tl-1",
            insightsStatus: "PENDING",
            insightsFailureReason: null,
            insightsRetryAt: null,
          },
        } as never,
      }),
      { success: true, status: "PENDING" },
    );
    const refused = rewriteResultOf({
      data: {
        rewriteTierListInsights: {
          __typename: "BudgetExceededError",
          code: "BUDGET_EXCEEDED",
          reason: "USER_CAP",
          message: "Limit reached",
          retryAt: "2026-12-01T00:00:00.000Z",
        },
      } as never,
    });
    assert.equal(refused.success, false);
    const transport = rewriteResultOf({
      error: new CombinedError({ networkError: new Error("offline") }),
    });
    assert.equal(transport.success, false);
  });
});
