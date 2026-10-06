/**
 * Test-only helpers: a scratch database per test file, and a better-auth
 * instance pointed at it.
 *
 * Not imported by `src/index.ts`.
 *
 * The DDL comes from `packages/db/transform/13_better_auth_tables.sql` — the
 * same file that builds `cellar`, `cellar_test` and, at cutover, production.
 * Before X2 it came from `./migrations/0000_better_auth_tables/migration.sql`,
 * a copy generated from a schema file that lived in this directory; now that
 * better-auth's tables are ordinary `public` tables there is exactly one piece
 * of DDL for them and this reads it, so the schema these tests run against
 * cannot drift from the schema anything else gets.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { createAuth } from "./auth.ts";
import type { AuthConfig } from "./config.ts";

const MIGRATION = fileURLToPath(
  new URL(
    "../../../../packages/db/transform/13_better_auth_tables.sql",
    import.meta.url,
  ),
);

/** The stack's Postgres (infra/docker-compose.yml), not Nhost's. */
export const adminUrl = (): string =>
  process.env.AUTH_TEST_ADMIN_URL ??
  "postgres://cellar:cellar@localhost:5433/postgres";

export const scratchUrl = (name: string): string =>
  adminUrl().replace(/\/[^/]*$/, `/${name}`);

/**
 * `base` tagged with this run's `_run_<pid>_<epoch>` suffix.
 *
 * THESE NAMES USED TO BE FIXED, and that was the last thing in this suite that
 * two concurrent runs could destroy for each other. `resetScratchDatabase`
 * opens with `DROP DATABASE … WITH (FORCE)`, so a second run reaching it while
 * the first was mid-test disconnected the first outright. Measured, from two
 * `bun run --filter @cellar-assistant/actors test` started together: three
 * failures in `migrate-users.test.ts`, `database "auth_test_migrate" does not
 * exist` and `It seems to have just been dropped or renamed` — and a green run
 * in the other window, which is the shape of a race that gets blamed on
 * whoever is unlucky.
 *
 * The suffix comes from `lib/test-db-setup.ts`'s vitest `globalSetup`, which
 * sets it before the workers fork, so every worker in one run agrees and
 * `test-db.sh --drop` can collect them all with a single pattern. The fallback
 * matters only when a worker somehow starts without that setup; it is still
 * unique per process, which is all correctness needs here.
 */
export const scratchDatabaseName = (base: string): string => {
  const suffix =
    process.env.ACTORS_TEST_RUN_SUFFIX ??
    `_run_${String(process.pid)}_${String(Math.floor(Date.now() / 1000))}`;
  return `${base.slice(0, 63 - suffix.length)}${suffix}`;
};

/**
 * Drops and recreates a scratch database for `base`, then applies the generated
 * DDL. Returns the URL of the database it made, which carries this run's
 * suffix — callers should use the return value rather than rebuilding the name.
 *
 * Refuses any name outside the `auth_test_` prefix: this drops databases, and
 * a typo must not be able to name `cellar` — which since X2 holds better-auth's
 * tables as well as the domain tables.
 */
export const resetScratchDatabase = async (base: string): Promise<string> => {
  if (!base.startsWith("auth_test_")) {
    throw new Error(
      `refusing to reset "${base}": name must start with auth_test_`,
    );
  }
  const name = scratchDatabaseName(base);
  const admin = new Client({ connectionString: adminUrl() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }

  const url = scratchUrl(name);
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    // One `query()` for the whole file. The transform files are written for
    // psql, so they carry no statement breakpoints and do contain dollar-quoted
    // `DO $$ … $$` blocks that naive splitting would cut in half; Postgres's
    // simple query protocol takes the lot and runs it in one implicit
    // transaction, which is what psql does with them too.
    await client.query(await readFile(MIGRATION, "utf8"));
  } finally {
    await client.end();
  }
  return url;
};

export const testConfig = (
  databaseUrl: string,
  overrides: Partial<AuthConfig> = {},
): AuthConfig => ({
  databaseUrl,
  secret: "test-secret-not-used-anywhere-else-000000000",
  baseUrl: "http://localhost:3002",
  trustedOrigins: ["http://localhost:3000"],
  rehashOnSignIn: true,
  passwordMode: "enabled",
  // Placeholder credentials. No network call is made in these tests: the
  // provider is only needed so better-auth registers `google`/`facebook`/
  // `discord` as known provider ids.
  google: { clientId: "test-google-id", clientSecret: "test-google-secret" },
  facebook: {
    clientId: "test-facebook-id",
    clientSecret: "test-facebook-secret",
  },
  discord: { clientId: "test-discord-id", clientSecret: "test-discord-secret" },
  ...overrides,
});

export const makeTestAuth = (
  databaseUrl: string,
  overrides: Partial<AuthConfig> = {},
) => createAuth(testConfig(databaseUrl, overrides));
