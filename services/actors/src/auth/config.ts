/**
 * Environment for better-auth. Every value is read here and nowhere else.
 *
 * Real secrets live in the gitignored `infra/.env`; `infra/.env.example` carries
 * placeholders only.
 */
import { createHash } from "node:crypto";
import {
  parseSessionExchangeLimit,
  type SessionExchangeLimit,
} from "./session-exchange-limit.ts";

/**
 * E5b — the one `BETTER_AUTH_SECRET` this host will not start on.
 *
 * `infra/.env.example` shipped a 44-character constant for the whole life of
 * the migration. It was tracked, so it is world-readable to anyone with the
 * repository, and `cellar-stack-actors-1` was measured running exactly it.
 * That is not merely a weak secret: better-auth encrypts the JWKS **private**
 * key at rest keyed off `secret` (`auth.ts` leaves `jwks`'
 * `disablePrivateKeyEncryption` at its default), so the value is sufficient to
 * decrypt the stored private key out of the `jwks` table and forge a
 * `role:"admin"` token for any `sub` that the JWKS at `/api/auth/jwks` will
 * verify.
 *
 * Blanking the example stops it spreading further, but a developer who copied
 * that file months ago still has it in their `infra/.env`, where nothing would
 * ever look at it again. So the host refuses it by name. Failing closed is this
 * codebase's stated preference and the check costs one hash.
 *
 * **Stored as a digest, not as the string**, so that closing this hole does not
 * re-commit the value it is closing — and so `grep`ping the tree for the secret
 * finds nothing to copy.
 *
 * The remedy in the message below is a **reset, not a rotation**, and that is
 * right for *this* incident only: when the secret is public, every session and
 * every JWT has to die, because the secret is what the private key is encrypted
 * under and a new keypair under the old secret would be just as forgeable.
 * Do not reach for it when the secret is sound and only a signing key needs
 * replacing — `./jwks-rotation.ts` does that with an overlap, and logs nobody
 * out.
 */
export const PUBLISHED_SECRET_SHA256 =
  "0c67b0ad05ba5b8eb543d429551db72b011d011f432ae74c96deada65ae8c11d";

/**
 * `digests` is injectable for the same reason `assertPublicAuthOrigins` takes
 * its environment: a test can exercise the mechanism against a digest it
 * computes itself. Testing the real constant would mean writing the published
 * value back into the tree, which is the thing being removed.
 */
export const assertSecretNotPublished = (
  secret: string,
  digests: readonly string[] = [PUBLISHED_SECRET_SHA256],
): void => {
  const digest = createHash("sha256").update(secret, "utf8").digest("hex");
  if (!digests.includes(digest)) return;
  throw new Error(
    "[auth] BETTER_AUTH_SECRET is the value that was committed to " +
      "infra/.env.example, so it is public. better-auth encrypts the JWKS " +
      "private key with it, which makes anyone holding this repository able to " +
      "forge admin tokens for this instance. Generate a new one " +
      "(openssl rand -base64 32), put it in infra/.env, and delete the rows in " +
      "the `jwks` table so a fresh keypair is minted — every existing session " +
      "and JWT is invalidated by both steps, which is the point.",
  );
};

const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`[auth] ${name} is required`);
  }
  return value;
};

const optional = (name: string): string | undefined => {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
};

/** A social provider is configured only when *both* halves are present. */
const socialCredentials = (
  prefix: string,
): { clientId: string; clientSecret: string } | undefined => {
  const clientId = optional(`${prefix}_CLIENT_ID`);
  const clientSecret = optional(`${prefix}_CLIENT_SECRET`);
  return clientId !== undefined && clientSecret !== undefined
    ? { clientId, clientSecret }
    : undefined;
};

/**
 * The development lanes' `AUTH_PROXY_SECRET` — the default
 * `infra/docker-compose.yml` publishes for the actor host and the Next client
 * container, so the shared stack and e2e run with the real mechanism. Public,
 * so refused in production like every other published dev secret.
 */
