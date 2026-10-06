/**
 * Passing a list of uuids to a hand-written query — C4.
 *
 * **Why this exists.** Drizzle's `sql` template expands a JavaScript array
 * into a *placeholder list*, not an array parameter:
 *
 * ```ts
 * sql`id = any(${["a", "b"]}::uuid[])`
 * // -> id = any(($1, $2)::uuid[])   →  ERROR: cannot cast type record to uuid[]
 * ```
 *
 * That is a runtime error, in Postgres, at the moment the query runs — nothing
 * in `tsc` or in a type test catches it, which is the same class of gap the
 * memory note about gql.tada records. The fix is to hand Postgres a single
 * text parameter holding an array *literal* and cast that:
 *
 * ```ts
 * sql`${uuidArrayParam(ids)}::uuid[] is null or id = any(${uuidArrayParam(ids)}::uuid[])`
 * ```
 *
 * `null` in, `null` out, so the "no filter" branch stays a plain comparison
 * rather than a second query.
 */
import { ValidationError } from "@cellar-assistant/contracts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A `{a,b,c}` array literal, or `null` for an empty/absent list.
 *
 * Every element is validated as a uuid before it is concatenated. That is not
 * belt-and-braces: the literal is built by string concatenation, so an
 * unvalidated element would be the one place in this codebase where caller
 * input reaches SQL as text rather than as a parameter.
 */
export const uuidArrayParam = (
  ids: readonly string[] | null | undefined,
): string | null => {
  if (ids === null || ids === undefined || ids.length === 0) return null;
  for (const id of ids) {
    if (!UUID_PATTERN.test(id)) {
      throw new ValidationError(`not a uuid: ${JSON.stringify(id)}`);
    }
  }
  return `{${ids.join(",")}}`;
};
