/**
 * Nearest-neighbour search through an HNSW index, with the two pgvector
 * settings it needs scoped to one transaction.
 *
 * `item_vectors`, `recipe_vectors` (and `category_vectors`) carry an HNSW index
 * on `vector halfvec_cosine_ops`. Postgres uses it only for a query shaped
 * `ORDER BY vector <=> $q LIMIT $k` — any other ORDER BY (a `DISTINCT ON`'s
 * leading columns, a `GROUP BY`'s aggregate) is a sequential scan and a sort of
 * the whole table on every search, which is what both search actors did until
 * this module existed. `pg_stat_user_indexes.idx_scan` was 0 for every HNSW
 * index on cellar-stack when that was measured (2026-09-28).
 *
 * Two settings, both `SET LOCAL` (`set_config(…, true)`), so they end with the
 * transaction and never leak onto a pooled connection:
 *
 * - **`hnsw.iterative_scan = relaxed_order`** (pgvector ≥ 0.8; cellar-stack
 *   runs 0.8.6). Without it an HNSW scan returns at most `ef_search`
 *   candidates and stops, and any `WHERE` evaluated after the index — a type
 *   filter, an `ilike`, or simply a row invisible to this snapshot — silently
 *   shortens the result below `k`. With it the scan resumes until `k` rows
 *   have survived the filters (or `hnsw.max_scan_tuples`, default 20 000, is
 *   reached). `relaxed_order` may emit rows slightly out of distance order;
 *   every caller re-sorts the survivors, so only the set matters.
 * - **`hnsw.ef_search = 100`** — the candidate list per scan step. The
 *   default, 40, is below the search actors' own cap of 50 rows, so a single
 *   pass could not fill a full page; 100 gives the first pass headroom.
 *
 * HNSW is approximate: at production scale the `k` rows are the *likely*
 * nearest, not a guaranteed exact top-`k`. On a table small enough to walk —
 * every test fixture, and today's catalog — the iterative scan visits every
 * live tuple before it gives up on filling `k`, so results there are exact,
 * which is why the search suites' exact-order assertions still hold.
 *
 * Read-only: a search actor never writes (§1.1), and the transaction says so.
 * When `db` is already a transaction (the test harness) Drizzle opens a
 * savepoint instead, and the settings last until that outer transaction ends —
 * which in the harness is a rollback.
 */
import { sql } from "@cellar-assistant/db/orm";
import type { DbOrTx } from "./db.ts";

/** `hnsw.ef_search` for a search turn — see the module doc. */
export const HNSW_EF_SEARCH = 100;

export const withHnswScan = async <T>(
  db: DbOrTx,
  run: (tx: DbOrTx) => Promise<T>,
): Promise<T> =>
  db.transaction(
    async (tx) => {
      await tx.execute(sql`
        select set_config('hnsw.iterative_scan', 'relaxed_order', true),
               set_config('hnsw.ef_search', ${String(HNSW_EF_SEARCH)}, true)
      `);
      return run(tx);
    },
    { accessMode: "read only" },
  );
