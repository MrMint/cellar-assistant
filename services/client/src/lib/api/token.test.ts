import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bearerHeader,
  fetchApiToken,
  fetchSession,
  TokenExchangeError,
} from "./token.ts";

const authOrigin = "http://actors.test";

test("does not call the actors app when there is no session cookie", async () => {
  let called = false;
  const token = await fetchApiToken({
    authOrigin,
    cookieHeader: null,
    fetchImpl: async () => {
      called = true;
      return new Response("{}");
    },
  });
  assert.equal(token, null);
  assert.equal(called, false);
});

test("exchanges the cookie at /api/auth/token with no-store", async () => {
  let url: string | undefined;
  let init: RequestInit | undefined;

  const token = await fetchApiToken({
    authOrigin,
    cookieHeader: "better-auth.session_token=s",
    fetchImpl: async (requestUrl, requestInit) => {
      url = requestUrl;
      init = requestInit;
      return Response.json({ token: "jwt.value.here" });
    },
  });

  assert.equal(url, "http://actors.test/api/auth/token");
  assert.equal(
    new Headers(init?.headers).get("cookie"),
    "better-auth.session_token=s",
  );
  // Every viewer requests this same URL and differs only by Cookie. A response
  // cache keyed on URL would hand one viewer another viewer's token.
  assert.equal(init?.cache, "no-store");
  assert.equal(token, "jwt.value.here");
});

test("401 means anonymous, not broken", async () => {
  const token = await fetchApiToken({
    authOrigin,
    cookieHeader: "better-auth.session_token=stale",
    fetchImpl: async () => new Response("{}", { status: 401 }),
  });
  assert.equal(token, null);
});

test("a 5xx is a fault and is raised", async () => {
  await assert.rejects(
    fetchApiToken({
      authOrigin,
      cookieHeader: "better-auth.session_token=s",
      fetchImpl: async () => new Response("boom", { status: 503 }),
    }),
    (error: unknown) =>
      error instanceof TokenExchangeError && error.status === 503,
  );
});

test("a 200 without a token is a contract break, not an anonymous viewer", async () => {
  await assert.rejects(
    fetchApiToken({
      authOrigin,
      cookieHeader: "better-auth.session_token=s",
      fetchImpl: async () => Response.json({ ok: true }),
    }),
    TokenExchangeError,
  );
});

test("bearerHeader sends no header at all when anonymous", () => {
  assert.deepEqual(bearerHeader(null), {});
  assert.deepEqual(bearerHeader("abc"), { authorization: "Bearer abc" });
});

test("a 429 is raised as rate-limited, carrying the actor's Retry-After", async () => {
  for (const header of ["retry-after", "x-retry-after"]) {
    await assert.rejects(
      fetchApiToken({
        authOrigin,
        cookieHeader: "better-auth.session_token=s",
        fetchImpl: async () =>
          new Response("{}", { status: 429, headers: { [header]: "17" } }),
      }),
      (error: unknown) =>
        error instanceof TokenExchangeError &&
        error.rateLimited &&
        error.retryAfterSeconds === 17,
    );
  }
});

test("fetchSession: 200 null and 401 are no session; a 429 or 5xx is raised, not a sign-out", async () => {
  const read = (response: Response) =>
    fetchSession({
      authOrigin,
      cookieHeader: "better-auth.session_token=s",
      fetchImpl: async () => response,
    });
  assert.equal(await read(Response.json(null)), null);
  assert.equal(await read(new Response("{}", { status: 401 })), null);
  assert.deepEqual(
    await read(Response.json({ user: { id: "u" }, session: {} })),
    { user: { id: "u" }, session: {} },
  );
  for (const status of [429, 500, 503]) {
    await assert.rejects(
      read(new Response("{}", { status, headers: { "x-retry-after": "3" } })),
      (error: unknown) =>
        error instanceof TokenExchangeError && error.status === status,
      `a ${status} must not read as "signed out"`,
    );
  }
});

test("fetchSession makes no request without a cookie", async () => {
  let called = false;
  const session = await fetchSession({
    authOrigin,
    cookieHeader: null,
    fetchImpl: async () => {
      called = true;
      return Response.json(null);
    },
  });
  assert.equal(session, null);
  assert.equal(called, false);
});
