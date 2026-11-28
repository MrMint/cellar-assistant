/**
 * Raw `db.execute(sql…)` returns timestamp-like columns as Postgres's text,
 * not as a `Date` (`createDb` in `packages/db/src/index.ts` says why).
 *
 * Drizzle 1.0.0-rc.6 stopped applying its raw-text type parser to raw
 * queries, and the first thing that broke was a keyset cursor: a
 * `timestamptz` parsed into a `Date` loses its microseconds, so
 * `(created_at, id) > (cursor)` matched the cursor's own row again and the
 * onboarding-reprocess walk never finished. Raw queries across the actors
 * type these columns as `string`; this pins that they are.
 */
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "./testing.ts";

describe("raw execute: timestamp-like columns stay text", () => {
  it("keeps timestamptz microseconds, date, timestamp and interval as strings", async () => {
    const row = await withTestDb(async (db) => {
      const result = await db.execute<Record<string, unknown>>(sql`
        select
          '2026-01-02 03:04:05.123456+00'::timestamptz as tz,
          '2026-01-02 03:04:05.123456'::timestamp as ts,
          '2026-01-02'::date as d,
          '1 day 02:03:04'::interval as iv,
          array['2026-01-02 03:04:05.123456+00'::timestamptz] as tzs
      `);
      return result.rows[0];
    });
    expect(row?.tz).toBe("2026-01-02 03:04:05.123456+00");
    expect(row?.ts).toBe("2026-01-02 03:04:05.123456");
    expect(row?.d).toBe("2026-01-02");
    expect(row?.iv).toBe("1 day 02:03:04");
    expect(typeof row?.tzs).toBe("string");
  });

  it("still parses everything else the way node-postgres does", async () => {
    const row = await withTestDb(async (db) => {
      const result = await db.execute<Record<string, unknown>>(sql`
        select '{"a":1}'::jsonb as j, 7::int as n, true as b
      `);
      return result.rows[0];
    });
    expect(row).toEqual({ j: { a: 1 }, n: 7, b: true });
  });
});
