/**
 * A6 acceptance: `scripts/migrate-users.ts` is idempotent.
 *
 * Runs the real script (as a child process, the way an operator would) against
 * a synthetic Nhost source. Synthetic rather than the live Nhost database
 * because that one is read-only here and holds no `auth.user_providers` rows,
 * so the social half would go untested.
 *
 * The child inherits `process.execPath` — whatever is running *this* process —
 * and the script it runs is plain `.ts`. **Which runtime that is changed in
 * phase 3a**, and the two paths get TypeScript across in different ways:
 *
 *   - **Bun** (the default now: `bun run --bun vitest run`). `execPath` is the
 *     `bun` binary and Bun transpiles `.ts` itself. No version floor applies —
 *     measured, all 8 tests pass under bun 1.4.2.
 *   - **Node**, when someone runs `node ./node_modules/.bin/vitest run` on
 *     purpose. `execPath` is `node` and the child relies on Node's built-in
 *     TypeScript type stripping. Measured directly (X4): under Node v20.18.1
 *     this suite's 8 tests go 7 failed / 1 passed with an ESM-loader error from
 *     the child; under v24.14.0 (`.nvmrc`) all 8 pass, nothing else in the tree
 *     changed. That reads exactly like a real regression unless you already
 *     know to suspect the runtime, so it is still asserted up front rather than
 *     left to surface as seven assertion failures with no shared cause.
 *
 * The guard below therefore has to ask *which runtime*, not just *which
 * version*. `process.versions.node` alone cannot answer that: Bun populates it
 * with a synthetic value (26.3.0 under bun 1.4.2), so the old unconditional
 * `currentMajor < requiredMajor` check passed under Bun by accident — 26 is
 * simply larger than 24 — and had it ever failed it would have told the reader
 * to run `fnm use`, which would not have helped. `process.versions.bun` is the
 * only reliable discriminator; see `../lib/runtime.test.ts`.
 */
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  resetScratchDatabase,
  scratchDatabaseName,
  scratchUrl,
} from "./testing.ts";

if (process.versions.bun === undefined) {
  const requiredNodeVersion = readFileSync(
    fileURLToPath(new URL("../../../../.nvmrc", import.meta.url)),
    "utf8",
  ).trim();
  const requiredMajor = Number(requiredNodeVersion.split(".")[0]);
  const currentMajor = Number(process.versions.node.split(".")[0]);
  if (currentMajor < requiredMajor) {
    throw new Error(
      `migrate-users.test.ts spawns scripts/migrate-users.ts via process.execPath, ` +
        `relying on Node's built-in TypeScript type stripping. That needs Node ` +
        `${requiredNodeVersion} (.nvmrc); this process is running Node ` +
        `${process.versions.node}. Switch Node (fnm use / nvm use) before running ` +
        `this file — on the wrong major version it fails with an ESM loader error ` +
        `that looks unrelated to the version, not with this message.`,
    );
  }
}

const run = promisify(execFile);
const SCRIPT = fileURLToPath(
  new URL("../../scripts/migrate-users.ts", import.meta.url),
);
const TARGET_DB = "auth_test_migrate";
// Tagged with this run's suffix, unlike TARGET_DB, which `resetScratchDatabase`
// tags for us. This one is created by hand below because it holds Nhost's
// `auth` schema rather than better-auth's tables, and a fixed name here is a
// database a concurrent run would drop out from under this one.
const SOURCE_DB = scratchDatabaseName("auth_test_migrate_src");

/** Enough of Nhost's `auth` schema for the script's two queries. */
const SOURCE_DDL = `
CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  disabled boolean NOT NULL DEFAULT false,
  display_name text NOT NULL DEFAULT '',
  avatar_url text NOT NULL DEFAULT '',
  locale varchar(3) NOT NULL DEFAULT 'en',
  email text UNIQUE,
  password_hash text,
  email_verified boolean NOT NULL DEFAULT false,
  default_role text NOT NULL DEFAULT 'user',
  is_anonymous boolean NOT NULL DEFAULT false
);
CREATE TABLE auth.user_providers (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  access_token text NOT NULL,
  refresh_token text,
  provider_id text NOT NULL,
  provider_user_id text NOT NULL,
  UNIQUE (provider_id, provider_user_id)
);
`;