export const PUBLISHED_DEV_PROXY_SECRET =
  "cellar-dev-auth-proxy-secret-not-for-production";

/** Shorter than this is not a secret an attacker at the edge cannot guess. */
export const MIN_PROXY_SECRET_LENGTH = 32;

/**
 * What `./client-ip.ts` needs: the secret the Next proxy proves itself with,
 * and the per-session limit on its exchanges (`./session-exchange-limit.ts`).
 *
 * **Required in production.** Without it no request is ever verified, every
 * auth request is keyed on the address the edge saw — Vercel's egress, shared by
 * every user — and one attacker's three bad passwords lock everyone out of
 * sign-in for ten seconds at a time (W4 security F3). That is the defect this
 * exists to close, so its absence is a refusal to start, not a degraded mode.
 * The same value goes in the Vercel project's environment
 * (`docs/architecture/deploy-loki.md`).
 */
export type ProxyTrust = {
  readonly proxySecret: string | undefined;
  readonly sessionExchangeLimit: SessionExchangeLimit;
};

export const readProxyTrust = (
  environment: NodeJS.ProcessEnv = process.env,
): ProxyTrust => {
  const raw = environment.AUTH_PROXY_SECRET;
  const proxySecret = raw === undefined || raw === "" ? undefined : raw;
  if (environment.NODE_ENV === "production") {
    if (proxySecret === undefined) {
      throw new Error(
        "[auth] AUTH_PROXY_SECRET is required in production. The Next proxy on Vercel proves itself " +
          "with it, and only a proven request's x-cellar-client-ip is trusted; without it every user " +
          "shares the rate-limit bucket of Vercel's egress address. Generate one (openssl rand -hex 32) " +
          "and set the same value here and in the Vercel project's environment.",
      );
    }
    if (proxySecret === PUBLISHED_DEV_PROXY_SECRET) {
      throw new Error(
        "[auth] AUTH_PROXY_SECRET is the development lane's published value (infra/docker-compose.yml) " +
          "in production. Anyone could then choose which client address their requests count against.",
      );
    }
    if (proxySecret.length < MIN_PROXY_SECRET_LENGTH) {
      throw new Error(
        `[auth] AUTH_PROXY_SECRET must be at least ${MIN_PROXY_SECRET_LENGTH} characters in production ` +
          "(openssl rand -hex 32 gives 64).",
      );
    }
  }
  return {
    proxySecret,
    sessionExchangeLimit: parseSessionExchangeLimit(
      environment.AUTH_SESSION_EXCHANGE_LIMIT,
    ),
  };
};

/**
 * `AUTH_PASSWORD_MODE` — how much of email/password auth this host serves.
 *
 * Production sign-in is social-first (Google, Discord, Facebook) and this
 * deployment sends no email at all, so there is no verification and no
 * reset-by-email. The three modes:
 *
 *   - `enabled` — sign-up and sign-in by password. The default when unset,
 *     and what the development lanes and the e2e suite run on (the seeded
 *     `test@test.com` / `test2@test.com` are password accounts).
 *   - `signin-only` — existing password users still sign in (and may change
 *     their password); nobody can create a new password account
 *     (`emailAndPassword.disableSignUp`). Exists because four of production's
 *     password users have no social login on an address Google can cover.
 *   - `disabled` — every password endpoint refuses: sign-up, sign-in,
 *     change-password, verify-password and both reset steps.
 *
 * In no mode are `account` rows touched: a `credential` row survives
 * `disabled`, so moving back to `signin-only` or `enabled` restores that
 * user's password sign-in exactly. Reset-by-email is off in every mode,
 * because `emailAndPassword.sendResetPassword` is never configured — better-
 * auth refuses `/request-password-reset` with `RESET_PASSWORD_DISABLED`
 * without one (1.7.3, `api/routes/password.mjs`).
 *
 * The Next client reads the same variable, server-side, to decide which
 * controls to render (`services/client/src/lib/auth/password-mode.ts`). A
 * mismatch fails closed: the UI may offer a form, but this host is what
 * refuses.
 */
