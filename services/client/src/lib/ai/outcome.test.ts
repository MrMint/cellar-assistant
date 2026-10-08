/**
 * N07's mapper, as a table. The property that matters most is the negative
 * one: no outcome ever carries the actor's own message, which is where
 * "Set AI_PROVIDER=ollama…" used to reach a person.
 *
 *   bun run --filter @cellar-assistant/client test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ActorErrorReason } from "@/lib/api/errors";
import { type AiFailureLike, aiOutcome, retryPhrase } from "./outcome.ts";

const now = new Date("2026-10-07T12:00:00.000Z");
const opts = { now, locale: "en-US", timeZone: "UTC" } as const;

const failure = (over: Partial<AiFailureLike>): AiFailureLike => ({
  code: "CONFLICT",
  reason: null,
  retryAt: null,
  ...over,
});

describe("aiOutcome", () => {
  test("AI_UNCONFIGURED is unavailable: no retry, no operator text, the fallback offered", () => {
    const outcome = aiOutcome(failure({ reason: "AI_UNCONFIGURED" }), {
      ...opts,
      fallback: "fill in the details yourself",
    });
    assert.equal(outcome.kind, "unavailable");
    assert.equal(outcome.canRetry, false);
    assert.match(outcome.message, /fill in the details yourself/);
    assert.doesNotMatch(
      `${outcome.title} ${outcome.message}`,
      /AI_PROVIDER|ollama|provider|configur/i,
    );
  });

  test("IMAGE_SEARCH_UNAVAILABLE reads the same as any unavailable feature", () => {
    assert.equal(
      aiOutcome(failure({ reason: "IMAGE_SEARCH_UNAVAILABLE" })).kind,
      "unavailable",
    );
  });

  test("USER_CAP says when, in the viewer's terms", () => {
    const sameDay = aiOutcome(
      failure({
        code: "BUDGET_EXCEEDED",
        reason: "USER_CAP",
        retryAt: "2026-10-07T15:40:00.000Z",
      }),
      opts,
    );
    assert.equal(sameDay.kind, "user-cap");
    assert.equal(sameDay.message, "You can try again after 3:40 PM.");
    assert.equal(sameDay.retryAt, "2026-10-07T15:40:00.000Z");
    assert.equal(sameDay.tone, "warning");

    const nextDay = aiOutcome(
      failure({
        code: "BUDGET_EXCEEDED",
        reason: "USER_CAP",
        retryAt: "2026-10-08T09:05:00.000Z",
      }),
      opts,
    );
    assert.equal(nextDay.message, "You can try again tomorrow after 9:05 AM.");
  });

  test("SERVICE_BUDGET names the month, or just 'later' when nothing clears it", () => {
    assert.match(
      aiOutcome(
        failure({
          code: "BUDGET_EXCEEDED",
          reason: "SERVICE_BUDGET",
          retryAt: "2026-11-01T00:00:00.000Z",
        }),
        opts,
      ).message,
      /Try again after Nov 1\./,
    );
    assert.match(
      aiOutcome(
        failure({ code: "BUDGET_EXCEEDED", reason: "SERVICE_BUDGET" }),
        opts,
      ).message,
      /Try again later\./,
    );
  });

  test("a budget refusal with no reason (an older API) is treated as service-wide", () => {
    assert.equal(
      aiOutcome(failure({ code: "BUDGET_EXCEEDED" }), opts).kind,
      "service-budget",
    );
  });

  test("NOTHING_READ asks for a better photo, not a retry", () => {
    const outcome = aiOutcome(failure({ reason: "NOTHING_READ" }), opts);
    assert.equal(outcome.kind, "nothing-read");
    assert.equal(outcome.canRetry, false);
  });

  test("a transport failure or a transient CONFLICT is retryable", () => {
    assert.equal(aiOutcome(failure({ code: "TRANSPORT" })).canRetry, true);
    assert.equal(aiOutcome(failure({ code: "CONFLICT" })).kind, "retryable");
  });

  test("a reason this build does not know falls back to the code", () => {
    const unknown = "SOMETHING_NEW" as ActorErrorReason;
    assert.equal(
      aiOutcome(failure({ code: "VALIDATION", reason: unknown })).kind,
      "rejected",
    );
  });

  test("never carries the actor's message — there is no field for it", () => {
    for (const reason of [
      null,
      "AI_UNCONFIGURED",
      "USER_CAP",
      "SERVICE_BUDGET",
      "NOTHING_READ",
    ] as const) {
      for (const code of [
        "CONFLICT",
        "VALIDATION",
        "BUDGET_EXCEEDED",
        "TRANSPORT",
      ] as const) {
        const outcome = aiOutcome({ code, reason, retryAt: null }, opts);
        assert.doesNotMatch(
          `${outcome.title} ${outcome.message}`,
          /AI_PROVIDER|ollama|Something went wrong/i,
        );
      }
    }
  });
});

describe("retryPhrase", () => {
  test("is null for a missing, unparseable or past time", () => {
    assert.equal(retryPhrase(null, opts), null);
    assert.equal(retryPhrase("soon", opts), null);
    assert.equal(retryPhrase("2026-10-07T11:00:00.000Z", opts), null);
  });
});
