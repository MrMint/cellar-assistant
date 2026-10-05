/**
 * `db:migrate` against a real Postgres (`cli.ts`'s {@link migrate}).
 *
 * `ledger.test.ts` covers the planner, which needs no database. What it cannot
 * cover is the part that talks to one, and two of those properties survived
 * every test until this file (mutants D3 and D6):
 *
 *  - **the advisory lock.** Two `db:migrate`s against one database — two
 *    worktrees bootstrapping off `cellar-stack` — must serialise, not both
 *    decide the same migration is pending. `pg_try_advisory_lock` replaced by
 *    `SELECT true` passed everything.
 *  - **the read-back.** After applying, the ledger is re-planned against the
 *    tree rather than trusting the counters; dropping that passed everything.
 *
 * Each test gets its own scratch database (`cellar_test_migrate_…`), dropped
 * afterwards, and runs synthetic migrations rather than the tree's: the
 * statement sequence is the real one, the schema is not the point.
 *
 * Needs a Postgres server. `DB_TEST_ADMIN_URL` names one and makes it
 * required; without it the compose stack's `localhost:5433` is tried, and an
 * unreachable server skips this file with the reason printed.
 */
import pg from "pg";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { LOCK_KEY, migrate } from "./cli.ts";
import { type Adoption, type Migration, sha256 } from "./ledger.ts";

const ADMIN_URL =
  process.env.DB_TEST_ADMIN_URL ??
  process.env.AUTH_TEST_ADMIN_URL ??
  "postgres://cellar:cellar@localhost:5433/postgres";

const reachable = async (): Promise<string | null> => {
  const client = new pg.Client({
    connectionString: ADMIN_URL,
    connectionTimeoutMillis: 3_000,
  });
  try {
    await client.connect();
    await client.query("select 1");
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    await client.end().catch(() => undefined);
  }
};

const unreachable = await reachable();
if (unreachable !== null) {
  if (process.env.DB_TEST_ADMIN_URL !== undefined) {
    throw new Error(
      `DB_TEST_ADMIN_URL is set but ${ADMIN_URL} is unreachable: ${unreachable}`,
    );
  }
  console.warn(
    `[cli.test] SKIPPED: no Postgres at ${ADMIN_URL} (${unreachable}). ` +
      "Set DB_TEST_ADMIN_URL to make this file required.",
  );
}

const withDatabase = (url: string, database: string): string => {
  const next = new URL(url);
  next.pathname = `/${database}`;
  return next.toString();
};

const admin = async <T>(fn: (client: pg.Client) => Promise<T>): Promise<T> => {
  const client = new pg.Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
};

const created: string[] = [];
let counter = 0;

/** A new empty database, dropped in `afterAll`. Returns its URL. */
const scratchDatabase = async (): Promise<string> => {
  counter += 1;
  const name = `cellar_test_migrate_${process.pid}_${Date.now()}_${counter}`;
  await admin((client) => client.query(`CREATE DATABASE ${name}`));
  created.push(name);
  return withDatabase(ADMIN_URL, name);
};

const migration = (name: string, sql: string): Migration => ({
  name,
  sql,
  sha256: sha256(sql),
});

const HORIZON = "20000101000000_base";
const BASE = migration(HORIZON, "-- the introspected baseline, never run\n");
const ADOPTION: Readonly<Record<string, Adoption>> = {
  [HORIZON]: { kind: "baseline", why: "synthetic baseline" },
};

/** A run of the real statement sequence over `migrations`. */
const run = (
  url: string,
  migrations: readonly Migration[],
  lockWaitSeconds = 30,
): Promise<number> =>
  migrate({
    url,
    status: false,
    lockWaitSeconds,
    migrations,
    horizon: HORIZON,
    adoption: ADOPTION,
    transformed: [],
  });

const query = async <T extends pg.QueryResultRow>(
  url: string,
  text: string,
): Promise<T[]> => {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query<T>(text)).rows;
  } finally {
    await client.end();
  }
};