export const PASSWORD_MODES = ["enabled", "signin-only", "disabled"] as const;

export type PasswordMode = (typeof PASSWORD_MODES)[number];

/** Unset or empty means `enabled`; anything unrecognised refuses to start. */
export const parsePasswordMode = (raw: string | undefined): PasswordMode => {
  if (raw === undefined || raw === "") return "enabled";
  const mode = PASSWORD_MODES.find((m) => m === raw);
  if (mode === undefined) {
    throw new Error(
      `[auth] AUTH_PASSWORD_MODE must be one of ${PASSWORD_MODES.join(", ")}, but got ${JSON.stringify(raw)}.`,
    );
  }
  return mode;
};

/**
 * A password mode that removes the password door must leave another one.
 *
 * `disabled` with no social provider configured would lock every user out, so
 * it is a refusal to start. `signin-only` with none still lets existing
 * password users in but makes the app impossible to join, which is a loud
 * warning rather than a refusal — it is a degraded state, not a lockout.
 * Returns the warning it emitted, for the tests.
 */
export const assertPasswordModeHasSocialFallback = (
  mode: PasswordMode,
  providers: Pick<AuthConfig, "google" | "facebook" | "discord">,
  warn: (message: string) => void = console.warn,
): string | null => {
  if (mode === "enabled") return null;
  const configured = OAUTH_PROVIDER_IDS.filter(
    (id) => providers[id] !== undefined,
  );
  if (configured.length > 0) return null;
  if (mode === "disabled") {
    throw new Error(
      "[auth] AUTH_PASSWORD_MODE=disabled, but no social provider is configured " +
        "(GOOGLE_OAUTH_*, DISCORD_OAUTH_*, FACEBOOK_OAUTH_* each need both CLIENT_ID " +
        "and CLIENT_SECRET). That would leave no way to sign in at all. Configure a " +
        "provider, or set AUTH_PASSWORD_MODE=signin-only.",
    );
  }
  const message =
    "[auth] WARNING: AUTH_PASSWORD_MODE=signin-only and no social provider is " +
    "configured. Existing password users can sign in, but NOBODY can create an " +
    "account. Configure GOOGLE_OAUTH_*, DISCORD_OAUTH_* or FACEBOOK_OAUTH_*.";
  warn(message);
  return message;
};

export type AuthConfig = {
  databaseUrl: string;
  secret: string;
  baseUrl: string;
  trustedOrigins: string[];
  /** Transparent bcrypt→scrypt upgrade on successful sign-in. */
  rehashOnSignIn: boolean;
  /** `AUTH_PASSWORD_MODE`; see {@link PasswordMode}. */
  passwordMode: PasswordMode;
  google: { clientId: string; clientSecret: string } | undefined;
  facebook: { clientId: string; clientSecret: string } | undefined;
  discord: { clientId: string; clientSecret: string } | undefined;
  /**
   * better-auth's own per-IP limiter. `undefined` keeps its default — on
   * exactly when `NODE_ENV=production` — which is what every lane but the
   * tests wants; the tests switch it on to prove the keying.
   */
  rateLimitEnabled?: boolean;
};

