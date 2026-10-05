/**
 * `/api/graphql`'s three answers to "who is this?", with the actors app and
 * `services/api` played by a stub `fetch`:
 *
 * - **no session cookie** → anonymous, forwarded with no `Authorization`;
 * - **a session cookie the actors app accepts** → forwarded with a bearer;
 * - **a session cookie it rejects** (revoked, expired) → a 401 here, never
 *   forwarded. Before this, the proxy forwarded that request anonymously, so a
 *   dead session read as a signed-out viewer's `FORBIDDEN` ("sign in to see
 *   cellars") and the client's `didAuthError` — which keys on a 401 — could
 *   never fire. The last block runs the real `makeApiClient` against the real
 *   proxy to show the redirect now happens.
 *
 * `round-trip.test.ts` covers the same handler against the live stack.
 */
import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { authOrigin, graphqlApiUrl } from "./config.ts";
import { AUTH_BASE_PATH, GRAPHQL_PROXY_PATH } from "./endpoints.ts";
import { graphql } from "./graphql.ts";
import { proxyGraphqlRequest } from "./graphql-proxy.ts";
import type { FetchLike } from "./proxy.ts";
import { createTokenCache } from "./token-cache.ts";
import { makeApiClient } from "./urql-client.ts";

const APP_ORIGIN = "http://localhost:3000";
const TOKEN_URL = `${authOrigin()}${AUTH_BASE_PATH}/token`;
const SESSION = "better-auth.session_token=abc.def";

type Call = { url: string; headers: Headers };

/** The actors app answers the token exchange with `tokenStatus`; the API with a canned body. */
const stubUpstreams = (tokenStatus: number) => {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers) });
    if (String(url) === TOKEN_URL) {
      return tokenStatus === 200
        ? Response.json({ token: "eyJ.test.token" })
        : new Response(null, { status: tokenStatus });
    }
    if (String(url) === graphqlApiUrl()) {
      return Response.json({ data: { __typename: "Query" } });
    }
    throw new Error(`unexpected upstream ${String(url)}`);
  };
  return {
    fetchImpl,
    calls,
    toApi: () => calls.find((call) => call.url === graphqlApiUrl()),
  };
};

