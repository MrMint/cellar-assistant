/**
 * Test support for `./hnsw.ts`: prove a search query *can* be served by its
 * HNSW index, and that the index path returns the fixture's exact answer.
 *
 * On a fixture of a handful of rows the planner rightly prefers a sequential
 * scan and a sort, so a suite left alone never exercises the index at all —
 * the query shape could regress to one the index cannot serve and every
 * assertion would still pass. `steerToIndexScans` takes the cheap plans away
 * (for the rest of the harness transaction), after which the only plan that
 * avoids a disabled node is an ordered HNSW scan — if, and only if, the query
 * is `ORDER BY vector <=> q LIMIT k`. `hnswScans` reads
 * `pg_stat_get_xact_numscans`, which counts this transaction's own scans, so
 * the check needs no stats flush and sees no other test's traffic.
 */
import { sql } from "@cellar-assistant/db/orm";
import type { DbOrTx } from "./db.ts";

export const steerToIndexScans = async (db: DbOrTx): Promise<void> => {
  await db.execute(sql`
    select set_config('enable_seqscan', 'off', true),
           set_config('enable_bitmapscan', 'off', true),
           set_config('enable_sort', 'off', true),
           set_config('enable_incremental_sort', 'off', true)
  `);
};

/** Scans of `indexName` so far in the current transaction. */
export const hnswScans = async (
  db: DbOrTx,
  indexName: string,
): Promise<number> => {
  const { rows } = await db.execute<{ scans: string | number }>(sql`
    select pg_stat_get_xact_numscans(to_regclass('public.' || ${indexName}))
      as scans
  `);
  return Number(rows[0]?.scans ?? 0);
};
