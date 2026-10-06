/**
 * Turning a browser session into a token `services/api` will accept.
 *
 * This is the whole server-side auth mechanism, isolated from `next/*` so it
 * can be tested against the real actors app. The Next-facing wrapper that adds
 * per-request memoisation is `auth-server.ts`.
 *
 * ## Why an exchange at all
 *
 * The browser holds an **opaque** better-auth session cookie —
 * `<token>.<hmac>`, a lookup key for a `session` row. `services/api` holds no
 * database and no session store; it verifies **EdDSA JWTs** against
 * `/api/auth/jwks` and nothing else (`services/api/src/auth/jwt.ts`). The two
 * credentials are not interchangeable, and only `services/actors` — which owns the
 * `session` table and the signing key — can convert one into the other. That
 * conversion is better-auth's `GET /api/auth/token`.
 */
import type { AuthSession } from "./endpoints.ts";
import { AUTH_BASE_PATH, authEndpoint } from "./endpoints.ts";
import type { FetchLike } from "./proxy.ts";
import { proxySecretHeaders } from "./proxy-secret.ts";
import { isSessionSetCookie } from "./session-cookie.ts";

export type TokenRequest = {
  /** Origin of `services/actors`; see `config.ts`. */
  authOrigin: string;
  /** `Cookie` header holding better-auth's cookies, or `null` if anonymous. */
  cookieHeader: string | null;
  fetchImpl?: FetchLike;
  /**
   * Receives the session cookies the exchange re-issued — see "The refreshed
   * cookie" below. Only session cookies (`isSessionSetCookie`), attributes
   * verbatim, one string per cookie. Called on every answer that carries
   * any, the refusal included (better-auth clears a dead cookie there).
   */
  onSetCookie?: (setCookies: readonly string[]) => void;
};

/**
 * A refusal from the actors app that is **not** "this viewer has no session":
 * a 5xx, a broken contract, or a 429 from its per-session exchange limit
 * (`services/actors/src/auth/session-exchange-limit.ts`).
 *
 * A 429 carries the actor's `Retry-After` (or better-auth's `X-Retry-After`)
 * in {@link retryAfterSeconds}, so a caller can answer "slow down, for this
 * long" instead of the generic "Auth service unavailable" every non-OK status
 * used to collapse into — which is what made a rate limit look like an outage
 * in the e2e suite, with nothing in any log to say otherwise.
 */
export class TokenExchangeError extends Error {
  readonly status: number;
  readonly retryAfterSeconds: number | undefined;
  constructor(status: number, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "TokenExchangeError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  get rateLimited(): boolean {
    return this.status === 429;
  }
}

/**
 * Seconds from `Retry-After` / `X-Retry-After` (delta-seconds only — neither
 * the actor's limiter nor better-auth's sends an HTTP date), or `undefined`.
 */
export const retryAfterSeconds = (headers: Headers): number | undefined => {
  for (const name of ["retry-after", "x-retry-after"]) {
    const raw = headers.get(name);
    if (raw === null || !/^\d+$/.test(raw.trim())) continue;
    return Number(raw.trim());
  }
  return undefined;
};

/**
 * Exchanges a session cookie for a 15-minute JWT. `null` means *anonymous*,
 * never *broken*: no cookie, or a cookie whose session has expired or been
 * revoked. `services/api` treats a missing `Authorization` header as an anonymous
 * viewer and lets the actors decide what that viewer may see, so a `null` here
 * is a normal outcome that still produces a valid GraphQL request.
 *
 * `cache: "no-store"` is not an optimisation choice. Every caller requests the
 * *same URL* and differs only in its `Cookie` header, so any response cache
 * keyed on URL alone would hand one viewer another viewer's token. Next's
 * `fetch` is uncached by default in v15+, but the failure mode is severe enough
 * that it is stated rather than relied upon — and it is asserted by a test.
 */
