/**
 * The passthrough half of both Next route handlers.
 *
 * Pure and dependency-injected — `fetch` comes in as an argument — so the
 * proxies can be exercised against the real stack from `node --test` without a
 * Next server. Nothing here imports `next/*`.
 */
import { authCookieHeaderFrom } from "./session-cookie.ts";

/**
 * Request headers that may cross to the upstream.
 *
 * An allowlist, not a denylist. The two that matter:
 *
 * - `origin` — better-auth CSRF-checks it against `AUTH_TRUSTED_ORIGINS`, so
 *   dropping it breaks every POST.
 * - `cookie` — replaced, never forwarded verbatim; see `session-cookie.ts`.
 *
 * `host` is excluded so the upstream keeps its own idea of its origin,
 * `content-length` and `accept-encoding` because `fetch` sets them itself, and
 * `authorization` because the GraphQL proxy mints that header rather than
 * relaying whatever a client sent.
 */
const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "content-type",
  "origin",
  "referer",
  "user-agent",
  "x-forwarded-for",
  "x-forwarded-proto",
  "x-request-id",
];

/**
 * Response headers that must not be copied: `fetch` has already decoded the
 * body, so the framing headers describe a body that no longer exists.
 */
const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "transfer-encoding",
]);

export const upstreamHeaders = (
  source: Headers,
  cookieHeader: string | null,
): Headers => {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = source.get(name);
    if (value !== null) headers.set(name, value);
  }
  if (cookieHeader !== null) headers.set("cookie", cookieHeader);
  return headers;
};

/**
 * Copies an upstream response's headers, preserving **every** `Set-Cookie`.
 *
 * `Headers` folds repeated fields into one comma-joined value when iterated,
 * which corrupts `Set-Cookie` (its `Expires` attribute contains a comma).
 * `getSetCookie()` is the only correct reader, and each value has to be
 * `append`ed rather than `set`. A sign-out returns three cookies at once, so
 * this is exercised on an ordinary path, not an edge case.
 */
export const downstreamHeaders = (source: Headers): Headers => {
  const headers = new Headers();
  // `forEach`, not `for…of`: this app compiles with `target: es5`, where
  // iterating a `Headers` needs `downlevelIteration`.
  source.forEach((value, name) => {
    if (HOP_BY_HOP_RESPONSE_HEADERS.has(name)) return;
    if (name === "set-cookie") return;
    headers.set(name, value);
  });
  for (const cookie of source.getSetCookie()) {
    headers.append("set-cookie", cookie);
  }
  return headers;
};

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type ForwardOptions = {
  request: Request;
  /** Absolute upstream URL, query string included. */
  targetUrl: string;
  /** Overrides the request's `Cookie`. `null` sends none. */
  cookieHeader?: string | null;
  /** Merged in after the allowlist, so it can add `authorization`. */
  extraHeaders?: Record<string, string>;
  body?: BodyInit | null;
  fetchImpl?: FetchLike;
};

/**
 * Forwards one request upstream and returns the upstream's response.
 *
 * `redirect: "manual"` is load-bearing: better-auth answers an OAuth
 * initiation with a 302 that the *browser* must follow. Following it here
 * would send the Next server to the identity provider instead.
 */
export const forwardRequest = async ({
  request,
  targetUrl,
  cookieHeader,
  extraHeaders,
  body,
  fetchImpl = fetch,
}: ForwardOptions): Promise<Response> => {
  const cookie =
    cookieHeader === undefined
      ? authCookieHeaderFrom(request.headers.get("cookie"))
      : cookieHeader;

  const headers = upstreamHeaders(request.headers, cookie);
  for (const [name, value] of Object.entries(extraHeaders ?? {})) {
    headers.set(name, value);
  }

  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";

  const upstream = await fetchImpl(targetUrl, {
    method,
    headers,
    body: hasBody ? (body ?? (await request.arrayBuffer())) : undefined,
    redirect: "manual",
    // Next caches `fetch` aggressively and these responses are per-session by
    // construction. A cached auth response would be a cross-user leak.
    cache: "no-store",
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: downstreamHeaders(upstream.headers),
  });
};
