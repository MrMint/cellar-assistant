/**
 * The disclosure regression, stated as a closed set.
 *
 * The bug: `/map/scans` rendered `menu_scans.processing_error` verbatim, so a
 * user-visible card carried the vision provider's internal endpoint. The fix is
 * a classifier that emits constants, and the property worth testing is not
 * "this one hostname is absent" — a blocklist nobody extends — but **the output
 * is always one of a fixed list of sentences we wrote**. Anything that reverts
 * the resolver to `t.exposeString` fails `menu-scan.test.ts`'s companion case.
 */
import { describe, expect, it } from "vitest";
import { failureSummary, USER_FACING_FAILURES } from "./failure-summary.ts";

/**
 * The shape of a real dead `menu_scans` row (2026-09-19), with the host, port
 * and path replaced by synthetic stand-ins.
 *
 * The substitution costs the test nothing, because the property asserted below
 * is "the summary echoes *no part of the input*", not "this one hostname is
 * filtered". It is worth something, though: this repository is public, and
 * committing the real endpoint into a test that exists to stop it leaking
 * would be self-defeating.
 */
const INTERNAL_HOST = "internal-model-host.invalid";
const INTERNAL_PORT = "54321";
const INTERNAL_ENDPOINT = `http://${INTERNAL_HOST}:${INTERNAL_PORT}/v1/generate`;
const REAL_PROVIDER_FAILURE =
  `someprovider generateContent(some-model:1b) failed (400) at ` +
  `${INTERNAL_ENDPOINT}: ` +
  '{"error":"{\\"error\\":{\\"code\\":400,\\"message\\":\\"Failed to load ' +
  'image or audio file\\",\\"type\\":\\"invalid_request_error\\"}}"} ' +
  "The request carried 1 image — image 1: 68 bytes, image/png.";

/** Things that must never appear in a string handed to a client. */
const FORBIDDEN = [
  INTERNAL_HOST,
  INTERNAL_PORT,
  "/v1/generate",
  "someprovider",
  "some-model",
  "invalid_request_error",
  "{",
  "http://",
  "https://",
];

describe("failureSummary", () => {
  it("never echoes the provider's endpoint, model or body", () => {
    const summary = failureSummary(`VALIDATION: ${REAL_PROVIDER_FAILURE}`);
    expect(summary).not.toBeNull();
    for (const secret of FORBIDDEN) {
      expect(summary?.toLowerCase()).not.toContain(secret.toLowerCase());
    }
  });

  it("returns a constant we wrote, for every input, however hostile", () => {
    const inputs = [
      REAL_PROVIDER_FAILURE,
      `VALIDATION: ${REAL_PROVIDER_FAILURE}`,
      `CONFLICT: ${REAL_PROVIDER_FAILURE}`,
      `NOT_FOUND: file 1234 is gone`,
      `FORBIDDEN: policy said no`,
      `BUDGET_EXCEEDED: out of budget`,
      // Unprefixed, unrecognised-prefix and near-miss-prefix rows.
      "the model was unavailable",
      "Sorry: something at 10.0.0.4:5432 broke",
      "VALIDATION_FAILED: not a real code",
      "validation: lowercase is not the code either",
      ": leading separator",
      // Degenerate shapes.
      "x",
      "  ",
      "\n\n",
      "VALIDATION: ",
      "A".repeat(20_000),
      `${INTERNAL_ENDPOINT} on its own`,
      JSON.stringify({ secret: INTERNAL_ENDPOINT }),
    ];
    for (const input of inputs) {
      const summary = failureSummary(input);
      if (summary === null) {
        // Only blank input may summarise to nothing.
        expect(input.trim()).toBe("");
        continue;
      }
      expect(
        USER_FACING_FAILURES,
        `"${input.slice(0, 40)}" escaped the closed set`,
      ).toContain(summary);
    }
  });

  it("says nothing at all when nothing failed", () => {
    expect(failureSummary(null)).toBeNull();
    expect(failureSummary("")).toBeNull();
  });

  it("uses the class the raiser recorded, not the prose", () => {
    // Same words, different recorded class → different advice. This is the
    // whole point of `stored-failure.ts`: the prose is not the API.
    expect(failureSummary("VALIDATION: the model said no")).not.toBe(
      failureSummary("CONFLICT: the model said no"),
    );
    expect(failureSummary("VALIDATION: anything")).toMatch(
      /retake or re-?upload/i,
    );
    expect(failureSummary("CONFLICT: anything")).toMatch(
      /retried automatically/i,
    );
    expect(failureSummary("BUDGET_EXCEEDED: anything")).toMatch(/allowance/i);
  });

  it("every sentence gives the reader somewhere to go, and is short", () => {
    for (const sentence of USER_FACING_FAILURES) {
      expect(sentence.length).toBeLessThanOrEqual(160);
      // A next action, an escape hatch, or an explicit "it is already being
      // handled" — never a bare statement of failure.
      expect(sentence).toMatch(
        /upload|retake|try again|check back|contact support|start a new one/i,
      );
      /**
       * `packages/e2e/specs/00-routes.spec.ts` treats these as evidence that a
       * page rendered its own error shell. This column collided with that spec
       * once already; copy written here must not do it again.
       */
      expect(sentence).not.toMatch(
        /Something went wrong|Unexpected error|Application error|Failed to load [a-z ]*(items|page|data)\b/i,
      );
    }
  });
});
