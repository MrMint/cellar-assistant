/**
 * The pool `createDb` actually builds.
 *
 * `services/actors` is the only process in the system with a Postgres
 * connection, and until this file existed it took node-postgres' defaults:
 * ten connections and `connectionTimeoutMillis: 0`, i.e. wait forever. The
 * numbers and the argument for each are in `./index.ts`; this asserts they
 * reach `pg`.
 *
 * Two things make that worth a test rather than a code read. `drizzle()` has a
 * string overload that quietly builds `new pg.Pool({ connectionString })` and
 * drops everything else, which is the shape this replaced and the shape a
 * careless edit would restore. And the expectations below are written as
 * literals, not as reads of `POOL_SETTINGS`, so the test is an independent
 * statement of the numbers rather than a tautology.
 *
 * No database is needed and none is contacted: `new pg.Pool()` does not
 * connect, so the connection string here is deliberately unroutable.
 */
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDb, POOL_SETTINGS } from "./index.ts";

/** Port 1 on loopback, with credentials that are nobody's. Never dialled. */
const NOWHERE = "postgres://nobody:nothing@127.0.0.1:1/none";

const poolFor = (url = NOWHERE): Pool => createDb(url).$client as Pool;

describe("createDb pool settings", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("carries every setting through to pg", async () => {
    const pool = poolFor();
    try {
      expect(pool.options).toMatchObject({
        max: 20,
        connectionTimeoutMillis: 5_000,
        statement_timeout: 30_000,
        idle_in_transaction_session_timeout: 60_000,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10_000,
      });
      expect(pool.options.connectionString).toBe(NOWHERE);
    } finally {
      await pool.end();
    }
  });

  it("never waits forever for a connection", async () => {
    const pool = poolFor();
    try {
      // The default is 0, which pg reads as "no timeout". That is the failure
      // this whole file exists for: it surfaces as a Dapr invoke timeout with
      // no mention of the pool.
      const { connectionTimeoutMillis } = pool.options;
      expect(connectionTimeoutMillis).toBeGreaterThan(0);
      expect(connectionTimeoutMillis).toBeLessThan(15_000);
    } finally {
      await pool.end();
    }
  });

  it("names itself, so pg_stat_activity can attribute a held connection", async () => {
    const pool = poolFor();
    try {
      expect(pool.options.application_name).toBe("cellar-actors");
    } finally {
      await pool.end();
    }
  });

  it("lets PGAPPNAME override the name, as libpq does", async () => {
    vi.stubEnv("PGAPPNAME", "cellar-suite");
    vi.resetModules();
    const fresh = await import("./index.ts");
    const pool = fresh.createDb(NOWHERE).$client as Pool;
    try {
      expect(pool.options.application_name).toBe("cellar-suite");
    } finally {
      await pool.end();
    }
  });

  it("keeps the exported settings and the pool in step", async () => {
    const pool = poolFor();
    try {
      expect(pool.options).toMatchObject(POOL_SETTINGS);
    } finally {
      await pool.end();
    }
  });
});