/*
 * ## The refreshed cookie
 *
 * better-auth issues the session cookie with a 7-day `Max-Age` and, once a
 * day has passed, slides the `session` row forward on the next read — `/token`
 * included — and re-issues the cookie with a fresh `Max-Age` in that
 * response. This exchange is the only session read an active browser causes
 * (it never calls `/get-session` after sign-in), so dropping that header left
 * the row alive and the browser's copy expiring seven days after sign-in: an
 * active user signed out mid-week. `onSetCookie` hands it to a caller that can
 * set cookies on the browser's response (`graphql-proxy.ts`).
 * `services/actors/src/auth/session-refresh.test.ts` proves the round trip.
 */
export const fetchApiToken = async ({
  authOrigin,
  cookieHeader,
  fetchImpl = fetch,
  onSetCookie,
}: TokenRequest): Promise<string | null> => {
  // No session cookie cannot produce a token, so skip the round trip. Every
  // anonymous page render would otherwise pay for a guaranteed 401.
  if (cookieHeader === null || cookieHeader === "") return null;

  const response = await fetchImpl(
    `${authOrigin}${AUTH_BASE_PATH}${authEndpoint.token}`,
    {
      method: "GET",
      headers: {
        cookie: cookieHeader,
        accept: "application/json",
        // Marks this as the server's own exchange, which the actor host
        // counts per session rather than per address (`proxy-secret.ts`).
        ...proxySecretHeaders(),
      },
      cache: "no-store",
      redirect: "manual",
    },
  );

  const sessionCookies = response.headers
    .getSetCookie()
    .filter(isSessionSetCookie);
  if (sessionCookies.length > 0) onSetCookie?.(sessionCookies);

  if (response.status === 401 || response.status === 403) return null;

  if (!response.ok) {
    throw new TokenExchangeError(
      response.status,
      `token exchange failed with ${response.status}`,
      response.status === 429 ? retryAfterSeconds(response.headers) : undefined,
    );
  }

  const body: unknown = await response.json();
  const token =
    typeof body === "object" && body !== null && "token" in body
      ? (body as { token: unknown }).token
      : undefined;

  // A 200 with no token means the contract moved under us; that is a fault,
  // not an anonymous viewer.
  if (typeof token !== "string" || token === "") {
    throw new TokenExchangeError(
      response.status,
      "token missing from response",
    );
  }
  return token;
};

/**
 * The viewer's better-auth session, read server to server — what the
 * `(authenticated)` layout gates on (`auth-server.ts`).
 *
 * `null` means no session: better-auth answers `200 null` for that, and a
 * 401/403 means the same. **Anything else non-OK is thrown**, as
 * {@link TokenExchangeError}. This used to be `if (!response.ok) return
 * null`, so a 429 from the actor's per-session limit — or a 5xx — read as
 * "signed out" and the layout redirected a signed-in viewer to `/sign-in`
 * mid-session. That is the e2e `04b` failure (its `/add/beers` never showed
 * the wizard because the page had become the sign-in form), and it is the
 * same rule `graphql-proxy.ts` has kept since it was written: an
 * infrastructure answer must not sign anybody out.
 */
export const fetchSession = async ({
  authOrigin,
  cookieHeader,
  fetchImpl = fetch,
}: Omit<TokenRequest, "onSetCookie">): Promise<AuthSession | null> => {
  if (cookieHeader === null || cookieHeader === "") return null;

  const response = await fetchImpl(
    `${authOrigin}${AUTH_BASE_PATH}${authEndpoint.getSession}`,
    {
      method: "GET",
      headers: {
        cookie: cookieHeader,
        accept: "application/json",
        // The server's own session read: counted per session by the actor
        // host, not against one address shared by every user (`proxy-secret.ts`).
        ...proxySecretHeaders(),
      },
      cache: "no-store",
    },
  );
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) {
    throw new TokenExchangeError(
      response.status,
      `session read failed with ${response.status}`,
      response.status === 429 ? retryAfterSeconds(response.headers) : undefined,
    );
  }

  const body: unknown = await response.json();
  return body === null ? null : (body as AuthSession);
};

/** `Authorization` header for a token, or no header at all when anonymous. */
export const bearerHeader = (token: string | null): Record<string, string> =>
  token === null ? {} : { authorization: `Bearer ${token}` };
