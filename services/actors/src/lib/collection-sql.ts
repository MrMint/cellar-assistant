/**
 * The three SQL fragments every C3 collection actor shares.
 *
 * All of §2.2's lists are keyset-paged (`collection-actor-base.ts`), which
 * means each of them needs the same two clauses — a `(sortKey, id)` row-value
 * comparison for the cursor, and the matching `ORDER BY` — and two of them need
 * a `uuid[]` parameter. Written once here because both have a trap in them.
 *
 * ## The cursor is a row-value comparison, not two `AND`ed ones
 *
 * `(created_at, id) < ($1, $2)` is a single lexicographic comparison. The
 * hand-written equivalent — `created_at < $1 OR (created_at = $1 AND id < $2)`
 * — is easy to get subtly wrong and, unlike the row-value form, is not matched
 * to a multi-column btree index by the planner.
 *
 * ## A `uuid[]` parameter must be a `{...}` literal (C1's fixture trap)
 *
 * > Drizzle's `sql` flattens a JS array into one parameter each, so every
 * > `text[]`/`uuid[]` argument must be a `{...}` literal.
 *
 * `uuidArray` is that literal. It rejects anything that is not a uuid rather
 * than escaping it, because the value is being spliced into a Postgres array
 * literal by hand and a uuid check is a complete validation of that shape.
 */
import { ValidationError } from "@cellar-assistant/contracts";
import { type SQL, sql } from "@cellar-assistant/db/orm";
import type { KeysetCursor } from "./collection-actor-base.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const requireUuidValue = (value: string, what: string): string => {
  if (!UUID.test(value)) {
    throw new ValidationError(`${what} must be a uuid, got ${value}`);
  }
  return value;
};

/**
 * A Postgres `uuid[]` literal, safe because every element is checked to be a
 * uuid first. An empty array is `'{}'`, which `= ANY` correctly treats as
 * matching nothing.
 */
export const uuidArray = (ids: readonly string[], what: string): SQL =>
  sql.raw(
    `'{${ids.map((id) => requireUuidValue(id, what)).join(",")}}'::uuid[]`,
  );

/**
 * `(sortExpr, idExpr) < (cursor.sort::<cast>, cursor.id::uuid)` for a
 * descending page, or `>` for an ascending one. `true` when there is no cursor.
 *
 * `sortCast` is the type of the ordering expression — `timestamptz`, `numeric`,
 * `text` or `uuid` in C3 — and is applied to the cursor half only; the row half
 * is already that type. Both halves of the row value must be castable to each
 * other's type, which is why a collection ordered only by its id passes `uuid`
 * rather than `text`: `(id, id) < ($1::text, $2::uuid)` has no operator.
 */
export const keysetWhere = (
  after: KeysetCursor | null,
  sortExpr: SQL,
  idExpr: SQL,
  sortCast: "timestamptz" | "numeric" | "text" | "uuid",
  direction: "asc" | "desc",
): SQL => {
  if (after === null) return sql`true`;
  const cast = sql.raw(`::${sortCast}`);
  const bound = sql`(${after.sort}${cast}, ${after.id}::uuid)`;
  return direction === "desc"
    ? sql`(${sortExpr}, ${idExpr}) < ${bound}`
    : sql`(${sortExpr}, ${idExpr}) > ${bound}`;
};

/** The `ORDER BY` that `keysetWhere` assumes. Same expressions, same order. */
export const keysetOrder = (
  sortExpr: SQL,
  idExpr: SQL,
  direction: "asc" | "desc",
): SQL =>
  direction === "desc"
    ? sql`${sortExpr} desc, ${idExpr} desc`
    : sql`${sortExpr} asc, ${idExpr} asc`;

/**
 * A `timestamptz` from a **raw** query, as ISO-8601.
 *
 * `db.execute` returns driver rows rather than Drizzle-mapped ones, and
 * node-postgres hands a `timestamptz` back as Postgres' own text rendering
 * (`2026-09-09 19:54:06.465051+00`) rather than as a `Date`. Every DTO in
 * `packages/contracts` says ISO-8601, so the conversion has to happen
 * somewhere; here, once, rather than five times with five different bugs.
 *
 * The offset in that text is always present (the column is `timestamptz`), so
 * the parse is unambiguous. Sub-millisecond precision is dropped, which is what
 * `.toISOString()` does everywhere else in the actor layer too.
 */
export const toIso = (value: Date | string | null): string | null => {
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`not a timestamp: ${value}`);
  }
  return parsed.toISOString();
};
