/**
 * F8 (W4 security review): disabling a user ends what they already hold.
 *
 * Before this, `disabled` was enforced only when a session was *created*. A
 * session that existed at the moment of disabling went on minting JWTs from
 * `/api/auth/token` and sliding its own expiry forward for the rest of its
 * seven days. Three layers now close that, and each is tested on its own:
 *
 *   1. the database trigger (`packages/db/migrations/…_disabled_user_ends_sessions`)
 *      deletes the user's sessions in the transaction that disables them;
 *   2. `definePayload` refuses to sign a token for a disabled user;
 *   3. `session.update.before` refuses to refresh a disabled user's session.
 *
 * (2) and (3) run against a database *without* the trigger — the scratch
 * database is built from `transform/13` only — which is exactly the case they
 * exist for: a session row the trigger never saw.
 *
 * Needs the stack's Postgres (`bun run stack:up`, host port 5433).
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { hash as bcryptHash } from "bcryptjs";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthInstance } from "./auth.ts";
import { makeTestAuth, resetScratchDatabase } from "./testing.ts";

const BASE = "http://localhost:3002";
const PASSWORD = "123456789";

const MIGRATIONS = fileURLToPath(
  new URL("../../../../packages/db/migrations/", import.meta.url),
);

const migrationSql = async (suffix: string): Promise<string> => {
  const name = (await readdir(MIGRATIONS)).find((dir) => dir.endsWith(suffix));
  if (name === undefined) throw new Error(`no migration named *${suffix}`);
  return readFile(`${MIGRATIONS}${name}/migration.sql`, "utf8");
};

const withClient = async <T>(
  url: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
};

const seedUser = async (
  url: string,
  id: string,
  email: string,
): Promise<void> => {
  const hash = await bcryptHash(PASSWORD, 4);
  await withClient(url, async (client) => {
    await client.query(
      `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, role, locale, disabled)
       VALUES ($1, 'someone', $2, true, now(), now(), 'user', 'en', false)`,
      [id, email],
    );
    await client.query(
      `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'credential', $2, $3, now(), now())`,
      [id, id, hash],
    );
  });
};

const setDisabled = (url: string, id: string, disabled: boolean) =>
  withClient(url, (client) =>
    client.query(`UPDATE "user" SET disabled = $2 WHERE id = $1`, [
      id,
      disabled,
    ]),
  );

const sessionCount = (url: string, id: string): Promise<number> =>
  withClient(url, async (client) => {
    const { rows } = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM session WHERE user_id = $1`,
      [id],
    );
    return Number(rows[0]?.n ?? 0);
  });

/**
 * Puts the user's sessions one minute past better-auth's refresh threshold:
 * `expiresAt - expiresIn + updateAge <= now` with the defaults (7 days, 1 day)
 * is `expiresAt <= now + 6 days`. Returns the value it wrote.
 */
const ageSessions = (url: string, id: string): Promise<string> =>
  withClient(url, async (client) => {
    const { rows } = await client.query<{ expires_at: Date }>(
      `UPDATE session SET expires_at = now() + interval '6 days' - interval '1 minute'
        WHERE user_id = $1 RETURNING expires_at`,
      [id],
    );
    return String(rows[0]?.expires_at.toISOString());
  });

const expiresAt = (url: string, id: string): Promise<string> =>
  withClient(url, async (client) => {
    const { rows } = await client.query<{ expires_at: Date }>(
      `SELECT expires_at FROM session WHERE user_id = $1`,
      [id],
    );
    return String(rows[0]?.expires_at.toISOString());
  });

const signIn = async (auth: AuthInstance, email: string): Promise<string> => {
  const response = await auth.handler(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    }),
  );
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
};

const get = (auth: AuthInstance, path: string, cookie: string) =>
  auth.handler(new Request(`${BASE}/api/auth${path}`, { headers: { cookie } }));