/**
 * E3 · the public origin, asserted rather than assumed.
 *
 * `baseUrl` is not decoration. better-auth derives four separate things from it,
 * all read out of better-auth 1.7.3's own source rather than its docs:
 *
 *   - **OAuth redirect URIs.** `api/routes/sign-in.mjs` builds
 *     `` `${c.context.baseURL}${getOAuthCallbackPath(provider)}` ``, and
 *     `utils/url.mjs`'s `getBaseURL` makes `context.baseURL` equal
 *     `BETTER_AUTH_URL` + `basePath`. So a provider must have
 *     `<BETTER_AUTH_URL>/api/auth/callback/<id>` registered, exactly.
 *   - **`iss` and `aud`.** `./auth.ts` hands the jwt plugin `config.baseUrl`
 *     verbatim for both, and `services/api` compares them as strings
 *     (`assertAuthIdentityCoherence` in `services/api/src/config.ts`).
 *   - **The `__Secure-` cookie prefix.** `cookies/index.mjs` decides it with
 *     `baseURLString.startsWith("https://")`, so an http base URL behind a TLS
 *     edge silently downgrades every auth cookie.
 *   - **An implicitly trusted origin.** `context/helpers.mjs` pushes
 *     `new URL(baseURL).origin` into the trusted set, which is why
 *     `AUTH_TRUSTED_ORIGINS` does *not* need to repeat it.
 *
 * In production `BETTER_AUTH_URL` is the **public Next origin**, not this
 * host's own address: the Next app proxies `/api/auth/*` through to here
 * (`src/lib/api/auth-proxy.ts`), so the browser — and therefore the OAuth
 * provider — only ever sees the Next origin. Pointing it at the Loki edge
 * instead is the landmine migration-plan.md records: callbacks would land here
 * directly, bypassing the proxy, and set cookies on an origin the app never
 * reads.
 *
 * Same house pattern as `assertBareHostname` in `../lib/s3-presign.ts`.
 */
const LOOPBACK_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
]);

const isLoopbackOrigin = (url: URL): boolean =>
  LOOPBACK_HOSTNAMES.has(url.hostname.replace(/^\[|\]$/g, "")) ||
  url.hostname.endsWith(".localhost") ||
  url.hostname.startsWith("127.");

const parseOrigin = (name: string, value: string): URL => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `[auth] ${name} must be an absolute URL, but got ${JSON.stringify(value)}.`,
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      `[auth] ${name} must be an http(s) URL, but got ${JSON.stringify(value)}.`,
    );
  }
  return url;
};

/**
 * better-auth's provider ids, which are also the last path segment of each
 * callback route (`api/routes/sign-in.mjs`: `` `${baseURL}/callback/${id}` ``,
 * and none of these three overrides `callbackPath`).
 */
export const OAUTH_PROVIDER_IDS = ["google", "facebook", "discord"] as const;

export type OAuthProviderId = (typeof OAUTH_PROVIDER_IDS)[number];

/**
 * The exact redirect URIs to register with Google, Facebook and Discord for a
 * given `BETTER_AUTH_URL`. Derived, not transcribed — `../auth/mount.ts` pins
 * the base path and `./config.test.ts` pins that the two agree.
 *
 *     node -e 'import("./src/auth/config.ts").then(m => console.log(m.oauthRedirectUris("https://cellar.example.com")))'
 */
export const oauthRedirectUris = (
  baseUrl: string,
): Record<OAuthProviderId, string> =>
  Object.fromEntries(
    OAUTH_PROVIDER_IDS.map((id) => [
      id,
      // Mirrors `AUTH_BASE_PATH` in ./mount.ts, inlined so this module stays
      // free of the express/better-auth import that file carries.
      `${baseUrl}/api/auth/callback/${id}`,
    ]),
  ) as Record<OAuthProviderId, string>;

