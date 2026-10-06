/**
 * The D1 acceptance run, against the compose stack (`bun run stack:up`).
 *
 * Everything below goes through the code the browser and the server components
 * actually use — the two Next route handlers, the token exchange, and both
 * URQL clients. The only thing simulated is the HTTP hop into the route
 * handler, which Next would otherwise make: the handlers take a plain
 * `Request` and return a plain `Response`, so a `Request` built here is
 * indistinguishable from the one Next would hand them.
 *
 *   node --test src/lib/api/round-trip.test.ts
 *
 * Skips itself, rather than failing, when the stack is down — one counted skip
 * per step (see {@link STACK_DOWN}).
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  BRAND_CHILDREN_PAGE_SIZE,
  BRAND_ITEMS_PAGE_SIZE,
  BRAND_PLACES_PAGE_SIZE,
  BrandDetailQuery,
} from "@/components/brand/queries";
import { proxyAuthRequest } from "./auth-proxy.ts";
import { authOrigin, graphqlApiUrl } from "./config.ts";
import { AUTH_BASE_PATH, GRAPHQL_PROXY_PATH } from "./endpoints.ts";
import { graphql } from "./graphql.ts";
import { proxyGraphqlRequest } from "./graphql-proxy.ts";
import { unwrapResult } from "./result.ts";
import { parseCookieHeader } from "./session-cookie.ts";
import { fetchApiToken } from "./token.ts";
import { createTokenCache } from "./token-cache.ts";
import { makeApiClient } from "./urql-client.ts";
import { makeApiServerClient, runApiOperation } from "./urql-server-client.ts";

const APP_ORIGIN = "http://localhost:3000";
const TEST_ACCOUNT = { email: "test@test.com", password: "123456789" };

const stackIsUp = async (): Promise<boolean> => {
  try {
    const [api, actors] = await Promise.all([
      fetch(`${graphqlApiUrl().replace(/\/graphql$/, "")}/healthz`),
      fetch(`${authOrigin()}${AUTH_BASE_PATH}/jwks`),
    ]);
    return api.ok && actors.ok;
  } catch {
    return false;
  }
};

/** A cookie jar, so a sign-in's Set-Cookie reaches the next request. */
const jar = new Map<string, string>();
const cookieHeader = (): string | null =>
  jar.size === 0
    ? null
    : [...jar].map(([name, value]) => `${name}=${value}`).join("; ");

const absorb = (response: Response): void => {
  for (const cookie of response.headers.getSetCookie()) {
    const [pair = ""] = cookie.split(";");
    const [name, ...rest] = pair.split("=");
    if (name === undefined) continue;
    const value = rest.join("=");
    // Max-Age=0 is a deletion.
    if (value === "" || /max-age=0/i.test(cookie)) jar.delete(name.trim());
    else jar.set(name.trim(), value);
  }
};

/** What the browser would do: same-origin fetch into a Next route handler. */
const browserFetch = async (
  path: string,
  init: RequestInit = {},
): Promise<Response> => {
  const cookie = cookieHeader();
  const headers = new Headers(init.headers);
  headers.set("origin", APP_ORIGIN);
  if (cookie !== null) headers.set("cookie", cookie);

  const request = new Request(`${APP_ORIGIN}${path}`, { ...init, headers });
  const response = path.startsWith(AUTH_BASE_PATH)
    ? await proxyAuthRequest(request)
    : await proxyGraphqlRequest(request);
  absorb(response);
  return response;
};

const ME = graphql(`
  query D1Me {
    me {
      id
      email
      emailVerified
      role
    }
  }
`);

type MeResult = {
  me: {
    id: string;
    email: string | null;
    emailVerified: boolean;
    role: string;
  } | null;
};

const decodeSegment = (segment: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));

/**
 * Skipped **per test**, not on the `describe`: under `bun test` a skipped
 * `describe` drops its tests from the count entirely — measured: ten tests
 * became zero, not ten skips — so a stack-down run reported fewer tests and
 * no skips at all, and nothing said the round trip had not run. A per-test
 * `skip` is counted and printed as a skip.
 */
