/**
 * Where an active user's session cookie gets renewed — the actor-host half of
 * the W4 api-client note "server-side calls drop better-auth's refreshed
 * Set-Cookie".
 *
 * better-auth issues the session cookie with `Max-Age` = `expiresIn` (7 days)
 * at sign-in. Once `updateAge` (1 day) has passed, the next session read
 * slides the `session` row's `expiresAt` forward **and** re-issues the cookie
 * with a fresh `Max-Age` — the row and the cookie move together, or the
 * browser drops a cookie whose row is still alive.
 *
 * The browser never reads the session itself: `/api/graphql` exchanges the
 * cookie at `/token` server-side (`services/client/src/lib/api/token.ts`). So
 * `/token` is where the refresh happens, and this pins that it *does* answer
 * with the renewed cookie — which is the one the Next server must relay.
 *
 * Needs the stack's Postgres (`bun run stack:up`, host port 5433).
 */
import { hash as bcryptHash } from "bcryptjs";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthInstance } from "./auth.ts";
import { makeTestAuth, resetScratchDatabase } from "./testing.ts";

/**
 * The Next server's own `/api/graphql` handler — pure TypeScript, no `next/*`
 * — so the whole hop can run here against the real better-auth. Loaded by a
 * computed specifier: `services/client` is a different TypeScript program
 * (CommonJS-flavoured, its own paths), and a literal import would pull it
 * into this package's `tsc`. The signature is restated, narrowly, below.
 */
type ProxyGraphql = (
  request: Request,
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>,
) => Promise<Response>;
const GRAPHQL_PROXY_MODULE = new URL(
  "../../../client/src/lib/api/graphql-proxy.ts",
  import.meta.url,
).href;
const loadProxyGraphql = async (): Promise<ProxyGraphql> =>
  (
    (await import(GRAPHQL_PROXY_MODULE)) as {
      proxyGraphqlRequest: ProxyGraphql;
    }
  ).proxyGraphqlRequest;

const BASE = "http://localhost:3002";
const PASSWORD = "123456789";
const USER = "6f7a8b9c-0d1e-4f2a-8b3c-4d5e6f7a8b91";
const SEVEN_DAYS = 7 * 24 * 60 * 60;

describe("/token renews an ageing session's cookie", () => {
  let url: string;
  let auth: AuthInstance;
  let close: () => Promise<void>;

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
    url = await resetScratchDatabase("auth_test_session_refresh");
    await query(
      `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, role, disabled)
       VALUES ($1, 'Active', 'active@test.com', true, now(), now(), 'user', false)`,
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

  afterAll(async () => {
    await close?.();
  });

  const sessionCookieOf = (response: Response): string | undefined =>
    response.headers
      .getSetCookie()
      .find((c) => c.startsWith("better-auth.session_token="));

  it("answers with no cookie while the session is fresh, and a renewed one once it has aged", async () => {
    const signedIn = await auth.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "active@test.com", password: PASSWORD }),
      }),
    );
    const issued = sessionCookieOf(signedIn);
    expect(issued).toContain(`Max-Age=${SEVEN_DAYS}`);
    const cookie = (issued ?? "").split(";")[0] ?? "";

    const fresh = await auth.handler(
      new Request(`${BASE}/api/auth/token`, { headers: { cookie } }),
    );
    expect(fresh.status).toBe(200);
    expect(sessionCookieOf(fresh)).toBeUndefined();

    // A day and a minute after sign-in, in the row's terms.
    await query(
      `UPDATE session SET expires_at = now() + interval '6 days' - interval '1 minute' WHERE user_id = $1`,
      [USER],
    );
    const aged = await auth.handler(
      new Request(`${BASE}/api/auth/token`, { headers: { cookie } }),
    );
    expect(aged.status).toBe(200);
    // The row slid forward…
    const [row] = await query<{ ahead: boolean }>(
      `SELECT expires_at > now() + interval '6 days 23 hours' AS ahead FROM session WHERE user_id = $1`,
      [USER],
    );
    expect(row?.ahead).toBe(true);
    // …and the only thing that moves the browser's copy with it is this
    // header, on a response the browser never sees unless the Next server
    // passes it on.
    expect(sessionCookieOf(aged)).toContain(`Max-Age=${SEVEN_DAYS}`);
  });

  /*
   * End to end: the Next server's `/api/graphql` handler, unmodified, with
   * the real better-auth answering its token exchange and a stub standing in
   * for services/api. The cookie better-auth re-issues is on the response the
   * browser gets. Before the relay, this response carried no Set-Cookie at
   * all, and the browser's cookie ran out seven days after sign-in.
   */
  it("reaches the browser through /api/graphql once the session has aged", async () => {
    const signedIn = await auth.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "active@test.com", password: PASSWORD }),
      }),
    );
    const cookie = (sessionCookieOf(signedIn) ?? "").split(";")[0] ?? "";
    await query(
      `UPDATE session SET expires_at = now() + interval '6 days' - interval '1 minute' WHERE user_id = $1`,
      [USER],
    );

    const apiCalls: string[] = [];
    const proxyGraphqlRequest = await loadProxyGraphql();
    const response = await proxyGraphqlRequest(
      new Request("http://localhost:3000/api/graphql", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ query: "{ __typename }" }),
      }),
      async (url, init) => {
        if (url.startsWith(`${BASE}/api/auth/`)) {
          return auth.handler(new Request(url, init));
        }
        apiCalls.push(url);
        return Response.json({ data: { __typename: "Query" } });
      },
    );

    expect(response.status).toBe(200);
    expect(apiCalls).toHaveLength(1);
    const relayed = sessionCookieOf(response);
    expect(relayed).toContain(`Max-Age=${SEVEN_DAYS}`);
    expect(relayed?.split(";")[0]).toBe(cookie);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
