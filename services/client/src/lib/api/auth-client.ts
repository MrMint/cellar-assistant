"use client";

/**
 * The browser's client for better-auth, speaking to `/api/auth/*` on this
 * origin (proxied to `services/actors` — see `auth-proxy.ts`).
 *
 * ## Why this is hand-written rather than `better-auth/react`
 *
 * `better-auth` is a dependency of `services/actors`, not of this app. There is
 * one lockfile at the workspace root now (`sharedWorkspaceLockfile: true`), so
 * adding it here rewrites that shared lockfile and touches every project's
 * resolution — a bigger blast radius than this file's surface is worth, and one
 * D1 would not take while a dev server was live against the old stack. The surface below is deliberately shaped like
 * `createAuthClient()`'s (`{ data, error }` results, `signIn.email`,
 * `signIn.social`, `signUp.email`, `signOut`, `useSession`) so that swapping
 * in the real client later is a change to this file and nothing else.
 *
 * Every call is same-origin, so the session cookie rides along without any
 * `credentials` juggling, and `next.config.mjs`'s `connect-src 'self'` is
 * satisfied.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type {
  AuthErrorBody,
  AuthSession,
  AuthUser,
  SocialProvider,
} from "./endpoints.ts";
import { AUTH_BASE_PATH, authEndpoint } from "./endpoints.ts";

export type AuthResult<T> =
  | { data: T; error: null }
  | { data: null; error: AuthErrorBody };

const call = async <T>(
  path: string,
  init: RequestInit = {},
): Promise<AuthResult<T>> => {
  let response: Response;
  try {
    response = await fetch(`${AUTH_BASE_PATH}${path}`, {
      // Same origin, but stated: a stale cached sign-in response would be a
      // security bug, not a rendering glitch.
      cache: "no-store",
      ...init,
      headers: { accept: "application/json", ...init.headers },
    });
  } catch (cause) {
    return {
      data: null,
      error: {
        message: cause instanceof Error ? cause.message : "Network error",
        code: "NETWORK_ERROR",
      },
    };
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error =
      typeof body === "object" && body !== null && "message" in body
        ? (body as AuthErrorBody)
        : { message: `Request failed with ${response.status}` };
    return { data: null, error };
  }

  return { data: body as T, error: null };
};

const post = <T>(path: string, payload: unknown): Promise<AuthResult<T>> =>
  call<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

/**
 * better-auth resolves a relative `callbackURL` against its own `baseURL`,
 * which is `services/actors` — so a relative path would land the browser on the
 * actor host after an OAuth round trip. Absolute URLs on this origin are
 * accepted because the origin is in `AUTH_TRUSTED_ORIGINS`.
 */
const absolute = (path: string): string =>
  new URL(path, window.location.origin).toString();

export type SignInEmailInput = {
  email: string;
  password: string;
  rememberMe?: boolean;
};

export type SignUpEmailInput = {
  email: string;
  password: string;
  name?: string;
};

type SessionResponse = { token: string; user: AuthUser };

export const authClient = {
  signIn: {
    email: (input: SignInEmailInput) =>
      post<SessionResponse>(authEndpoint.signInEmail, input),

    /**
     * Returns `{ url }` for the identity provider; the caller navigates. The
     * provider then redirects to `<BETTER_AUTH_URL>/api/auth/callback/<id>`,
     * which is registered with the provider and configured in `infra/.env`.
     */
    social: (provider: SocialProvider, callbackPath = "/cellars") =>
      post<{ url: string; redirect: boolean }>(authEndpoint.signInSocial, {
        provider,
        callbackURL: absolute(callbackPath),
        errorCallbackURL: absolute("/sign-in"),
      }),
  },

  signUp: {
    /**
     * `name` is required by better-auth's body schema, so an absent one is
     * sent as `""` — **never** the email. A display name is shown to every
     * signed-in user and matched by `userSearch`, and defaulting it to the
     * address published every address whose owner left the field blank (W4
     * security F2). The actor host turns `""` into a neutral handle
     * (`services/actors/src/auth/display-name.ts`).
     */
    email: (input: SignUpEmailInput) =>
      post<SessionResponse>(authEndpoint.signUpEmail, {
        ...input,
        name: input.name ?? "",
      }),
  },

  signOut: () => post<{ success: boolean }>(authEndpoint.signOut, {}),

  /** `null` — with a 200 — when there is no session. */
  getSession: () => call<AuthSession | null>(authEndpoint.getSession),

  /**
   * Present for completeness and for debugging. Application code should not
   * need it: the browser sends a cookie to `/api/graphql` and the proxy
   * does the exchange, so no JWT is ever held in client memory.
   */
  getToken: () => call<{ token: string }>(authEndpoint.token),
};

/** Redirects the browser into an OAuth flow, or returns the error. */
export const startSocialSignIn = async (
  provider: SocialProvider,
  callbackPath?: string,
): Promise<AuthErrorBody | null> => {
  const { data, error } = await authClient.signIn.social(
    provider,
    callbackPath,
  );
  if (error !== null) return error;
  window.location.href = data.url;
  return null;
};

// ---------------------------------------------------------------------------
// Session store
// ---------------------------------------------------------------------------

/**
 * One shared session snapshot for the whole tree, refreshed on mount and
 * whenever the tab regains focus.
 *
 * There is no subscription transport in the new stack — the design review
 * removed GraphQL subscriptions and replaced them with polling — so this
 * revalidates on events rather than holding a socket open.
 */
type SessionState = {
  session: AuthSession | null;
  status: "pending" | "ready";
};

let state: SessionState = { session: null, status: "pending" };
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;

const emit = (next: SessionState): void => {
  state = next;
  listeners.forEach((listener) => {
    listener();
  });
};

const revalidate = (): Promise<void> => {
  inFlight ??= authClient.getSession().then(({ data, error }) => {
    emit({ session: error === null ? data : null, status: "ready" });
    inFlight = null;
  });
  return inFlight;
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = (): SessionState => state;
// The server has no browser session to report; server components use
// `auth-server.ts` instead of this hook.
const getServerSnapshot = (): SessionState => ({
  session: null,
  status: "pending",
});

export type UseSession = SessionState & {
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

export const useSession = (): UseSession => {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  useEffect(() => {
    if (state.status === "pending") void revalidate();
    const onFocus = (): void => {
      void revalidate();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    await authClient.signOut();
    emit({ session: null, status: "ready" });
  }, []);

  return { ...snapshot, refresh: revalidate, signOut };
};

/**
 * `useState`-shaped helper for the sign-in and sign-up forms: one pending flag
 * and one error, so a form does not have to reimplement it.
 */
export const useAuthAction = <TInput>(
  action: (input: TInput) => Promise<AuthResult<unknown>>,
): {
  run: (input: TInput) => Promise<boolean>;
  pending: boolean;
  error: AuthErrorBody | null;
} => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AuthErrorBody | null>(null);

  const run = useCallback(
    async (input: TInput): Promise<boolean> => {
      setPending(true);
      setError(null);
      const result = await action(input);
      setPending(false);
      if (result.error !== null) {
        setError(result.error);
        return false;
      }
      await revalidate();
      return true;
    },
    [action],
  );

  return { run, pending, error };
};