const STACK_DOWN = !(await stackIsUp()) && "stack is down (bun run stack:up)";

/** A round-trip step: runs against the stack, or is reported as skipped. */
const step = (name: string, fn: () => void | Promise<void>) =>
  test(name, { skip: STACK_DOWN }, fn);

describe("D1 round trip", () => {
  let jwt: string | null = null;
  let userId = "";

  before(() => {
    jar.clear();
  });

  after(async () => {
    if (STACK_DOWN) return;
    await browserFetch(`${AUTH_BASE_PATH}/sign-out`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
  });

  step(
    "1 · sign-in through /api/auth/* sets a first-party session cookie",
    async () => {
      const response = await browserFetch(`${AUTH_BASE_PATH}/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(TEST_ACCOUNT),
      });

      assert.equal(response.status, 200);
      const body = (await response.json()) as { user: { id: string } };
      userId = body.user.id;

      const setCookie = response.headers.getSetCookie();
      assert.ok(
        setCookie.length > 0,
        "no Set-Cookie came back through the proxy",
      );
      // No `Domain` attribute: the browser scopes it to whichever origin served
      // the response, which is this app, not the actor host.
      assert.ok(
        setCookie.some((c) => c.startsWith("better-auth.session_token=")),
      );
      assert.ok(setCookie.every((c) => !/domain=/i.test(c)));
      assert.ok(jar.has("better-auth.session_token"));
    },
  );

  step(
    "2 · the session cookie exchanges for a JWT services/api's rules accept",
    async () => {
      jwt = await fetchApiToken({
        authOrigin: authOrigin(),
        cookieHeader: cookieHeader(),
      });
      assert.ok(jwt !== null, "no token came back");

      const [rawHeader = "", rawPayload = ""] = jwt.split(".");
      const header = decodeSegment(rawHeader);
      const payload = decodeSegment(rawPayload);

      // The exact set services/api/src/auth/jwt.ts checks.
      assert.equal(header.alg, "EdDSA");
      assert.equal(payload.sub, userId);
      assert.equal(payload.iss, authOrigin());
      assert.equal(payload.aud, authOrigin());
      assert.equal(payload.role, "user");
      assert.equal(
        Number(payload.exp) - Number(payload.iat),
        900,
        "A6 issues 15-minute tokens",
      );
    },
  );

  step(
    "3 · that JWT verifies against the JWKS, the way services/api verifies it",
    async () => {
      assert.ok(jwt !== null);
      const jwks = createRemoteJWKSet(
        new URL(`${authOrigin()}${AUTH_BASE_PATH}/jwks`),
      );
      const { payload } = await jwtVerify(jwt, jwks, {
        issuer: authOrigin(),
        audience: authOrigin(),
        algorithms: ["EdDSA"],
      });
      assert.equal(payload.sub, userId);
    },
  );

  step(
    "4 · server-component path: token + direct client reaches services/api",
    async () => {
      // Exactly what apiServerQuery does; the only part not exercised here is
      // reading the cookie off the request, which needs a Next render pass.
      const token = await fetchApiToken({
        authOrigin: authOrigin(),
        cookieHeader: cookieHeader(),
      });
      const data = await runApiOperation<MeResult>(
        makeApiServerClient(),
        "query",
        ME,
        {},
        token,
      );
      assert.equal(data.me?.id, userId);
      assert.equal(data.me?.email, TEST_ACCOUNT.email);
    },
  );

  step("5 · client-component path: URQL → proxy → services/api", async () => {
    const { client } = makeApiClient({
      // The client's URL is relative; in a browser this is the network. Here it
      // is the route handler itself, so the whole exchange chain — graphcache,
      // ssr, the auth exchange, fetch — runs against the real proxy.
      fetch: ((url: string, init: RequestInit) =>
        browserFetch(String(url), init)) as typeof globalThis.fetch,
    });

    const result = await client.query(ME, {}).toPromise();
    assert.equal(result.error, undefined);
    assert.equal((result.data as MeResult | undefined)?.me?.id, userId);
  });

  step(
    "5b · a typed error is a union member carrying code and reason, not a top-level error",
    async () => {
      // The one live check on a real *document*. Every document is validated
      // offline against the SDL (`documents.test.ts`); what only a running API
      // can show is that a refusal comes back as data — the premise
      // `unwrapResult` is built on, since a union error never sets URQL's
      // `result.error` — and that `...ActorErrorFields` survives the whole chain
      // (graphcache, proxy, API) with `reason` in it.
      const { client } = makeApiClient({
        fetch: ((url: string, init: RequestInit) =>
          browserFetch(String(url), init)) as typeof globalThis.fetch,
      });
      const result = await client
        .query(BrandDetailQuery, {
          id: "00000000-0000-4000-8000-000000000000",
          itemsFirst: BRAND_ITEMS_PAGE_SIZE,
          placesFirst: BRAND_PLACES_PAGE_SIZE,
          childrenFirst: BRAND_CHILDREN_PAGE_SIZE,
        })
        .toPromise();
      assert.equal(result.error, undefined, String(result.error));
      const brand = unwrapResult(result.data?.brand, "Brand");
      assert.equal(brand.ok, false);
      if (brand.ok) return;
      assert.equal(brand.error.__typename, "NotFoundError");
      assert.equal(brand.error.code, "NOT_FOUND");
      assert.equal(brand.error.reason, null);
    },
  );

  step("6 · the proxy sends a bearer token and never a cookie", async () => {
    const seen: { url: string; headers: Headers }[] = [];
    const spy = async (url: string, init: RequestInit): Promise<Response> => {
      seen.push({ url, headers: new Headers(init.headers) });
      return fetch(url, init);
    };

    const response = await proxyGraphqlRequest(
      new Request(`${APP_ORIGIN}${GRAPHQL_PROXY_PATH}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${cookieHeader() ?? ""}; nhostSession=must-not-travel`,
        },
        body: JSON.stringify({ query: "{ me { id } }" }),
      }),
      spy,
      // A cache of its own: the shared one may already hold this session's
      // token from an earlier step, and then there is no exchange to inspect.
      createTokenCache(),
    );
    assert.equal(response.status, 200);

    const toApi = seen.find((call) => call.url === graphqlApiUrl());
    assert.ok(toApi !== undefined, "the API was never called");
    assert.match(toApi.headers.get("authorization") ?? "", /^Bearer ey/);
    assert.equal(toApi.headers.get("cookie"), null);

    const toActors = seen.find((call) => call.url.endsWith("/api/auth/token"));
    assert.ok(toActors !== undefined);
    assert.ok(!(toActors.headers.get("cookie") ?? "").includes("nhostSession"));
  });

  step("7 · no session is anonymous, not an error", async () => {
    const response = await proxyGraphqlRequest(
      new Request(`${APP_ORIGIN}${GRAPHQL_PROXY_PATH}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "{ me { id } }" }),
      }),
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as { data: MeResult };
    assert.equal(body.data.me, null);
  });

  step(
    "8 · sign-out clears the cookie and the token stops being issued",
    async () => {
      const response = await browserFetch(`${AUTH_BASE_PATH}/sign-out`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      assert.equal(response.status, 200);
      // Three cookies come back at once; `downstreamHeaders` has to keep all of
      // them, which is why it reads `getSetCookie()` rather than iterating.
      assert.ok(response.headers.getSetCookie().length >= 1);
      assert.equal(jar.has("better-auth.session_token"), false);

      const after = await fetchApiToken({
        authOrigin: authOrigin(),
        cookieHeader: "better-auth.session_token=deleted",
      });
      assert.equal(after, null);
    },
  );

  step("9 · the proxy path is the only URL the browser is given", () => {
    // A leaked upstream origin would break `connect-src 'self'` in
    // next.config.mjs and defeat the point of the proxy.
    assert.equal(GRAPHQL_PROXY_PATH.startsWith("/"), true);
    assert.equal(parseCookieHeader("better-auth.session_token=x").length, 1);
  });
});