export const assertPublicAuthOrigins = (
  environment: NodeJS.ProcessEnv = process.env,
): void => {
  const read = (name: string): string | undefined => {
    const value = environment[name];
    return value === undefined || value === "" ? undefined : value;
  };
  // `NODE_ENV=production` is set by services/actors/Dockerfile, not by the dev
  // compose file (stock node:24) and not by vitest (`test`), so it means "this
  // is the built image".
  const isProduction = environment.NODE_ENV === "production";
  const baseUrl = read("BETTER_AUTH_URL");
  const trustedOrigins = read("AUTH_TRUSTED_ORIGINS");

  if (baseUrl !== undefined) {
    const url = parseOrigin("BETTER_AUTH_URL", baseUrl);
    // `utils/url.mjs`'s `checkHasPath`: a base URL that already carries a path
    // suppresses the `/api/auth` append entirely, so every endpoint silently
    // moves and the Next proxy's `/api/auth/*` forward hits nothing.
    if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
      throw new Error(
        `[auth] BETTER_AUTH_URL must be a bare origin, but ${JSON.stringify(baseUrl)} carries a path, query or fragment. ` +
          "better-auth skips its /api/auth base path when the URL already has one, which moves every endpoint " +
          "and breaks the Next proxy.",
      );
    }
    if (baseUrl.endsWith("/")) {
      throw new Error(
        `[auth] BETTER_AUTH_URL must not end in a slash, but got ${JSON.stringify(baseUrl)}. ` +
          "The jwt plugin stamps iss/aud with this string verbatim and services/api compares it as a string, " +
          "so the slash would have to be repeated in AUTH_ISSUER to make a single token verify.",
      );
    }
    if (isProduction && (url.protocol !== "https:" || isLoopbackOrigin(url))) {
      throw new Error(
        `[auth] BETTER_AUTH_URL must be the public https origin in production, but got ${JSON.stringify(baseUrl)}. ` +
          "It is the origin OAuth providers redirect back to and the one better-auth derives its __Secure- " +
          "cookie prefix from; in this deployment it is the public Next origin, which proxies /api/auth/* here.",
      );
    }
  } else if (isProduction) {
    throw new Error(
      '[auth] BETTER_AUTH_URL must be set explicitly in production. Its default ("http://localhost:3002") ' +
        "would send every OAuth callback to a host the browser cannot reach, issue non-Secure cookies, and " +
        "stamp tokens with an issuer services/api rejects.",
    );
  }

  if (trustedOrigins !== undefined) {
    for (const origin of trustedOrigins.split(",").map((o) => o.trim())) {
      if (origin === "") continue;
      const url = parseOrigin("AUTH_TRUSTED_ORIGINS", origin);
      if (isProduction && isLoopbackOrigin(url)) {
        throw new Error(
          `[auth] AUTH_TRUSTED_ORIGINS contains the loopback origin ${JSON.stringify(origin)} in production. ` +
            "That entry is the development default, and better-auth's origin check is a CSRF defence: keeping it " +
            "lets any page served from the visitor's own machine drive auth requests. BETTER_AUTH_URL's origin is " +
            "trusted implicitly, so this variable only needs the *extra* origins (Vercel preview deployments).",
        );
      }
    }
  }
};

export const readAuthConfig = (): AuthConfig => {
  assertPublicAuthOrigins();
  const secret = required("BETTER_AUTH_SECRET");
  // E5b. Unconditional — not gated on NODE_ENV, unlike the origin rules above.
  // The published value is not "weak in development and fine in production";
  // it is public everywhere, and the local stack is the one measured running
  // it.
  assertSecretNotPublished(secret);
  // Boot refusal in production; `createAppWithAuth` reads it again for the
  // values (`./mount.ts`).
  readProxyTrust();
  const passwordMode = parsePasswordMode(process.env.AUTH_PASSWORD_MODE);
  const google = socialCredentials("GOOGLE_OAUTH");
  const facebook = socialCredentials("FACEBOOK_OAUTH");
  const discord = socialCredentials("DISCORD_OAUTH");
  assertPasswordModeHasSocialFallback(passwordMode, {
    google,
    facebook,
    discord,
  });
  return {
    // X2: the *main* database. It was a separate one (`auth_dev`) while A3 was
    // rebuilding `packages/db`; the variable survives the merge because it is
    // still a credential in its own right — `services/api` asserts that neither this
    // nor `DATABASE_URL` ever reaches it (`services/api/src/config.ts`) — and because
    // `scripts/migrate-users.ts` needs to name the target database separately
    // from the Nhost source it reads. In the actor host itself the value is only
    // a fallback: `createAuth` is handed the shared pool.
    databaseUrl: required("AUTH_DATABASE_URL"),
    secret,
    baseUrl: process.env.BETTER_AUTH_URL ?? "http://localhost:3002",
    trustedOrigins: (
      process.env.AUTH_TRUSTED_ORIGINS ?? "http://localhost:3000"
    )
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    rehashOnSignIn: process.env.AUTH_REHASH_ON_SIGNIN !== "false",
    passwordMode,
    google,
    facebook,
    discord,
  };
};
