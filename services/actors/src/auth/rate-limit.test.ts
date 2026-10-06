/**
 * W4 security F3: better-auth's limiter keyed every user on one address.
 *
 * These run the real better-auth, with its limiter switched on (it is on in
 * production by default and off under test), behind the real Express mount,
 * over a loopback listener — so the path under test is exactly
 * `resolveClientIp` → `sessionExchangeLimiter` → better-auth, as it runs in
 * the actor host. What they prove:
 *
 *   - two clients the Next proxy vouches for get separate buckets, so one
 *     client's failed sign-ins cannot lock out another (the defect);
 *   - a client address claimed *without* the proxy secret is ignored, however
 *     often it changes, so it cannot be used to dodge the limit either;
 *   - with the secret, `x-forwarded-for` is ignored in favour of the claim;
 *   - the Next server's own `/token` exchanges are not counted per address at
 *     all, but per session.
 *
 * Needs the stack's Postgres (`bun run stack:up`, host port 5433).
 */
import type { AddressInfo } from "node:net";
import { hash as bcryptHash } from "bcryptjs";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthInstance } from "./auth.ts";
import { CLIENT_IP_HEADER, PROXY_SECRET_HEADER } from "./client-ip.ts";
import { AUTH_BASE_PATH, createAppWithAuth } from "./mount.ts";
import { makeTestAuth, resetScratchDatabase } from "./testing.ts";

const SECRET = "a-test-proxy-secret-that-is-long-enough-0000";
const PASSWORD = "123456789";
const USER = "5e1d2c3b-4a59-4687-9a0b-1c2d3e4f5a61";

const seed = async (url: string): Promise<void> => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, role, disabled)
       VALUES ($1, 'Limited', 'limited@test.com', true, now(), now(), 'user', false)`,
      [USER],
    );
    await client.query(
      `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'credential', $2, $3, now(), now())`,
      [USER, USER, await bcryptHash(PASSWORD, 4)],
    );
  } finally {
    await client.end();
  }
};

describe("better-auth's limiter keys on the client the proxy vouches for", () => {
  let url: string;
  let auth: AuthInstance;
  let closePool: () => Promise<void>;
  let base: string;
  let closeServer: () => Promise<void>;

  beforeAll(async () => {
    url = await resetScratchDatabase("auth_test_rate_limit");
    await seed(url);
    const created = makeTestAuth(url, { rateLimitEnabled: true });
    auth = created.auth;
    closePool = () => created.pool.end();
    const server = createAppWithAuth(auth, {
      proxySecret: SECRET,
      sessionExchangeLimit: { max: 3, windowSeconds: 60 },
    }).listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    closeServer = () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      });
  }, 60_000);

  afterAll(async () => {
    await closeServer?.();
    await closePool?.();
  });

  const badSignIn = (headers: Record<string, string>) =>
    fetch(`${base}${AUTH_BASE_PATH}/sign-in/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        ...headers,
      },
      body: JSON.stringify({
        email: "limited@test.com",
        password: "wrong-password",
      }),
    }).then((r) => r.status);

  const vouched = (ip: string) => ({
    [PROXY_SECRET_HEADER]: SECRET,
    [CLIENT_IP_HEADER]: ip,
  });

  it("gives two vouched-for clients separate buckets", async () => {
    // better-auth's default for /sign-in*: 3 per 10 s.
    const attacker = [];
    for (let i = 0; i < 4; i += 1) {
      attacker.push(await badSignIn(vouched("203.0.113.10")));
    }
    expect(attacker).toEqual([401, 401, 401, 429]);
    // Another user, through the same proxy, is unaffected.
    expect(await badSignIn(vouched("198.51.100.20"))).toBe(401);
  });

  it("ignores a client address claimed without the secret, however it rotates", async () => {
    const statuses = [];
    for (let i = 0; i < 4; i += 1) {
      statuses.push(
        await badSignIn({
          [CLIENT_IP_HEADER]: `192.0.2.${String(i + 1)}`,
          [PROXY_SECRET_HEADER]: "not-the-secret",
          "x-forwarded-for": "192.0.2.200",
        }),
      );
    }
    // All four counted against one bucket — the address the nearest proxy
    // wrote (here the test's own x-forwarded-for) — not four.
    expect(statuses).toEqual([401, 401, 401, 429]);
  });

  it("with the secret, keys on the claim and not on x-forwarded-for", async () => {
    // The same XFF as the exhausted bucket above: had it been read, this
    // would be a 429.
    expect(
      await badSignIn({
        ...vouched("198.51.100.30"),
        "x-forwarded-for": "192.0.2.200",
      }),
    ).toBe(401);
  });

  it("counts the server's /token exchange per session, not per address", async () => {
    const signedIn = await fetch(`${base}${AUTH_BASE_PATH}/sign-in/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        ...vouched("198.51.100.40"),
      },
      body: JSON.stringify({ email: "limited@test.com", password: PASSWORD }),
    });
    expect(signedIn.status).toBe(200);
    // better-auth records the address its limiter keyed on — the check the
    // E4 runbook's step (0e) reads in production.
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const { rows } = await client.query<{ ip_address: string }>(
        "SELECT ip_address FROM session ORDER BY created_at DESC LIMIT 1",
      );
      expect(rows[0]?.ip_address).toBe("198.51.100.40");
    } finally {
      await client.end();
    }
    const cookie = signedIn.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");

    const token = (headers: Record<string, string>) =>
      fetch(`${base}${AUTH_BASE_PATH}/token`, {
        headers: { cookie, ...headers },
      }).then((r) => r.status);

    // The limit here is 3 per session (the listener's option above).
    const server = [];
    for (let i = 0; i < 4; i += 1) {
      server.push(await token({ [PROXY_SECRET_HEADER]: SECRET }));
    }
    expect(server).toEqual([200, 200, 200, 429]);

    // Unverified, the same path keeps better-auth's per-address rule (100
    // per 10 s) — which is why the session limit did not apply to it.
    expect(await token({ "x-forwarded-for": "192.0.2.77" })).toBe(200);
  });

  it("exempts the verified exchange from better-auth's per-address rule", async () => {
    // A listener whose per-session limit is out of the way, so what binds —
    // if anything does — is better-auth's own 100 per 10 s per address. Every
    // request below arrives from the same socket with no claimed address, as
    // the Next server's token.ts sends them.
    const roomy = createAppWithAuth(auth, {
      proxySecret: SECRET,
      sessionExchangeLimit: { max: 1000, windowSeconds: 60 },
    }).listen(0, "127.0.0.1");
    await new Promise((resolve) => roomy.once("listening", resolve));
    const roomyBase = `http://127.0.0.1:${(roomy.address() as AddressInfo).port}`;
    try {
      const signedIn = await fetch(
        `${roomyBase}${AUTH_BASE_PATH}/sign-in/email`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost:3000",
            ...vouched("198.51.100.50"),
          },
          body: JSON.stringify({
            email: "limited@test.com",
            password: PASSWORD,
          }),
        },
      );
      const cookie = signedIn.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
      const statuses = new Set<number>();
      for (let i = 0; i < 110; i += 1) {
        const response = await fetch(`${roomyBase}${AUTH_BASE_PATH}/token`, {
          headers: { cookie, [PROXY_SECRET_HEADER]: SECRET },
        });
        statuses.add(response.status);
      }
      expect([...statuses]).toEqual([200]);
    } finally {
      await new Promise((resolve) => {
        roomy.close(() => resolve(undefined));
      });
    }
  });
});
