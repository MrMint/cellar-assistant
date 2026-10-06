/**
 * Transaction-scoped Postgres advisory locks, and the one registry of which
 * lock space means what.
 *
 * ## Why these exist beside actor keys
 *
 * Dapr serialises turns per actor id, which is the right lock when "the thing
 * that must not race" has an exact key. Two things here do not, and
 * `docs/architecture/actor-keys.md` argues each:
 *
 *  - **place creation** — "the same place" is a fuzzy predicate over name and
 *    distance, so no actor id names it; `PlaceActor.create` locks every grid
 *    cell the duplicate radius can reach (`./geocell.ts`);
 *  - **budget reservations** — the caps are exact per `(service, endpoint)`,
 *    and holding that exactness in the database rather than only in the
 *    `BudgetActor` singleton means a placement split (two activations of one
 *    id for a moment during a rolling deploy) cannot make a cap advisory.
 *
 * A lock taken here is held for milliseconds, inside the writing transaction,
 * never across an external call.
 *
 * ## The key space, and why it is the two-`int4` form
 *
 * `pg_advisory_xact_lock(int4, int4)` and `pg_advisory_xact_lock(int8)` are
 * separate lock spaces in Postgres (the lock tag records which form was used),
 * and every other advisory lock in this repository — the migrator
 * (`packages/db/src/migrate/cli.ts`) and the test-template builder
 * (`packages/db/transform/test-db.sh`) — uses the single-`int8` form over
 * `hashtext(...)`. Using the two-`int4` form here means none of those can ever
 * collide with a lock taken below, whatever `hashtext` returns.
 *
 * Inside the two-`int4` space the first key carries a namespace in its high
 * bits (`namespace << 20`) and a per-family value in its low 20; the second key
 * is the family's own. Add a namespace to {@link ADVISORY_LOCK_NAMESPACE} rather
 * than choosing a number inline, so two families cannot pick the same one.
 */
import { sql } from "@cellar-assistant/db/orm";
import type { DbOrTx } from "./db.ts";

/** One namespace per lock family. Never reuse or renumber an entry. */
export const ADVISORY_LOCK_NAMESPACE = {
  /** `PlaceActor.create`'s duplicate-radius grid cells (`./geocell.ts`). */
  placeGeocell: 1,
  /** `BudgetActor`'s per-`(service, endpoint)` reservation lock. */
  budgetKind: 2,
} as const;

export type AdvisoryLockNamespace =
  (typeof ADVISORY_LOCK_NAMESPACE)[keyof typeof ADVISORY_LOCK_NAMESPACE];

/** The low bits of the first key a family may use for its own value. */
export const NAMESPACE_LOW_BITS = 20;
const LOW_MASK = (1 << NAMESPACE_LOW_BITS) - 1;
const INT4_MIN = -(2 ** 31);
const INT4_MAX = 2 ** 31 - 1;

/** One lock: the two `int4` arguments of `pg_advisory_xact_lock`. */
export type AdvisoryLockKey = readonly [number, number];

/**
 * Build a key in `namespace`. `low` must fit the namespace's 20 bits and
 * `value` must be an `int4`; anything else is a programming error, thrown
 * rather than silently wrapped into somebody else's lock.
 */
export const advisoryLockKey = (
  namespace: AdvisoryLockNamespace,
  low: number,
  value: number,
): AdvisoryLockKey => {
  if (!Number.isInteger(low) || low < 0 || low > LOW_MASK) {
    throw new RangeError(
      `advisory lock low bits must be an integer in 0..${LOW_MASK}, got ${low}`,
    );
  }
  if (!Number.isInteger(value) || value < INT4_MIN || value > INT4_MAX) {
    throw new RangeError(`advisory lock value must be an int4, got ${value}`);
  }
  return [namespace * 2 ** NAMESPACE_LOW_BITS + low, value];
};

/**
 * A key in `namespace` for a piece of text (a budget kind, say): FNV-1a, 32
 * bits, as a signed `int4`. Stable across processes and releases, which a
 * lock key must be. Two texts that collide share a lock — extra
 * serialisation, never a missed one — so a collision costs throughput only.
 */
export const advisoryLockKeyForText = (
  namespace: AdvisoryLockNamespace,
  text: string,
): AdvisoryLockKey => {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return advisoryLockKey(namespace, 0, hash | 0);
};

/** Ascending by first key, then second — the one acquisition order. */
export const compareAdvisoryLockKeys = (
  a: AdvisoryLockKey,
  b: AdvisoryLockKey,
): number => a[0] - b[0] || a[1] - b[1];

/**
 * Take every lock in `keys`, deduplicated, in {@link compareAdvisoryLockKeys}
 * order, and hold them until `tx` commits or rolls back.
 *
 * **Sorted, one statement per lock, on purpose.** Two transactions that each
 * want an overlapping set can only deadlock if they acquire in different
 * orders; everyone sorting the same way makes that impossible. A single
 * `select pg_advisory_xact_lock(k) from unnest(...) order by k` would *look*
 * ordered, but Postgres does not promise to evaluate a volatile target-list
 * function in `ORDER BY` order, so the order would be the planner's. The loop
 * costs one round-trip per lock, and a caller here takes at most a handful.
 *
 * Must be called with a transaction: on a bare pool connection the lock would
 * be released when that one statement's implicit transaction ended.
 */
export const lockAll = async (
  tx: DbOrTx,
  keys: readonly AdvisoryLockKey[],
): Promise<readonly AdvisoryLockKey[]> => {
  const unique = new Map<string, AdvisoryLockKey>();
  for (const key of keys) unique.set(`${key[0]}:${key[1]}`, key);
  const ordered = [...unique.values()].sort(compareAdvisoryLockKeys);
  for (const [first, second] of ordered) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${first}::int4, ${second}::int4)`,
    );
  }
  return ordered;
};
