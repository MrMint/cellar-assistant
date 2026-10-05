/**
 * The Next proxy's daily session check against the real better-auth — the
 * server-component half of "the refreshed session cookie never reaches the
 * browser" (`session-refresh.test.ts` is the `/api/graphql` half).
 *
 * A viewer whose pages are all server-rendered never calls `/api/graphql`, and
 * a server component cannot set a cookie, so before the check their cookie
 * expired seven days after sign-in while the row lived on. Here the Next
 * server's own `src/proxy.ts`, unmodified, runs with `fetch` pointed at this
 * better-auth: an aged session's page request comes back carrying the renewed
 * cookie and the daily marker, and the next request — marker in hand — does
 * not touch the actor host.
 *
 * Needs the stack's Postgres (`bun run stack:up`, host port 5433).
 */
import { hash as bcryptHash } from "bcryptjs";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AuthInstance } from "./auth.ts";
import { makeTestAuth, resetScratchDatabase } from "./testing.ts";

/**
 * `services/client/src/proxy.ts` and the `NextRequest` it takes, loaded by a
 * computed specifier (see `session-refresh.test.ts` for why not a literal
 * import). `next/server` resolves from the client's own `node_modules`, as it
 * does in the Next build. The shapes are restated narrowly.
 */
type ProxyFn = (request: Request) => Promise<Response>;
type NextRequestCtor = new (url: string, init?: RequestInit) => Request;
const CLIENT = new URL("../../../client/", import.meta.url);
const loadProxy = async (): Promise<{
  proxy: ProxyFn;
  NextRequest: NextRequestCtor;
}> => {
  const { proxy } = (await import(new URL("src/proxy.ts", CLIENT).href)) as {
    proxy: ProxyFn;
  };
  const { NextRequest } = (await import(
    new URL("node_modules/next/server.js", CLIENT).href
  )) as { NextRequest: NextRequestCtor };
  return { proxy, NextRequest };
};

const BASE = "http://localhost:3002";
const PASSWORD = "123456789";
const USER = "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c02";
const SEVEN_DAYS = 7 * 24 * 60 * 60;

describe("the Next proxy renews a server-rendered viewer's session cookie", () => {
  let url: string;
  let auth: AuthInstance;
  let close: () => Promise<void>;
  const realFetch = globalThis.fetch;
  const savedOrigin = process.env.BETTER_AUTH_ORIGIN;

  const query = async <T>(text: string, values: unknown[]): Promise<T[]> => {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      return (await client.query(text, values)).rows as T[];
    } finally {
      await client.end();
    }
  };

  beforeAll(async () => {
    url = await resetScratchDatabase("auth_test_proxy_session_check");
    await query(
      `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, role, disabled)
       VALUES ($1, 'Server', 'server@test.com', true, now(), now(), 'user', false)`,
      [USER],
    );
    await query(
      `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'credential', $2, $3, now(), now())`,
      [USER, USER, await bcryptHash(PASSWORD, 4)],
    );
    const created = makeTestAuth(url);
    auth = created.auth;
    close = () => created.pool.end();
  }, 60_000);

  afterEach(() => {
    globalThis.fetch = realFetch;
    if (savedOrigin === undefined) delete process.env.BETTER_AUTH_ORIGIN;
    else process.env.BETTER_AUTH_ORIGIN = savedOrigin;
  });

  afterAll(async () => {
    await close?.();
  });

  it("relays the renewed cookie once the session has aged, then skips for a day", async () => {
    const signedIn = await auth.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "server@test.com", password: PASSWORD }),
      }),
    );
    const cookie =
      signedIn.headers
        .getSetCookie()
        .find((c) => c.startsWith("better-auth.session_token="))
        ?.split(";")[0] ?? "";
    expect(cookie).not.toBe("");
    // A day and a minute after sign-in, in the row's terms.
    await query(
      `UPDATE session SET expires_at = now() + interval '6 days' - interval '1 minute' WHERE user_id = $1`,
      [USER],
    );

    const actorCalls: string[] = [];
    process.env.BETTER_AUTH_ORIGIN = BASE;
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const target = String(input);
      actorCalls.push(target);
      return auth.handler(new Request(target, init));
    }) as typeof fetch;

    const { proxy, NextRequest } = await loadProxy();
    const first = await proxy(
      new NextRequest("http://localhost:3000/cellars", {
        headers: { cookie: `${cookie}; analytics=1` },
      }),
    );
    expect(first.headers.get("location")).toBeNull();
    expect(actorCalls).toEqual([`${BASE}/api/auth/get-session`]);

    const set = first.headers.getSetCookie();
    const renewed = set.find((c) => c.startsWith("better-auth.session_token="));
    expect(renewed).toContain(`Max-Age=${SEVEN_DAYS}`);
    expect(renewed?.split(";")[0]).toBe(cookie);
    const marker = set.find((c) => c.startsWith("cellar.session_checked="));
    expect(marker).toContain("Max-Age=86400");

    // The row moved with the cookie.
    const [row] = await query<{ ahead: boolean }>(
      `SELECT expires_at > now() + interval '6 days 23 hours' AS ahead FROM session WHERE user_id = $1`,
      [USER],
    );
    expect(row?.ahead).toBe(true);

    const second = await proxy(
      new NextRequest("http://localhost:3000/cellars", {
        headers: { cookie: `${cookie}; ${marker?.split(";")[0] ?? ""}` },
      }),
    );
    expect(second.headers.get("location")).toBeNull();
    expect(second.headers.getSetCookie()).toEqual([]);
    expect(actorCalls).toHaveLength(1);
  });
});