const ALICE = "760a436d-a0d5-491c-a45f-f63204ae9bc0";
const BOB = "eed52e56-6451-47c8-86b5-1f318f0d3a99";
const CAROL = "33333333-3333-4333-8333-333333333333";
const DAVE = "44444444-4444-4444-8444-444444444444";
const EVE = "55555555-5555-4555-8555-555555555555";
const BCRYPT = "$2a$10$N9qo8uLOickgx2ZMRZoMye.IjZAgcfl7p92ldGxad68LJZdL17lhW";

const SOURCE_ROWS = `
INSERT INTO auth.users (id, created_at, updated_at, display_name, avatar_url, email, password_hash, email_verified, default_role, disabled, is_anonymous, locale) VALUES
  ('${ALICE}', '2024-01-04T05:11:18Z', '2024-01-04T05:11:18Z', 'alice',  'https://example.test/a.png', 'alice@test.com', '${BCRYPT}', true,  'user', false, false, 'en'),
  ('${BOB}',   '2024-01-22T02:44:25Z', '2024-01-22T02:44:25Z', 'Bob@Test.com', '',                    'bob@test.com',   NULL,       true,  'user', false, false, 'en'),
  ('${CAROL}', '2024-02-01T00:00:00Z', '2024-02-01T00:00:00Z', 'carol',  '',                          NULL,             '${BCRYPT}', false, 'user', false, false, 'en'),
  ('${DAVE}',  '2024-02-02T00:00:00Z', '2024-02-02T00:00:00Z', 'dave',   '',                          'dave@test.com',  NULL,       false, 'user', false, true,  'en'),
  ('${EVE}',   '2024-02-03T00:00:00Z', '2024-02-03T00:00:00Z', 'eve',    '',                          'Eve@Test.COM',   '${BCRYPT}', true,  'user', true,  false, 'fr');
INSERT INTO auth.user_providers (id, created_at, updated_at, user_id, access_token, refresh_token, provider_id, provider_user_id) VALUES
  ('66666666-6666-4666-8666-666666666666', '2024-01-22T02:45:00Z', '2024-01-22T02:45:00Z', '${BOB}',   'nhost-access-token', 'nhost-refresh-token', 'google',   'google-1'),
  ('77777777-7777-4777-8777-777777777777', '2024-01-22T02:46:00Z', '2024-01-22T02:46:00Z', '${BOB}',   'nhost-access-token', NULL,                  'discord',  'discord-1'),
  ('88888888-8888-4888-8888-888888888888', '2024-02-03T00:01:00Z', '2024-02-03T00:01:00Z', '${EVE}',   'nhost-access-token', NULL,                  'facebook', 'facebook-1'),
  ('99999999-9999-4999-8999-999999999999', '2024-02-02T00:01:00Z', '2024-02-02T00:01:00Z', '${DAVE}',  'nhost-access-token', NULL,                  'google',   'google-2');
`;

const sql = async <T extends Record<string, unknown>>(
  url: string,
  text: string,
  values: unknown[] = [],
): Promise<T[]> => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
};

/** md5 over every row of both tables; changes if anything at all is written. */
const fingerprint = async (url: string): Promise<string> => {
  const rows = await sql<{ f: string }>(
    url,
    `SELECT md5(
        coalesce((SELECT string_agg(u::text, '|' ORDER BY u::text) FROM (SELECT * FROM "user") u), '') ||
        coalesce((SELECT string_agg(a::text, '|' ORDER BY a::text) FROM (SELECT * FROM account) a), '')
      ) AS f`,
  );
  return rows[0]?.f ?? "";
};

/** Sum of row versions; a rewrite of identical data would still move this. */
const rowVersions = async (url: string): Promise<string> => {
  const rows = await sql<{ v: string }>(
    url,
    `SELECT coalesce((SELECT sum(xmin::text::bigint) FROM "user"), 0)::text || ':' ||
            coalesce((SELECT sum(xmin::text::bigint) FROM account), 0)::text AS v`,
  );
  return rows[0]?.v ?? "";
};

