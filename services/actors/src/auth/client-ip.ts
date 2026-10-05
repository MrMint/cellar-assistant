/**
 * Which client an auth request is from — the key better-auth's rate limiter
 * counts against — and which requests are the Next server's own session
 * exchanges (W4 security F3 / api-client review "shared IP bucket").
 *
 * ## The defect
 *
 * better-auth 1.7.3 turns its limiter on whenever `NODE_ENV=production`
 * (`context/create-context.mjs`), which the actors image sets: 100 requests per
 * 10 s per `(ip, path)`, and 3 per 10 s on `/sign-in*` and `/sign-up*`. It
 * reads the IP from `x-forwarded-for`, and only when that holds exactly one
 * address; otherwise every request shares one `no-trusted-ip` bucket per path.
 *
 * Production's path is browser → Vercel (the Next proxy, `auth-proxy.ts`) →
 * the host's nginx-proxy → here. The edge's peer is Vercel's egress address,
 * shared by every user, and that is the address an untrusted edge can vouch
 * for. (It was Caddy when this was written, which *replaced*
 * `x-forwarded-for` with its peer; nginx-proxy *appends* its peer to whatever
 * the caller sent — see "Unverified traffic" below for why that is equally
 * safe here.) So everyone signing in counted against the same 3-per-10 s
 * bucket (one attacker sending three bad passwords locked everyone out), and
 * `services/client`'s server-side `/token` exchanges — one per GraphQL request
 * and per SSR render — counted against one 100-per-10 s bucket for the whole
 * user base.
 *
 * ## The mechanism
 *
 * Vercel's egress addresses are not a published, fixed list, so "trust these
 * proxy IPs" (nginx `set_real_ip_from`, better-auth `trustedProxies`) has
 * nothing to list. Trust is a **shared secret** instead:
 *
 *   - the Next proxy sends `x-cellar-proxy-secret: $AUTH_PROXY_SECRET` and
 *     `x-cellar-client-ip: <x-real-ip>` — on Vercel `x-real-ip` is the client's
 *     address and Vercel overwrites any value a client sent ("to prevent IP
 *     spoofing", vercel.com/docs/headers/request-headers);
 *   - {@link resolveClientIp}, ahead of better-auth, compares the secret in
 *     constant time and only then keeps the claimed address. **It always
 *     rewrites `x-cellar-client-ip`**, so a value arriving without the secret
 *     never reaches better-auth: an attacker at the public edge gets the
 *     address the edge saw for them, not the one they claimed;
 *   - better-auth reads that one header and nothing else
 *     (`advanced.ipAddress.ipAddressHeaders` in `./auth.ts`).
 *
 * Unverified traffic — a direct hit on the edge, or a lane with no secret —
 * falls back to the right-most `x-forwarded-for` entry, which is the one the
 * nearest proxy wrote, and then to the socket peer. In production that proxy
 * is nginx-proxy, whose template sends `X-Forwarded-For:
 * $proxy_add_x_forwarded_for` — the caller's own header with nginx's
 * `$remote_addr` APPENDED — and `X-Real-IP: $remote_addr`, with no `real_ip`
 * module configured. A caller can put anything in front; it cannot put
 * anything after nginx's entry, so the right-most one is still the address
 * nginx accepted the TCP connection from. Measured through the pinned
 * nginx-proxy image with this function as the upstream: `X-Forwarded-For:
 * 6.6.6.6`, `X-Real-IP: 6.6.6.6` and `x-cellar-client-ip: 6.6.6.6` without
 * the secret resolved to the peer, not 6.6.6.6
 * (docs/architecture/deploy-loki.md §8). `X-Real-IP` is never read here. If
 * the edge hostname is put behind Cloudflare's proxy, that peer is a
 * Cloudflare address — still not caller-chosen, but shared, like Vercel's.
 *
 * ## Why the header is a secret and not a signature
 *
 * The secret travels Vercel → nginx-proxy over TLS and nginx-proxy → here on
 * the host's `bridge` network. A signature over (ip, timestamp) would add replay protection, but
 * what a replay could achieve is choosing which rate-limit bucket a request
 * lands in — which anyone holding the secret can do anyway. The secret is
 * compared, stripped, and never logged by this process; nginx-proxy's access
 * log format (`vhost`) records the request line and no request headers.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type express from "express";

/** The only header better-auth reads a client address from. */
export const CLIENT_IP_HEADER = "x-cellar-client-ip";
/** What the Next proxy proves itself with. */
export const PROXY_SECRET_HEADER = "x-cellar-proxy-secret";
/**
 * Set by {@link resolveClientIp} — never by a caller, it is deleted on the way
 * in — when the secret checked out. `./auth.ts` reads it to exempt the
 * server's session exchanges from the per-IP limit.
 */
export const VERIFIED_PROXY_HEADER = "x-cellar-verified-proxy";

const digest = (value: string): Buffer =>
  createHash("sha256").update(value, "utf8").digest();

/** Constant-time, and length-safe: both sides are hashed to 32 bytes first. */
export const secretMatches = (
  presented: string | undefined,
  expected: string | undefined,
): boolean =>
  presented !== undefined &&
  expected !== undefined &&
  expected !== "" &&
  timingSafeEqual(digest(presented), digest(expected));

const single = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** `::ffff:1.2.3.4` → `1.2.3.4`, the way better-auth normalises too. */
const bareIp = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  const unmapped = trimmed.toLowerCase().startsWith("::ffff:")
    ? trimmed.slice(7)
    : trimmed;
  return isIP(unmapped) !== 0 ? unmapped : undefined;
};

/** The address the nearest proxy appended: the last `x-forwarded-for` entry. */
const nearestForwardedFor = (
  header: string | string[] | undefined,
): string | undefined => {
  const joined = Array.isArray(header) ? header.join(",") : header;
  const entries = (joined ?? "").split(",").filter((e) => e.trim() !== "");
  return bareIp(entries.at(-1));
};

export type ClientIpOptions = {
  /** `AUTH_PROXY_SECRET`. Unset means no request is ever verified. */
  readonly proxySecret: string | undefined;
};

/**
 * Express middleware for `/api/auth/*`, ahead of better-auth. Mutates
 * `req.headers` in place — better-call's node adapter builds the `Request`
 * better-auth sees from exactly that object.
 */
export const resolveClientIp =
  ({ proxySecret }: ClientIpOptions): express.RequestHandler =>
  (req, _res, next) => {
    const verified = secretMatches(
      single(req.headers[PROXY_SECRET_HEADER]),
      proxySecret,
    );
    const claimed = bareIp(single(req.headers[CLIENT_IP_HEADER]));

    // Whatever arrived, none of these three survive as sent.
    delete req.headers[PROXY_SECRET_HEADER];
    delete req.headers[VERIFIED_PROXY_HEADER];
    delete req.headers[CLIENT_IP_HEADER];

    const ip =
      (verified ? claimed : undefined) ??
      nearestForwardedFor(req.headers["x-forwarded-for"]) ??
      bareIp(req.socket.remoteAddress);
    if (ip !== undefined) req.headers[CLIENT_IP_HEADER] = ip;
    if (verified) req.headers[VERIFIED_PROXY_HEADER] = "1";
    next();
  };

/** Did {@link resolveClientIp} verify this request? */
export const isVerifiedProxy = (headers: Headers): boolean =>
  headers.get(VERIFIED_PROXY_HEADER) === "1";
