/**
 * The daily session read `src/proxy.ts` makes on a page request, so a
 * browser that only ever renders server components still gets better-auth's
 * refreshed session cookie.
 *
 * ## Why the proxy, and why once a day
 *
 * better-auth issues the session cookie with a 7-day `Max-Age` and, once
 * `updateAge` (1 day) has passed, slides the `session` row forward on the next
 * session read and re-issues the cookie in that response (`token.ts`, "The
 * refreshed cookie"). `/api/graphql` relays that re-issue since 2297e284, but a
 * viewer whose pages are rendered entirely by server components never calls
 * `/api/graphql`: their session is read by `getApiToken` / `getServerSession`
 * (`auth-server.ts`), and a server component **cannot set a cookie**, so the
 * re-issue was dropped and the cookie expired seven days after sign-in while
 * its row lived on.
 *
 * The proxy is the one server-side place on a page request that can set a
 * cookie. It reads the session at `/get-session` — which slides the row
 * exactly as `/token` does — and relays the re-issued session cookies. A
 * marker cookie, {@link SESSION_CHECKED_COOKIE}, makes that one round trip per
 * browser per day rather than one per request: a day is `updateAge`, so a
 * check more often than that could never refresh anything, and a marker that
 * lives no longer than that can never stand between a session and its refresh
 * for more than a day of its seven.
 *
 * ## Failing open
 *
 * This is housekeeping on a request that is about something else, so it never
 * decides the request. A get-session that errors, times out or answers non-2xx
 * relays nothing and the page is served as if the check had not run; the
 * marker is then set for {@link RETRY_AFTER_FAILURE_SECONDS} only, so an actor
 * host outage costs each browser one slow request per few minutes rather than
 * one per page — and the daily check is retried soon after it recovers.
 *
 * Pure: no `next/*`, `fetch` injected, so it can be driven against the real
 * better-auth from `services/actors` (`proxy-session-check.test.ts` there).
 */
import { AUTH_BASE_PATH, authEndpoint } from "./endpoints.ts";
import type { FetchLike } from "./proxy.ts";
import { proxySecretHeaders } from "./proxy-secret.ts";
import { isSessionSetCookie } from "./session-cookie.ts";

/** Present ⇒ this browser's session was read within the last day. */
export const SESSION_CHECKED_COOKIE = "cellar.session_checked";

/** Marker lifetime after a completed check: better-auth's `updateAge`. */
export const CHECKED_MAX_AGE_SECONDS = 24 * 60 * 60;

/** Marker lifetime after a failed check: retry soon, not on every page. */
export const RETRY_AFTER_FAILURE_SECONDS = 5 * 60;

/**
 * How long a page request waits for the check. The session read is a primary
 * key lookup; one that takes longer than this is an actor host in trouble, and
 * the page should not wait on it.
 */
export const SESSION_CHECK_TIMEOUT_MS = 1_500;

export type SessionCheckRequest = {
  /** Origin of `services/actors`; see `config.ts`. */
  authOrigin: string;
  /** `Cookie` header holding only better-auth's cookies (`authCookieHeader`). */
  cookieHeader: string;
  /** Whether the browser reached this app over https — the marker's `Secure`. */
  secure: boolean;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
};

const markerCookie = (maxAge: number, secure: boolean): string =>
  [
    `${SESSION_CHECKED_COOKIE}=1`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");

/**
 * Reads the session and returns the `Set-Cookie` values to put on the
 * browser's response: better-auth's re-issued session cookies (allow-listed by
 * `isSessionSetCookie`, attributes verbatim) followed by the marker. Never
 * throws.
 */
export const checkSession = async ({
  authOrigin,
  cookieHeader,
  secure,
  fetchImpl = fetch,
  timeoutMs = SESSION_CHECK_TIMEOUT_MS,
}: SessionCheckRequest): Promise<string[]> => {
  try {
    const response = await fetchImpl(
      `${authOrigin}${AUTH_BASE_PATH}${authEndpoint.getSession}`,
      {
        method: "GET",
        headers: {
          cookie: cookieHeader,
          accept: "application/json",
          // The server's own session read, counted per session by the actor
          // host rather than against one shared address (`proxy-secret.ts`).
          ...proxySecretHeaders(),
        },
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    // A refused session (revoked, disabled) is a completed check too:
    // better-auth clears the dead cookie on that answer, and relaying the
    // clear is the point. Only a fault is retried early.
    const completed = response.ok || response.status === 401;
    const relayed = response.headers.getSetCookie().filter(isSessionSetCookie);
    // The body is not needed; release the connection.
    await response.body?.cancel();
    return [
      ...relayed,
      markerCookie(
        completed ? CHECKED_MAX_AGE_SECONDS : RETRY_AFTER_FAILURE_SECONDS,
        secure,
      ),
    ];
  } catch {
    return [markerCookie(RETRY_AFTER_FAILURE_SECONDS, secure)];
  }
};
