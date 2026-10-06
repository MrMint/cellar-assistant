/**
 * A client-supplied uuid, validated **and canonicalised** in one step.
 *
 * Postgres reads `ABC…` and `abc…` as the same `uuid`, and answers with the
 * lowercase form, so every id this system reads back from a row — and every
 * actor key (`isCanonicalUuid` in `./actor-base.ts`) — is lowercase. An id
 * that arrives as an *argument* is not: `services/api` lowercases the actor id
 * before the hop, but not the arguments. The per-actor `requireUuid`s this
 * replaces all matched `/…/i` and returned the input unchanged, so an
 * uppercase copy of a real id passed validation and then failed every `===`
 * against a row: un-favouriting with an uppercase item id missed the existing
 * favourite, tried an insert, and hit the unique constraint as a raw 23505;
 * an uppercase creator id slipped past `CellarActor`'s "the creator is not a
 * co-owner" filter. Returning the canonical form from the one place that
 * validates it means a comparison downstream cannot see the other spelling.
 *
 * Only the case is normalised. Braced (`{…}`) and unhyphenated forms, which
 * Postgres also accepts, are still refused — nothing in this system mints
 * them, and accepting more spellings is not the fix for comparing them.
 */
import { ValidationError } from "@cellar-assistant/contracts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether `value` is a hyphenated uuid, in either case. */
export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID_PATTERN.test(value);

/**
 * `value`, lowercased, or a `ValidationError` naming `what`. Takes `unknown`
 * because outbox payloads and GraphQL-shaped inputs arrive as untyped JSON.
 */
export const requireUuid = (value: unknown, what: string): string => {
  if (!isUuid(value)) {
    throw new ValidationError(`${what} must be a uuid, got ${String(value)}`);
  }
  return value.toLowerCase();
};
