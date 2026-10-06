/**
 * The boundary where a stored failure stops being an operator's record and
 * becomes something a person reads.
 *
 * ## Why here
 *
 * `services/api/src/index.ts` already runs this policy for *thrown* errors:
 * yoga's `maskError` exists so that "a Dapr URL or a Postgres message must
 * never reach a client", and everything that is not a deliberate `ActorError`
 * is replaced wholesale. Two fields route around it — `MenuScan.processingError`
 * and `RecipePhotoJob.lastError` — because they are not thrown, they are
 * *data*: a background job failed hours ago and its reason was written to a
 * column. `t.exposeString` then handed that column to the browser verbatim, and
 * what the browser got was
 *
 * ```
 * ollama generateContent(gemma3:4b) failed (400) at http://<host>:<port>/api/chat: {"error":…
 * ```
 *
 * — an internal hostname, an internal port, a model name and a nested JSON blob
 * on a `/map/scans` card, in a public repository. So this is the same policy as
 * `maskError`, applied to the half of the surface that is data rather than
 * control flow, and it lives in the same process for the same reason: a client
 * is too late (the string has already crossed the wire, into the response, the
 * URQL cache and devtools) and the actor is too early (the column is the only
 * record an operator has, and losing it is what made this week's corrupt-fixture
 * diagnosis possible at all — see `services/actors/src/lib/ai/http.ts`).
 *
 * ## What it guarantees
 *
 * **It is a classifier that emits constants, not a redactor.** Nothing from the
 * input is ever echoed — not a fragment, not a truncation. The return value is
 * always one of `USER_FACING_FAILURES` or `null`. That is what makes the
 * disclosure property testable as a closed set rather than as a growing
 * blocklist of hostnames nobody remembers to extend.
 *
 * ## The vocabulary
 *
 * The five `ACTOR_ERROR_CODES` are the classification, read off the stored row
 * by `parseStoredFailure` — never guessed from the prose. A row with no class
 * (anything written before `formatStoredFailure` existed, and every
 * `jobs.last_error` until `job-actor` adopts it) gets `UNCLASSIFIED`, which is
 * not a sixth code: it is the same "no finer classification available" that
 * `ActorError.reason === null` means.
 *
 * Copy rules, in case these are edited: say what happened without naming
 * anything internal, and give one next action. Keep clear of the strings
 * `packages/e2e/specs/00-routes.spec.ts` treats as an app-level error shell
 * ("Something went wrong", "Unexpected error", "Application error",
 * "Failed to load … items/page/data") — that spec was already narrowed once
 * because this very column collided with it.
 */
import type { ActorErrorCode } from "@cellar-assistant/contracts";
import { parseStoredFailure } from "@cellar-assistant/contracts";

const SUMMARY: Record<ActorErrorCode, string> = {
  /**
   * The file behind the job is gone — deleted, or never finished uploading.
   * Re-uploading is the whole fix.
   */
  NOT_FOUND: "The photo this needed is no longer available. Upload it again.",
  /** A policy check refused the work. Nothing the person can retry into. */
  FORBIDDEN:
    "This account is not allowed to run that step. Contact support if that looks wrong.",
  /**
   * `lib/ai/http.ts` maps 5xx, 408, 429 and transport failures here precisely
   * because asking again can work — and the outbox is already asking again.
   */
  CONFLICT:
    "That attempt did not complete and is being retried automatically. Check back shortly.",
  /**
   * The permanent half of the same mapping: a 400, a rejected image, a
   * misconfigured provider. Leads with the overwhelmingly common cause and
   * still gives somewhere to go when it is the other one.
   */
  VALIDATION:
    "The photo was rejected before it could be read. Retake or re-upload it, and contact support if that does not help.",
  /** `BudgetActor.reserve` said no. Time is the remedy. */
  BUDGET_EXCEEDED:
    "The allowance for AI processing is used up for now. Try again later.",
};

/**
 * No class was recorded. Honest about the two things the person can rely on —
 * it is retried, and they can try again — and about nothing else.
 */
const UNCLASSIFIED =
  "Processing did not finish. It is retried automatically; start a new one if it does not clear.";

/**
 * Every string this module can return. A test asserts the output is always a
 * member, which is the disclosure guarantee stated as a closed set.
 */
export const USER_FACING_FAILURES: readonly string[] = Object.freeze([
  ...Object.values(SUMMARY),
  UNCLASSIFIED,
]);

/**
 * A stored failure → one bounded sentence, or `null` when there was no failure.
 *
 * Total, and never throws: any string whatsoever maps into the closed set.
 */
export const failureSummary = (stored: string | null): string | null => {
  if (stored === null || stored.trim() === "") return null;
  const code = parseStoredFailure(stored).code;
  return code === null ? UNCLASSIFIED : SUMMARY[code];
};