const ledgerOf = async (url: string): Promise<string[]> =>
  (
    await query<{ name: string }>(
      url,
      "SELECT name FROM cellar_meta.schema_migrations ORDER BY name",
    )
  ).map((row) => row.name);

/** Everything the run said on stderr. */
const stderr = (): string[] => {
  const lines: string[] = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  return lines;
};

describe.skipIf(unreachable !== null)("db:migrate against Postgres", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await admin(async (client) => {
      for (const name of created) {
        await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      }
    });
  });

  it("applies what is pending and records it, once", async () => {
    stderr();
    const url = await scratchDatabase();
    const table = migration(
      "20000101000001_table",
      "CREATE TABLE migrate_probe (id int);",
    );
    expect(await run(url, [BASE, table])).toBe(0);
    expect(await ledgerOf(url)).toEqual([BASE.name, table.name]);
    // A second run finds nothing to do, and does not re-run the CREATE.
    expect(await run(url, [BASE, table])).toBe(0);
    expect(await ledgerOf(url)).toEqual([BASE.name, table.name]);
  });

  it("prints what a migration reports with RAISE NOTICE", async () => {
    stderr();
    const printed: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      printed.push(args.map(String).join(" "));
    });
    const url = await scratchDatabase();
    const noisy = migration(
      "20000101000001_noisy",
      "DO $$ BEGIN RAISE NOTICE 'probe: % rows merged', 3; END $$;",
    );
    expect(await run(url, [BASE, noisy])).toBe(0);
    expect(printed).toContain("    NOTICE: probe: 3 rows merged");
  });

  it("refuses to run while another db:migrate holds this database's lock", async () => {
    const errors = stderr();
    const url = await scratchDatabase();
    const holder = new pg.Client({ connectionString: url });
    await holder.connect();
    try {
      await holder.query("SELECT pg_advisory_lock(hashtext($1))", [LOCK_KEY]);
      const table = migration(
        "20000101000001_table",
        "CREATE TABLE migrate_probe (id int);",
      );

      expect(await run(url, [BASE, table], 1)).toBe(1);
      expect(errors.join("\n")).toMatch(/held this database's migration lock/);
      // Nothing was written: not even the ledger exists.
      expect(
        await query<{ t: string | null }>(
          url,
          "SELECT to_regclass('cellar_meta.schema_migrations')::text AS t",
        ),
      ).toEqual([{ t: null }]);
    } finally {
      await holder.end();
    }
  });

  it("serialises two concurrent runs: the second waits, then finds nothing to do", async () => {
    stderr();
    const url = await scratchDatabase();
    // Long enough that the two runs overlap for certain; the second has to
    // wait at the lock for the first's whole apply.
    const slow = migration(
      "20000101000001_slow",
      "CREATE TABLE migrate_probe (id int);\nSELECT pg_sleep(1.5);",
    );
    const results = await Promise.all([
      run(url, [BASE, slow]),
      run(url, [BASE, slow]),
    ]);
    // Without the lock both see an empty ledger, both adopt the baseline and
    // both apply `slow`: one fails on the duplicate, or both "succeed" twice.
    expect(results).toEqual([0, 0]);
    expect(await ledgerOf(url)).toEqual([BASE.name, slow.name]);
  });

  it("re-reads the ledger after applying, and fails when it does not match the tree", async () => {
    const errors = stderr();
    const url = await scratchDatabase();
    // A migration that commits fine and leaves the ledger short of the tree
    // — the case the read-back exists for, since the counters say success.
    const evil = migration(
      "20000101000001_evil",
      `DELETE FROM cellar_meta.schema_migrations WHERE name = '${HORIZON}';`,
    );
    expect(await run(url, [BASE, evil])).toBe(1);
    expect(errors.join("\n")).toMatch(
      /the ledger does not match the tree after migrating/,
    );
  });
});
