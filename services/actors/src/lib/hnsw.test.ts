/**
 * `withHnswScan` — the settings are in force inside the callback, scoped to
 * its transaction, and that transaction refuses writes.
 */
import { sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import { HNSW_EF_SEARCH, withHnswScan } from "./hnsw.ts";
import { closeTestDb, resolveTestDatabase, testDb } from "./testing.ts";

const { skip } = await resolveTestDatabase();

type Settings = {
  readonly iterative: string | null;
  readonly ef: string | null;
  readonly readOnly: string;
};

const settings = sql`
  select current_setting('hnsw.iterative_scan', true) as iterative,
         current_setting('hnsw.ef_search', true) as ef,
         current_setting('transaction_read_only') as "readOnly"
`;

describe.skipIf(skip)("withHnswScan", () => {
  afterAll(closeTestDb);

  it("sets iterative scan and ef_search for its own transaction, read-only", async () => {
    const db = testDb();
    const inside = await withHnswScan(db, async (tx) => {
      const { rows } = await tx.execute<Settings>(settings);
      return rows[0];
    });
    expect(inside).toEqual({
      iterative: "relaxed_order",
      ef: String(HNSW_EF_SEARCH),
      readOnly: "on",
    });
    // Enough headroom for the search actors' 50-row cap in one pass.
    expect(HNSW_EF_SEARCH).toBeGreaterThanOrEqual(50);

    const refused = await withHnswScan(db, (tx) =>
      tx.execute(sql`create temp table w6_nope (x int)`),
    ).then(
      () => null,
      (error: unknown) => error,
    );
    // Drizzle wraps the driver error; Postgres's own words are on `cause`.
    expect(String((refused as { cause?: unknown } | null)?.cause)).toMatch(
      /read-only transaction/,
    );
  });

  it("leaves nothing behind on the pooled connection", async () => {
    const db = testDb();
    // Every pooled connection that ran a search did so under SET LOCAL, so
    // none of them may still carry the search settings afterwards.
    for (let i = 0; i < 5; i += 1) {
      await withHnswScan(db, async () => undefined);
    }
    const { rows } = await db.execute<Settings>(settings);
    expect(rows[0]?.iterative).not.toBe("relaxed_order");
    expect(rows[0]?.ef).not.toBe(String(HNSW_EF_SEARCH));
  });

  it("every HNSW index in public is a cosine one — nothing queries by L2", async () => {
    // Every vector query here is `<=>`. An HNSW index for another operator
    // class is a second graph insert on every vector write for no reader;
    // `20260928181516_drop_unused_l2_hnsw_indexes` dropped the three that were.
    const { rows } = await testDb().execute<{ name: string; def: string }>(sql`
      select indexname as name, indexdef as def from pg_indexes
      where schemaname = 'public' and indexdef ilike '%using hnsw%'
      order by 1
    `);
    expect(rows.length).toBeGreaterThanOrEqual(4);
    expect(
      rows.filter((row) => !row.def.includes("halfvec_cosine_ops")),
    ).toEqual([]);
  });
});