describe("a disabled user's existing session (application guards)", () => {
  let url: string;
  let auth: AuthInstance;
  let close: () => Promise<void>;

  const ENABLED = "0b6f3c1e-5d8a-4c2f-9e7b-1a2b3c4d5e61";
  const TOKEN_USER = "0b6f3c1e-5d8a-4c2f-9e7b-1a2b3c4d5e62";
  const REFRESH_USER = "0b6f3c1e-5d8a-4c2f-9e7b-1a2b3c4d5e63";

  beforeAll(async () => {
    url = await resetScratchDatabase("auth_test_disabled_app");
    await seedUser(url, ENABLED, "enabled@test.com");
    await seedUser(url, TOKEN_USER, "token@test.com");
    await seedUser(url, REFRESH_USER, "refresh@test.com");
    const created = makeTestAuth(url);
    auth = created.auth;
    close = () => created.pool.end();
  }, 60_000);

  afterAll(async () => {
    await close?.();
  });

  it("mints no JWT once the user is disabled, though the session row survives", async () => {
    const cookie = await signIn(auth, "token@test.com");
    expect((await get(auth, "/token", cookie)).status).toBe(200);

    await setDisabled(url, TOKEN_USER, true);
    // No trigger in this database: the row is still there, which is the case
    // this guard is for.
    expect(await sessionCount(url, TOKEN_USER)).toBe(1);

    const refused = await get(auth, "/token", cookie);
    expect(refused.status).toBe(401);
    expect(await refused.text()).not.toContain("token");
  });

  it("still refreshes an enabled user's ageing session (the control)", async () => {
    const cookie = await signIn(auth, "enabled@test.com");
    const aged = await ageSessions(url, ENABLED);

    const response = await get(auth, "/get-session", cookie);
    expect(response.status).toBe(200);
    expect(await expiresAt(url, ENABLED)).not.toBe(aged);
    // The refresh re-issues the session cookie with a new Max-Age.
    expect(
      response.headers
        .getSetCookie()
        .some((c) => c.includes("better-auth.session_token=")),
    ).toBe(true);
  });

  it("refuses to refresh a disabled user's ageing session", async () => {
    const cookie = await signIn(auth, "refresh@test.com");
    await setDisabled(url, REFRESH_USER, true);
    const aged = await ageSessions(url, REFRESH_USER);

    const session = await get(auth, "/get-session", cookie);
    expect(session.status).not.toBe(200);
    // The same refresh, reached through /token's sessionMiddleware.
    expect((await get(auth, "/token", cookie)).status).toBe(401);

    expect(await expiresAt(url, REFRESH_USER)).toBe(aged);
  });
});

describe("disabling a user deletes their sessions (the migration)", () => {
  let url: string;
  let auth: AuthInstance;
  let close: () => Promise<void>;

  const LIVE = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e51";
  const ALREADY_DISABLED = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e52";
  const BYSTANDER = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e53";

  beforeAll(async () => {
    url = await resetScratchDatabase("auth_test_disabled_trigger");
    await seedUser(url, LIVE, "live@test.com");
    await seedUser(url, ALREADY_DISABLED, "already@test.com");
    await seedUser(url, BYSTANDER, "bystander@test.com");
    const created = makeTestAuth(url);
    auth = created.auth;
    close = () => created.pool.end();
  }, 60_000);

  afterAll(async () => {
    await close?.();
  });

  it("backfills: a user disabled before the migration loses their sessions when it runs", async () => {
    await signIn(auth, "already@test.com");
    await signIn(auth, "bystander@test.com");
    // Disabled with no trigger in place — the pre-migration world.
    await setDisabled(url, ALREADY_DISABLED, true);
    expect(await sessionCount(url, ALREADY_DISABLED)).toBe(1);

    const sql = await migrationSql("_disabled_user_ends_sessions");
    await withClient(url, (client) => client.query(sql));

    expect(await sessionCount(url, ALREADY_DISABLED)).toBe(0);
    expect(await sessionCount(url, BYSTANDER)).toBe(1);
  });

  it("deletes a user's sessions in the UPDATE that disables them, and only theirs", async () => {
    const cookie = await signIn(auth, "live@test.com");
    await signIn(auth, "live@test.com");
    expect(await sessionCount(url, LIVE)).toBe(2);

    await setDisabled(url, LIVE, true);

    expect(await sessionCount(url, LIVE)).toBe(0);
    expect(await sessionCount(url, BYSTANDER)).toBe(1);
    expect((await get(auth, "/token", cookie)).status).toBe(401);
    const session = await get(auth, "/get-session", cookie);
    expect(await session.json()).toBeNull();
  });

  it("does not fire on re-enabling or on a no-op write", async () => {
    await setDisabled(url, BYSTANDER, false);
    expect(await sessionCount(url, BYSTANDER)).toBe(1);
  });
});
