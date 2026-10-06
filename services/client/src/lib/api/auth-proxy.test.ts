/**
 * `proxyAuthRequest` — the browser-facing half of `/api/auth/*`.
 *
 * `proxy.test.ts` covers `forwardRequest` itself. This file is about what the
 * *browser* is told it may do with the answer, which is a different question
 * and one only this layer can answer: in production nothing reaches
 * `services/actors` directly, so this app's own response is what a CDN or a
 * corporate proxy sees.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { proxyAuthRequest } from "./auth-proxy.ts";

const upstream = (response: Response) => async (): Promise<Response> =>
  response;

const get = async (path: string, response: Response): Promise<Response> =>
  await proxyAuthRequest(
    new Request(`http://localhost:3000${path}`),
    upstream(response),
  );

/* -------------------------------------------------------------------------- *
 * E5d — a bearer JWT served without `Cache-Control`.
 *
 * `GET /api/auth/token` answers a session cookie with a 15-minute EdDSA JWT,
 * and it used to arrive here with no `Cache-Control` and no `Expires` at all.
 * A 200 with neither is exactly what RFC 9111 §4.2.2 lets a shared cache store
 * on a heuristic freshness lifetime of its own choosing — and the body is a
 * credential. The upstream sets the header now too; this layer does not depend
 * on it having remembered.
 * -------------------------------------------------------------------------- */
test("a proxied token response is never storable", async () => {
  const response = await get(
    "/api/auth/token",
    new Response('{"token":"ey.."}', {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );

  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(await response.text(), '{"token":"ey.."}');
});

test("overrides a storable header the upstream sent", async () => {
  const response = await get(
    "/api/auth/token",
    new Response("{}", {
      status: 200,
      headers: { "cache-control": "public, max-age=600" },
    }),
  );

  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("covers the session endpoints too, not just /token", async () => {
  for (const path of [
    "/api/auth/get-session",
    "/api/auth/sign-in/email",
    "/api/auth/sign-out",
    "/api/auth/callback/google",
  ]) {
    const response = await get(path, new Response("{}", { status: 200 }));
    assert.equal(
      response.headers.get("cache-control"),
      "no-store",
      `${path} is storable`,
    );
  }
});

/**
 * The exception, and the reason this is a path check rather than a blanket
 * rule: `/jwks` is a public key set that `services/api` fetches to verify
 * every JWT. Caching it is the point.
 */
test("leaves /jwks cacheable", async () => {
  const response = await get(
    "/api/auth/jwks",
    new Response('{"keys":[]}', {
      status: 200,
      headers: { "cache-control": "public, max-age=3600" },
    }),
  );

  assert.equal(response.headers.get("cache-control"), "public, max-age=3600");
  assert.equal(response.headers.get("pragma"), null);
});

/**
 * The trap this rewrite could have walked into. `new Headers(response.headers)`
 * folds repeated fields into one comma-joined value, and `Set-Cookie`'s
 * `Expires` attribute contains a comma — so a sign-out's three cookies would
 * come back as one broken string, and the session would not clear. The copy
 * goes through `downstreamHeaders` for exactly this reason.
 */
test("keeps all three of a sign-out's cookies while adding the header", async () => {
  const headers = new Headers();
  headers.append(
    "set-cookie",
    "better-auth.session_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
  );
  headers.append("set-cookie", "better-auth.session_data=; Max-Age=0; Path=/");
  headers.append("set-cookie", "better-auth.dont_remember=; Max-Age=0; Path=/");

  const response = await get(
    "/api/auth/sign-out",
    new Response("{}", { status: 200, headers }),
  );

  assert.equal(response.headers.getSetCookie().length, 3);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("a 401 with no session is not storable either", async () => {
  const response = await get(
    "/api/auth/token",
    new Response('{"message":"unauthorized"}', { status: 401 }),
  );

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("still refuses a path outside the auth base", async () => {
  const response = await proxyAuthRequest(
    new Request("http://localhost:3000/api/graphql"),
    upstream(new Response("{}", { status: 200 })),
  );

  assert.equal(response.status, 404);
});
