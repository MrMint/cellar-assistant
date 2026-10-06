"use client";

/**
 * URQL for client components, pointed at `services/api` through this app's own
 * `/api/graphql` proxy.
 *
 *
 * **There is no subscription exchange, and there will not be one.** GraphQL
 * subscriptions were removed in the design review (`target-stack.md` §1) and
 * replaced by polling — URQL's `requestPolicy` and `pollInterval` on the
 * queries that need it.
 */
import { createClient, fetchExchange, ssrExchange } from "@urql/core";
import { devtoolsExchange } from "@urql/devtools";
import { authExchange } from "@urql/exchange-auth";
import { cacheExchange } from "@urql/exchange-graphcache";
import type { Exchange } from "urql";
import { GRAPHQL_PROXY_PATH } from "./endpoints.ts";
import { graphcacheKeys } from "./graphcache-keys.generated.ts";
import { graphcacheSchema } from "./graphcache-schema.generated.ts";

/**
 * The proxy attaches a token from the session cookie itself (cached per
 * session server-side, `token-cache.ts`), so there is nothing to attach here
 * and nothing to refresh. A 401 therefore
 * means the *session* is gone, not that a token aged out — the only useful
 * response is to send the viewer to sign-in. The proxy answers 401 when the
 * browser sent a session cookie the actors app refused (`graphql-proxy.ts`);
 * a request with no session cookie is anonymous and never gets here, so a
 * viewer who was never signed in is not bounced (`graphql-proxy.test.ts`).
 *
 * A 502 from the proxy (`Auth service unavailable`) is deliberately not
 * treated as an auth error: an unreachable actors app must not read as
 * "signed out" and bounce someone out of a form they were filling in.
 */
const createSessionExchange = (): Exchange =>
  authExchange(async () => ({
    addAuthToOperation: (operation) => operation,
    willAuthError: () => false,
    didAuthError: (error) =>
      error.response?.status === 401 ||
      error.graphQLErrors.some(
        (graphQLError) => graphQLError.extensions?.code === "UNAUTHENTICATED",
      ),
    refreshAuth: async () => {
      // `replace`, so the back button does not walk into the dead page.
      window.location.replace("/sign-in");
    },
  }));

/** Retries of one request after a 429, and the longest single wait. */
export const RATE_LIMIT_RETRIES = 2;
export const RATE_LIMIT_MAX_WAIT_MS = 10_000;

const sleep = (ms: number, signal: AbortSignal | null | undefined) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

/**
 * Backs off on a 429 instead of surfacing it as a failed query.
 *
 * The proxy answers 429 (`RATE_LIMITED`, with `Retry-After`) when the actor's
 * per-session exchange limit refused the token exchange (`graphql-proxy.ts`).
 * That refusal happens **before** the request reaches the API, so nothing ran
 * and a retry — mutations included — cannot apply anything twice. The wait is
 * the server's `Retry-After`, capped at {@link RATE_LIMIT_MAX_WAIT_MS}, at most
 * {@link RATE_LIMIT_RETRIES} times; after that the 429 is the result, and the
 * page shows its error as it would any other.
 *
 * Exported for its test; `makeApiClient` is the only caller.
 */
export const withRateLimitBackoff =
  (
    fetchImpl: typeof globalThis.fetch | undefined,
    wait: typeof sleep = sleep,
  ): typeof globalThis.fetch =>
  async (input, init) => {
    // Resolved per call, not captured: tests and polyfills replace
    // `globalThis.fetch` after the client is built.
    const send = fetchImpl ?? globalThis.fetch;
    let response = await send(input, init);
    for (
      let attempt = 0;
      attempt < RATE_LIMIT_RETRIES && response.status === 429;
      attempt += 1
    ) {
      const seconds = Number(response.headers.get("retry-after"));
      const ms = Math.min(
        Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 1000,
        RATE_LIMIT_MAX_WAIT_MS,
      );
      await response.body?.cancel();
      await wait(ms, init?.signal);
      response = await send(input, init);
    }
    return response;
  };

export type ApiClientOptions = {
  /**
   * Replaces `globalThis.fetch`. The one caller is the integration test, which
   * hands the client the route handler itself — so the whole exchange chain
   * runs against the real proxy and the real API without a browser.
   */
  fetch?: typeof globalThis.fetch;
};

export const makeApiClient = ({ fetch: fetchImpl }: ApiClientOptions = {}) => {
  const ssr = ssrExchange({
    isClient: typeof window !== "undefined",
    staleWhileRevalidate: true,
  });

  const client = createClient({
    url: GRAPHQL_PROXY_PATH,
    exchanges: [
      ...(process.env.NODE_ENV === "development" ? [devtoolsExchange] : []),
      cacheExchange({
        // Raw uuids on `id`; no Relay `Node`, no global ids (plan §8.3). Only
        // the id-less types need telling.
        keys: graphcacheKeys,
        // Without this, graphcache has to guess at interfaces and unions, and
        // on a mutation result it guesses by silently dropping the inline
        // fragment on the abstract type: `...ActorErrorFields` (a fragment on
        // `ActorError`) comes back as a bare `__typename`, so the UI shows
        // "Something went wrong." instead of the actor's own explanation, and
        // has no `reason` to branch on. That drop happens in
        // every NODE_ENV; only graphcache's warning about it is dev-only.
        // `urql-client.test.ts` fails when this line is missing — in the unit
        // suite, not the e2e one, whose console-watching spec
        // (`packages/e2e/specs/10-graphcache.spec.ts`) cannot see a production
        // build's compiled-out warnings.
        schema: graphcacheSchema,
      }),
      ssr,
      createSessionExchange(),
      fetchExchange,
    ],
    fetch: withRateLimitBackoff(fetchImpl),
    fetchOptions: { method: "POST" },
    preferGetMethod: false,
  });

  return { client, ssr };
};