describe("scripts/migrate-users.ts", () => {
  let targetUrl: string;
  let sourceUrl: string;

  const migrate = async (...args: string[]): Promise<string> => {
    const { stdout } = await run(process.execPath, [SCRIPT, ...args], {
      env: {
        ...process.env,
        AUTH_DATABASE_URL: targetUrl,
        SOURCE_DATABASE_URL: sourceUrl,
      },
    });
    return stdout;
  };

  beforeAll(async () => {
    targetUrl = await resetScratchDatabase(TARGET_DB);
    // The source is built by hand: it is Nhost's shape, not better-auth's.
    const admin = new Client({
      connectionString: scratchUrl("postgres"),
    });
    await admin.connect();
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${SOURCE_DB}" WITH (FORCE)`);
      await admin.query(`CREATE DATABASE "${SOURCE_DB}"`);
    } finally {
      await admin.end();
    }
    sourceUrl = scratchUrl(SOURCE_DB);
    const client = new Client({ connectionString: sourceUrl });
    await client.connect();
    try {
      await client.query(SOURCE_DDL);
      await client.query(SOURCE_ROWS);
    } finally {
      await client.end();
    }
  }, 60_000);

  afterAll(async () => {
    const admin = new Client({ connectionString: scratchUrl("postgres") });
    await admin.connect();
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${SOURCE_DB}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  });

  it("migrates users, credential accounts and provider accounts", async () => {
    const stdout = await migrate();
    expect(stdout).toContain(
      'users     {"inserted":3,"updated":0,"unchanged":0}',
    );
    // alice + eve credentials, bob×2 + eve social; dave's google row is dropped
    // with dave (anonymous), carol has no email.
    expect(stdout).toContain(
      'accounts  {"inserted":5,"updated":0,"unchanged":0}',
    );
    expect(stdout).toContain("changed   8");

    const users = await sql<{
      id: string;
      email: string;
      name: string;
      image: string | null;
      role: string;
      locale: string;
      disabled: boolean;
      email_verified: boolean;
    }>(targetUrl, `SELECT * FROM "user" ORDER BY email`);
    expect(users.map((u) => u.email)).toEqual([
      "alice@test.com",
      "bob@test.com",
      // lower-cased: better-auth looks users up by email.toLowerCase()
      "eve@test.com",
    ]);
    const alice = users.find((u) => u.id === ALICE);
    expect(alice?.name).toBe("alice");
    // hasura-auth's default display name — the address — is not carried
    // across: a display name is public and the email is not (W4 security F2).
    expect(users.find((u) => u.id === BOB)?.name).toBe("member-eed52e");
    expect(alice?.image).toBe("https://example.test/a.png");
    // '' avatar_url becomes NULL, not an empty string
    expect(users.find((u) => u.id === BOB)?.image).toBeNull();
    const eve = users.find((u) => u.id === EVE);
    expect(eve?.disabled).toBe(true);
    expect(eve?.locale).toBe("fr");
  });

  it("skips users better-auth cannot represent, and their provider rows", async () => {
    const stdout = await migrate();
    expect(stdout).toContain(`${CAROL}: no email`);
    expect(stdout).toContain(`${DAVE}: is_anonymous`);
    expect(stdout).toContain(
      "google:google-2: provider row for a user that was not migrated",
    );
    const rows = await sql(
      targetUrl,
      `SELECT 1 FROM "user" WHERE id = ANY($1)`,
      [[CAROL, DAVE]],
    );
    expect(rows).toHaveLength(0);
  });

  it("copies the bcrypt hash onto a 'credential' account keyed by the user id", async () => {
    const rows = await sql<{ account_id: string; password: string }>(
      targetUrl,
      `SELECT account_id, password FROM account WHERE user_id = $1 AND provider_id = 'credential'`,
      [ALICE],
    );
    // better-auth's email sign-in requires accountId === user.id.
    expect(rows[0]?.account_id).toBe(ALICE);
    expect(rows[0]?.password).toBe(BCRYPT);
  });

  it("migrates the provider binding but not Nhost's OAuth tokens", async () => {
    const rows = await sql<{
      provider_id: string;
      account_id: string;
      access_token: string | null;
      refresh_token: string | null;
    }>(
      targetUrl,
      `SELECT provider_id, account_id, access_token, refresh_token
         FROM account WHERE user_id = $1 AND provider_id <> 'credential' ORDER BY provider_id`,
      [BOB],
    );
    expect(rows.map((r) => [r.provider_id, r.account_id])).toEqual([
      ["discord", "discord-1"],
      ["google", "google-1"],
    ]);
    for (const row of rows) {
      expect(row.access_token).toBeNull();
      expect(row.refresh_token).toBeNull();
    }
  });

  it("changes nothing on a second run", async () => {
    const before = await fingerprint(targetUrl);
    const versionsBefore = await rowVersions(targetUrl);

    for (const args of [[], ["--update-existing"]]) {
      const stdout = await migrate(...args);
      expect(stdout).toContain(
        'users     {"inserted":0,"updated":0,"unchanged":3}',
      );
      expect(stdout).toContain(
        'accounts  {"inserted":0,"updated":0,"unchanged":5}',
      );
      expect(stdout).toContain("changed   0");
      expect(await fingerprint(targetUrl)).toBe(before);
      // Not merely "same values": no row was rewritten at all.
      expect(await rowVersions(targetUrl)).toBe(versionsBefore);
    }
  });

  it("changes nothing after the new stack has re-hashed and touched a row", async () => {
    // Exactly what a sign-in does: bcrypt hash replaced with scrypt, and
    // `updated_at` moved off the value the source holds.
    await sql(
      targetUrl,
      `UPDATE account SET password = 'scrypt-hash-written-after-sign-in', updated_at = now()
        WHERE user_id = $1 AND provider_id = 'credential'`,
      [ALICE],
    );
    const versionsBefore = await rowVersions(targetUrl);

    for (const args of [[], ["--update-existing"]]) {
      const stdout = await migrate(...args);
      expect(stdout).toContain("changed   0");
      // Not even a rewrite-with-the-same-values.
      expect(await rowVersions(targetUrl)).toBe(versionsBefore);
      const rows = await sql<{ password: string }>(
        targetUrl,
        `SELECT password FROM account WHERE user_id = $1 AND provider_id = 'credential'`,
        [ALICE],
      );
      expect(rows[0]?.password).toBe("scrypt-hash-written-after-sign-in");
    }
  });

  it("leaves an existing user alone unless --update-existing is passed", async () => {
    await sql(
      sourceUrl,
      `UPDATE auth.users SET display_name = 'alice renamed', updated_at = now() WHERE id = $1`,
      [ALICE],
    );

    const withoutFlag = await migrate();
    expect(withoutFlag).toContain(
      'users     {"inserted":0,"updated":0,"unchanged":3}',
    );
    const unchanged = await sql<{ name: string }>(
      targetUrl,
      `SELECT name FROM "user" WHERE id = $1`,
      [ALICE],
    );
    expect(unchanged[0]?.name).toBe("alice");

    const stdout = await migrate("--update-existing");
    expect(stdout).toContain(
      'users     {"inserted":0,"updated":1,"unchanged":2}',
    );
    const rows = await sql<{ n: string }>(
      targetUrl,
      `SELECT count(*)::text AS n FROM "user"`,
    );
    expect(rows[0]?.n).toBe("3");
    const named = await sql<{ name: string }>(
      targetUrl,
      `SELECT name FROM "user" WHERE id = $1`,
      [ALICE],
    );
    expect(named[0]?.name).toBe("alice renamed");
  });

  it("never writes to the source database", async () => {
    const rows = await sql<{ n: string }>(
      sourceUrl,
      `SELECT count(*)::text AS n FROM auth.users`,
    );
    expect(rows[0]?.n).toBe("5");
  });
});