const request = (cookie: string | null): Request =>
  new Request(`${APP_ORIGIN}${GRAPHQL_PROXY_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie === null ? {} : { cookie }),
    },
    body: JSON.stringify({ query: "{ __typename }" }),
  });

describe("proxyGraphqlRequest", () => {
  test("no cookie at all is anonymous: forwarded, no bearer, no exchange", async () => {
    const upstream = stubUpstreams(401);
    const response = await proxyGraphqlRequest(
      request(null),
      upstream.fetchImpl,
    );
    assert.equal(response.status, 200);
    assert.equal(upstream.toApi()?.headers.get("authorization"), null);
    assert.equal(
      upstream.calls.some((call) => call.url === TOKEN_URL),
      false,
    );
  });

  test("better-auth cookies that are not a session stay anonymous when refused", async () => {
    // An OAuth round trip in flight carries `state` but no session yet.
    const upstream = stubUpstreams(401);
    const response = await proxyGraphqlRequest(
      request("better-auth.state=xyz; analytics=1"),
      upstream.fetchImpl,
    );
    assert.equal(response.status, 200);
    assert.equal(upstream.toApi()?.headers.get("authorization"), null);
  });

  test("a live session is forwarded with its bearer", async () => {
    const upstream = stubUpstreams(200);
    const response = await proxyGraphqlRequest(
      request(SESSION),
      upstream.fetchImpl,
    );
    assert.equal(response.status, 200);
    assert.equal(
      upstream.toApi()?.headers.get("authorization"),
      "Bearer eyJ.test.token",
    );
  });

  for (const [label, cookie] of [
    ["better-auth.session_token", SESSION],
    ["__Secure-better-auth.session_token", `__Secure-${SESSION}`],
  ] as const) {
    for (const status of [401, 403]) {
      test(`a ${label} the actors app refuses (${status}) is a 401, not an anonymous request`, async () => {
        const upstream = stubUpstreams(status);
        const response = await proxyGraphqlRequest(
          request(cookie),
          upstream.fetchImpl,
        );
        assert.equal(response.status, 401);
        const body = (await response.json()) as {
          errors: { extensions?: { code?: unknown } }[];
        };
        assert.equal(body.errors[0]?.extensions?.code, "UNAUTHENTICATED");
        assert.equal(upstream.toApi(), undefined, "must not reach the API");
      });
    }
  }

  test("an actors-app failure is still a 502, not a sign-out", async () => {
    const upstream = stubUpstreams(500);
    const response = await proxyGraphqlRequest(
      request(SESSION),
      upstream.fetchImpl,
    );
    assert.equal(response.status, 502);
  });
});

describe("makeApiClient over the real proxy", () => {
  // `network-only`: graphcache answers a bare `__typename` on Query itself,
  // and a request that never leaves the client proves nothing.
  const PingQuery = graphql(`
    query ProxyAuthPing {
      __typename
    }
  `);

  const originalWindow = (globalThis as { window?: unknown }).window;
  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  /** The browser half: the client's fetch lands on the route handler. */
  const clientOver = (cookie: string | null, tokenStatus: number) => {
    const upstream = stubUpstreams(tokenStatus);
    const replaced: string[] = [];
    (globalThis as { window?: unknown }).window = {
      location: { replace: (to: string) => replaced.push(to) },
    };
    const { client } = makeApiClient({
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        if (cookie !== null) headers.set("cookie", cookie);
        return proxyGraphqlRequest(
          new Request(new URL(String(input), APP_ORIGIN), {
            ...init,
            headers,
          }),
          upstream.fetchImpl,
        );
      }) as typeof globalThis.fetch,
    });
    return { client, replaced, upstream };
  };

  test("a revoked session sends the viewer to /sign-in", async () => {
    const { client, replaced, upstream } = clientOver(SESSION, 401);
    const result = await client
      .query(PingQuery, {}, { requestPolicy: "network-only" })
      .toPromise();
    assert.equal(result.error?.response?.status, 401);
    assert.deepEqual(replaced, ["/sign-in"]);
    assert.equal(upstream.toApi(), undefined);
  });

  test("an anonymous viewer is not redirected", async () => {
    const { client, replaced, upstream } = clientOver(null, 401);
    const result = await client
      .query(PingQuery, {}, { requestPolicy: "network-only" })
      .toPromise();
    assert.equal(result.error, undefined);
    assert.deepEqual(replaced, []);
    assert.ok(
      upstream.toApi() !== undefined,
      "the request never left the client",
    );
  });
});

/*
 * W4 api-client note, confirmed: better-auth re-issues the session cookie on
 * the exchange once a day has passed, and nothing passed it on, so an active
 * user's cookie expired seven days after sign-in. The real round trip is in
 * `services/actors/src/auth/session-refresh.test.ts`; these pin the relay.
 */
describe("proxyGraphqlRequest relays the exchange's session cookies", () => {
  const REFRESHED =
    "better-auth.session_token=abc.def; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax";
  const SECURE_REFRESHED =
    "__Secure-better-auth.session_token=abc.def; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax";
  const CLEARED =
    "better-auth.session_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax";

  const exchangeSetting = (status: number, setCookies: readonly string[]) => {
    const fetchImpl: FetchLike = async (url) => {
      if (String(url) === TOKEN_URL) {
        const headers = new Headers({ "content-type": "application/json" });
        for (const cookie of setCookies) headers.append("set-cookie", cookie);
        return status === 200
          ? new Response(JSON.stringify({ token: "eyJ.test.token" }), {
              status,
              headers,
            })
          : new Response(null, { status, headers });
      }
      return Response.json({ data: { __typename: "Query" } });
    };
    return fetchImpl;
  };

  test("passes a refreshed session cookie on, verbatim and no-store", async () => {
    const response = await proxyGraphqlRequest(
      request(SESSION),
      exchangeSetting(200, [REFRESHED, SECURE_REFRESHED]),
    );
    assert.equal(response.status, 200);
    // Two headers, not one folded value: `Max-Age`'s neighbours contain `;`
    // and an `Expires` would contain a comma.
    assert.deepEqual(response.headers.getSetCookie(), [
      REFRESHED,
      SECURE_REFRESHED,
    ]);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { data: { __typename: "Query" } });
  });

  test("passes on nothing but session cookies", async () => {
    const response = await proxyGraphqlRequest(
      request(SESSION),
      exchangeSetting(200, [
        "tracking=1; Path=/",
        "better-auth.state=x; Path=/",
        "better-auth.session_tokenX=y; Path=/",
        REFRESHED,
      ]),
    );
    assert.deepEqual(response.headers.getSetCookie(), [REFRESHED]);
  });

  test("keeps the 401 for a refused session, and clears the dead cookie with it", async () => {
    const response = await proxyGraphqlRequest(
      request(SESSION),
      exchangeSetting(401, [CLEARED]),
    );
    assert.equal(response.status, 401);
    assert.deepEqual(response.headers.getSetCookie(), [CLEARED]);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });

  test("sets nothing when the exchange re-issued nothing", async () => {
    const response = await proxyGraphqlRequest(
      request(SESSION),
      exchangeSetting(200, []),
    );
    assert.deepEqual(response.headers.getSetCookie(), []);
  });
});

/*
 * EV-1 (2026-10-05): the proxy exchanged the session for a JWT on **every**
 * request, so one session ran into the actor's 300-a-minute exchange limit
 * (measured: request 301 of a burst was `502 Auth service unavailable`), and
 * the limit's 429 was reported as that same 502 outage. These pin the cache,
 * the 429, and the one retry a cached token earns.
 */
describe("proxyGraphqlRequest's token cache and rate-limit answer", () => {
  /** Unsigned JWT shape with a readable `exp` 15 minutes out. */
  const jwt = (tag: string): string =>
    `eyJhbGciOiJFZERTQSJ9.${Buffer.from(
      JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900, sub: tag }),
    ).toString("base64url")}.sig`;

  /**
   * An actor that mints a new token per exchange (`tokens`) and an API that
   * accepts only the bearers in `accepted` (all of them, by default).
   */
  const upstreams = (
    options: {
      tokenStatus?: () => number;
      tokenHeaders?: Record<string, string>;
      accepted?: (bearer: string | null) => boolean;
    } = {},
  ) => {
    let exchanges = 0;
    const bearers: (string | null)[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      if (String(url) === TOKEN_URL) {
        exchanges += 1;
        const status = options.tokenStatus?.() ?? 200;
        return status === 200
          ? Response.json({ token: jwt(`t${exchanges}`) })
          : new Response("{}", { status, headers: options.tokenHeaders });
      }
      const bearer = new Headers(init?.headers).get("authorization");
      bearers.push(bearer);
      return (options.accepted?.(bearer) ?? true)
        ? Response.json({ data: { __typename: "Query" } })
        : Response.json(
            {
              errors: [
                {
                  message: "bad token",
                  extensions: { code: "UNAUTHENTICATED" },
                },
              ],
            },
            { status: 401 },
          );
    };
    return {
      fetchImpl,
      bearers,
      get exchanges() {
        return exchanges;
      },
    };
  };

  test("400 requests on one session cost one exchange, not 400", async () => {
    const tokens = createTokenCache();
    const up = upstreams();
    for (let i = 0; i < 400; i += 1) {
      const response = await proxyGraphqlRequest(
        request(SESSION),
        up.fetchImpl,
        tokens,
      );
      assert.equal(response.status, 200, `request ${i + 1}`);
    }
    assert.equal(up.exchanges, 1);
    assert.equal(new Set(up.bearers).size, 1);
  });

  test("two sessions never share a token", async () => {
    const tokens = createTokenCache();
    const up = upstreams();
    await proxyGraphqlRequest(request(SESSION), up.fetchImpl, tokens);
    await proxyGraphqlRequest(
      request("better-auth.session_token=other.sig"),
      up.fetchImpl,
      tokens,
    );
    assert.equal(up.exchanges, 2);
    assert.notEqual(up.bearers[0], up.bearers[1]);
  });

  test("the actor's 429 is a 429 with Retry-After, never forwarded — not a 502", async () => {
    const up = upstreams({
      tokenStatus: () => 429,
      tokenHeaders: { "x-retry-after": "42" },
    });
    const response = await proxyGraphqlRequest(
      request(SESSION),
      up.fetchImpl,
      createTokenCache(),
    );
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("retry-after"), "42");
    const body = (await response.json()) as {
      errors: { message: string; extensions?: { code?: unknown } }[];
    };
    assert.equal(body.errors[0]?.extensions?.code, "RATE_LIMITED");
    assert.equal(up.bearers.length, 0, "must not reach the API");
  });

  test("an outage is still a 502, now with a code", async () => {
    const response = await proxyGraphqlRequest(
      request(SESSION),
      upstreams({ tokenStatus: () => 500 }).fetchImpl,
      createTokenCache(),
    );
    assert.equal(response.status, 502);
    const body = (await response.json()) as {
      errors: { extensions?: { code?: unknown } }[];
    };
    assert.equal(body.errors[0]?.extensions?.code, "AUTH_UNAVAILABLE");
  });

  test("a cached token the API refuses is replaced once, not passed on as a sign-out", async () => {
    const tokens = createTokenCache();
    let rotated = false;
    const up = upstreams({
      // After a "key rotation", only tokens minted after it verify.
      accepted: (bearer) => !rotated || bearer !== up.bearers[0],
    });
    await proxyGraphqlRequest(request(SESSION), up.fetchImpl, tokens);
    rotated = true;
    const response = await proxyGraphqlRequest(
      request(SESSION),
      up.fetchImpl,
      tokens,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { data: { __typename: "Query" } });
    assert.equal(up.exchanges, 2);
    // And the fresh token is what the cache holds now.
    await proxyGraphqlRequest(request(SESSION), up.fetchImpl, tokens);
    assert.equal(up.exchanges, 2);
  });

  test("a fresh token the API refuses is the API's answer — no retry loop", async () => {
    const up = upstreams({ accepted: () => false });
    const response = await proxyGraphqlRequest(
      request(SESSION),
      up.fetchImpl,
      createTokenCache(),
    );
    assert.equal(response.status, 401);
    assert.equal(up.exchanges, 1);
    assert.equal(up.bearers.length, 1);
  });

  test("a refused session is re-checked on every request — refusals are not cached", async () => {
    const tokens = createTokenCache();
    const up = upstreams({ tokenStatus: () => 401 });
    for (let i = 0; i < 3; i += 1) {
      const response = await proxyGraphqlRequest(
        request(SESSION),
        up.fetchImpl,
        tokens,
      );
      assert.equal(response.status, 401);
    }
    assert.equal(up.exchanges, 3);
  });
});
