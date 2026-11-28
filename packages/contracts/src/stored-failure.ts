/**
 * How a background failure writes down **which of the five classes it was**,
 * in a `text` column that only has room for prose.
 *
 * ## The problem this solves
 *
 * `menu_scans.processing_error` and `jobs.last_error` are the two places a
 * failure survives the process that raised it. Both are plain `text`, so when
 * `MenuScanActor.process` catches a `ValidationError` from the vision call,
 * `error.code` — the classification `services/actors/src/lib/ai/http.ts` went
 * to some trouble to make (400 → `VALIDATION` and dead-letter, 5xx/408/429 →
 * `CONFLICT` and retry) — is dropped on the floor and only `error.message`
 * is kept.
 *
 * That loss is what forced the reader to guess. `services/api` has to turn a
 * stored failure into a sentence a person can act on, and with nothing but
 * prose to go on the only way to tell "your photo is unreadable" from "the
 * provider is down" is to substring-match the provider's own English. This
 * repository already ruled on that, in `errors.ts`: *"A prose match is not an
 * API."* So the code is written down instead of inferred.
 *
 * ## The format
 *
 * ```
 * VALIDATION: ollama generateContent(…) failed (400) at …
 * ^^^^^^^^^^  ^
 * one of ACTOR_ERROR_CODES, then ": ", then the message untouched
 * ```
 *
 * Three properties make it safe to put in a column that already has rows in it:
 *
 * - **Backwards compatible.** A row written before this existed has no prefix,
 *   so `parseStoredFailure` reports `code: null` and the reader falls back to
 *   its unclassified case. Nothing has to be migrated.
 * - **Closed.** The prefix is recognised only when it is an exact member of
 *   `ACTOR_ERROR_CODES`. A provider message that happens to open with
 *   `Sorry: …` is left whole, in `detail`, and classified `null`.
 * - **Better for the operator, not worse.** `SELECT processing_error` now
 *   leads with the class, and the message that follows is byte-identical to
 *   what was stored before.
 *
 * ## The reason, when there is one (N07)
 *
 * This used to deliberately leave `reason` out, on the grounds that every
 * reason then in existence was a friends/recipes case no background job could
 * raise. The AI reasons changed that: a menu scan or a tier list's insights
 * can now fail `AI_UNCONFIGURED`, `NOTHING_READ`, `USER_CAP` or
 * `SERVICE_BUDGET`, and those are exactly the distinctions a person needs
 * ("this isn't available here" versus "try again after 3:40"). So a reason
 * rides in brackets right after the code:
 *
 * ```
 * BUDGET_EXCEEDED[USER_CAP]: ai_model/menu_extraction refused: …
 * ```
 *
 * Still backwards compatible — a row with no brackets parses with
 * `reason: null` — and still closed: the bracketed value is recognised only
 * when it is an exact `ActorErrorReason`, otherwise the whole prefix is not
 * one and the row is unclassified, as before.
 */
import type { ActorErrorCode, ActorErrorReason } from "./errors.ts";
import {
  ACTOR_ERROR_CODES,
  isActorError,
  isActorErrorReason,
} from "./errors.ts";

const SEPARATOR = ": ";

/** A stored failure, taken apart again. */
export type StoredFailure = {
  /** The class the raiser recorded, or `null` for an unprefixed row. */
  readonly code: ActorErrorCode | null;
  /** The finer reason the raiser recorded, or `null` (most rows). */
  readonly reason: ActorErrorReason | null;
  /** Everything after the prefix — the raw message, for operators only. */
  readonly detail: string;
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Render a caught error for a `text` column, keeping its class.
 *
 * `limit` is applied to the whole string, prefix included, so the caller's
 * column bound still holds.
 */
export const formatStoredFailure = (error: unknown, limit = 4_000): string => {
  const message = messageOf(error);
  const line = isActorError(error)
    ? `${error.code}${error.reason === null ? "" : `[${error.reason}]`}${SEPARATOR}${message}`
    : message;
  return line.slice(0, limit);
};

/**
 * Read one back. Total: every string is a `StoredFailure`, and an unrecognised
 * prefix simply means `code: null` with `detail` left whole.
 */
export const parseStoredFailure = (stored: string): StoredFailure => {
  const unclassified: StoredFailure = {
    code: null,
    reason: null,
    detail: stored,
  };
  const at = stored.indexOf(SEPARATOR);
  if (at <= 0) return unclassified;
  const prefix = /^([A-Z_]+)(?:\[([A-Z_]+)\])?$/.exec(stored.slice(0, at));
  const candidate = prefix?.[1];
  if (
    candidate === undefined ||
    !(ACTOR_ERROR_CODES as readonly string[]).includes(candidate)
  ) {
    return unclassified;
  }
  const reason = prefix?.[2];
  if (reason !== undefined && !isActorErrorReason(reason)) {
    return unclassified;
  }
  return {
    code: candidate as ActorErrorCode,
    reason: reason ?? null,
    detail: stored.slice(at + SEPARATOR.length),
  };
};
