/**
 * Where the stack lives, from the browser's and the Next server's point of
 * view. No imports: this module is shared by client components, server
 * components, route handlers and tests.
 */

/**
 * better-auth's `basePath`, and the Next route that proxies to it.
 *
 * The two are deliberately the same string. better-auth builds its own URLs
 * (OAuth redirect URIs, `callbackURL` resolution) from `BETTER_AUTH_URL` +
 * `basePath`, so a proxy that changed the path would have to rewrite bodies and
 * `Location` headers. Identical paths make the proxy a pure passthrough.
 */
export const AUTH_BASE_PATH = "/api/auth";

/**
 * The Next route that proxies GraphQL to `services/api`.
 *
 * D1 built it at `/api/graphql-next` so it could sit beside the Hasura proxy
 * that owned `/api/graphql`; D9 deleted that proxy and moved this one onto the
 * name. It is written down once here, and `src/proxy.ts`'s matcher must keep
 * excluding it — `src/lib/api/proxy-matcher.test.ts` checks that it does.
 */
export const GRAPHQL_PROXY_PATH = "/api/graphql";

/** better-auth endpoints this app calls, relative to {@link AUTH_BASE_PATH}. */
export const authEndpoint = {
  signInEmail: "/sign-in/email",
  signUpEmail: "/sign-up/email",
  signInSocial: "/sign-in/social",
  signOut: "/sign-out",
  getSession: "/get-session",
  /** Session cookie in, 15-minute EdDSA JWT out. 401 when there is no session. */
  token: "/token",
  /** Public key set `services/api` verifies against. Never called from here. */
  jwks: "/jwks",
} as const;

/** The social providers A6 can be configured with (`infra/.env.example`). */
export const SOCIAL_PROVIDERS = ["google", "facebook", "discord"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

/** The subset of better-auth's user row this app reads. */
export type AuthUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  image: string | null;
  role: "admin" | "user";
};

export type AuthSession = {
  user: AuthUser;
  session: { id: string; expiresAt: string };
};

/**
 * better-auth's error body. `code` is the stable machine-readable half
 * (`INVALID_EMAIL_OR_PASSWORD`, `USER_ALREADY_EXISTS`, `PROVIDER_NOT_FOUND`…);
 * `message` is for humans.
 */
export type AuthErrorBody = {
  message: string;
  code?: string;
};
