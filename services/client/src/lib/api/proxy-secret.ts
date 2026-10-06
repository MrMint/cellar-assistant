/**
 * How this Next **server** proves itself to the actor host, and which client
 * it is speaking for (W4 security F3).
 *
 * better-auth on the actor host rate-limits per client address. In production
 * every request reaches it through this server on Vercel and then the host's
 * nginx-proxy, whose peer address is Vercel's egress — the same address for every
 * user — so the actor host has to be *told* who the client is, by something it
 * can trust. That is this server, holding `AUTH_PROXY_SECRET`:
 *
 *   - {@link proxySecretHeaders} goes on **every** request this server makes
 *     to the actor host: the browser passthrough (`auth-proxy.ts`), the token
 *     exchange (`token.ts`) and the session read (`auth-server.ts`). A verified
 *     `/token` or `/get-session` is then counted per session rather than per
 *     address (`services/actors/src/auth/session-exchange-limit.ts`).
 *   - {@link clientIpHeaders} adds the browser's address, on the passthrough
 *     only — the server-side exchanges have no browser in front of them.
 *
 * The actor host verifies the secret and ignores the address without it
 * (`services/actors/src/auth/client-ip.ts`).
 *
 * **Server-only.** `AUTH_PROXY_SECRET` has no `NEXT_PUBLIC_` prefix and is not
 * in `next.config.mjs`'s `env`, so Next never inlines it into a browser bundle;
 * `proxy-secret.test.ts` holds both, and that no `"use client"` module can
 * import this file.
 */

export const PROXY_SECRET_HEADER = "x-cellar-proxy-secret";
export const CLIENT_IP_HEADER = "x-cellar-client-ip";

type Env = Readonly<Record<string, string | undefined>>;

/** `{ x-cellar-proxy-secret }`, or nothing when no secret is configured. */
export const proxySecretHeaders = (
  env: Env = process.env,
): Record<string, string> => {
  const secret = env.AUTH_PROXY_SECRET;
  return secret === undefined || secret === ""
    ? {}
    : { [PROXY_SECRET_HEADER]: secret };
};

/**
 * The browser's address, from a header this deployment's edge **overwrites**
 * — never one a browser can set and have survive:
 *
 *   - on Vercel (`VERCEL=1`, which Vercel sets), `x-real-ip`: "identical to
 *     `x-forwarded-for`", which Vercel overwrites "to prevent IP spoofing"
 *     (vercel.com/docs/headers/request-headers, read 2026-09-28);
 *   - elsewhere, only the header `AUTH_CLIENT_IP_HEADER` names — set it when
 *     this server sits behind a proxy that overwrites one;
 *   - otherwise `null`, and the actor host falls back to the address it saw.
 *
 * Reading `x-forwarded-for` off a request that reached this server directly
 * would hand the rate limiter whatever the caller typed.
 */
export const clientIpFrom = (
  headers: Headers,
  env: Env = process.env,
): string | null => {
  const name =
    env.VERCEL === "1"
      ? "x-real-ip"
      : env.AUTH_CLIENT_IP_HEADER === undefined ||
          env.AUTH_CLIENT_IP_HEADER === ""
        ? undefined
        : env.AUTH_CLIENT_IP_HEADER.toLowerCase();
  if (name === undefined) return null;
  // One address: a list here means something between the edge and this
  // server appended, and the edge's own entry is the first.
  const value = headers.get(name)?.split(",")[0]?.trim();
  return value === undefined || value === "" ? null : value;
};

/** {@link proxySecretHeaders} plus the browser's address, when it is known. */
export const clientIpHeaders = (
  headers: Headers,
  env: Env = process.env,
): Record<string, string> => {
  const ip = clientIpFrom(headers, env);
  return {
    ...proxySecretHeaders(env),
    ...(ip === null ? {} : { [CLIENT_IP_HEADER]: ip }),
  };
};
