import { withSerwist } from "@serwist/turbopack";

/**
 * `connect-src`, the half of this policy that decides whether uploads work.
 *
 * ## Why only one origin gets added
 *
 * Almost everything this app talks to is **same-origin**, so `'self'` already
 * covers it and nothing needs listing:
 *
 *   - GraphQL goes to `/api/graphql` (`GRAPHQL_PROXY_PATH`), a Next route
 *     handler that forwards to `GRAPHQL_API_URL` server-side
 *     (`src/lib/api/graphql-proxy.ts`). There is no subscription exchange and
 *     will not be one, so there is no `wss:` either (`src/lib/api/urql-client.ts`).
 *   - better-auth goes to `/api/auth/*` (`AUTH_BASE_PATH`), proxied to
 *     `BETTER_AUTH_ORIGIN` the same way (`src/lib/api/auth-proxy.ts`).
 *   - `next/image` requests come back through `/_next/image`.
 *
 * `BETTER_AUTH_ORIGIN` and `GRAPHQL_API_URL` both point at the Loki edge host,
 * and **neither belongs here**: the browser never addresses that host, so an
 * entry for it would widen the policy for a request that is never made. Same
 * for `PUBLIC_APP_ORIGIN` — that *is* `'self'`.
 *
 * ## The exception, and why it cannot be proxied away
 *
 * File bytes. The browser PUTs straight at a presigned URL
 * (`putToUploadTarget`, `src/lib/api/files.ts`) and presigned reads come off
 * the same host. Those URLs are SigV4-signed and the signature covers the
 * `Host` header *and* the path, so they can be neither proxied nor rewritten —
 * see the module comment on `services/actors/src/lib/s3-presign.ts`. MinIO
 * therefore has a hostname of its own, `PUBLIC_FILES_HOST`
 * (`infra/.env.prod.example` §3, `docs/architecture/deploy-loki.md` §1), and
 * that origin has to be in `connect-src` or every upload fails with no network
 * request at all.
 *
 * This fails *asymmetrically*, which is why it would not surface until
 * cutover: `img-src` below already allows `https:`, so existing images render
 * fine while every new upload is blocked.
 *
 * ## The rule for editing this
 *
 * Add specific origins, derived from the deploy's own variables. Never `*`,
 * never a bare `https:`. An over-broad `connect-src` is an exfiltration
 * channel for any XSS that lands, which is a worse bug than the one it fixes.
 * `src/lib/dev-checks/csp.test.ts` enforces both halves of that.
 */

/** `https://host[:port]` and nothing else — no path, no space, no `;`. */
const ORIGIN_ONLY = /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i;

/**
 * Normalise one environment value to a CSP source expression, or `undefined`.
 *
 * Handles both spellings the deploy already uses: `PUBLIC_FILES_HOST` is a
 * bare hostname (the signer concatenates it into the signed `Host` header, so
 * it may not carry a scheme) and `FILES_S3_PUBLIC_URL` is a full URL. Anything
 * that is not a plain http(s) origin after parsing is dropped rather than
 * emitted, so a malformed value cannot break out of the directive.
 */
const cspOrigin = (value) => {
  const raw = value === undefined ? "" : value.trim();
  if (raw === "") return undefined;
  let origin;
  try {
    origin = new URL(raw.includes("://") ? raw : `https://${raw}`).origin;
  } catch {
    return undefined;
  }
  return ORIGIN_ONLY.test(origin) ? origin : undefined;
};

/**
 * The MinIO origin(s) a browser may PUT to and GET from.
 *
 * Production reads `PUBLIC_FILES_HOST`, falling back to `FILES_S3_PUBLIC_URL`
 * — the two names `infra/.env.prod.example` §4 already defines for the same
 * host. **`headers()` is evaluated at build time**, so on Vercel this must be
 * a build-time environment variable, not a runtime one.
 *
 * Development adds MinIO's published host port instead (`MINIO_PORT`, default
 * 9100 per `infra/docker-compose.yml`) so the local stack keeps working with
 * no new variable in anyone's `.env.local`. Those loopback entries are never
 * emitted in a production build.
 */
const fileOrigins = (warn = true) => {
  const configured =
    cspOrigin(process.env.PUBLIC_FILES_HOST) ??
    cspOrigin(process.env.FILES_S3_PUBLIC_URL);

  if (process.env.NODE_ENV === "production") {
    if (configured === undefined) {
      if (warn)
        console.warn(
          "[csp] Neither PUBLIC_FILES_HOST nor FILES_S3_PUBLIC_URL is set for this " +
            "build, so connect-src has no entry for the file host. Image uploads " +
            "will be blocked by CSP in this deployment. See docs/architecture/deploy-loki.md §7.",
        );
      return [];
    }
    return [configured];
  }

  const port = process.env.MINIO_PORT ?? "9100";
  const devPort = /^\d{1,5}$/.test(port) ? port : "9100";
  return [
    ...(configured === undefined ? [] : [configured]),
    `http://localhost:${devPort}`,
    `http://127.0.0.1:${devPort}`,
  ];
};

/**
 * The same list, handed to the browser bundle (D10).
 *
 * `src/lib/api/files.ts` has to know which origins a presigned URL may point
 * at, for one reason: a presigned URL's `Host` is inside its SigV4 signature,
 * so a URL signed for an origin `connect-src` does not allow is not merely
 * slow — the browser refuses it with no network request and no useful error.
 * Deriving the client's copy from `fileOrigins()` rather than from a second
 * environment variable is the point: there is one source of truth for "where
 * may bytes go", and adding an origin to the policy cannot leave the upload
 * path behind.
 *
 * Inlined at build time, like every `NEXT_PUBLIC_*`. `warn` is off here so a
 * misconfigured production build logs the CSP warning once, from `headers()`,
 * rather than twice.
 */
const publicFileOrigins = fileOrigins(false).join(" ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_FILE_ORIGINS: publicFileOrigins,
  },
  // React Strict Mode disabled to prevent development-mode double-renders that cause flashing
  // This was causing visual flashing issues during zoom/pan operations in development
  // React Strict Mode is enabled by default in Next.js 15 development mode
  reactStrictMode: false,
  // Allow larger body sizes for server actions (file uploads)
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  /**
   * `remotePatterns` deliberately has **no entry for the file host** (D10).
   *
   * Item images are served from MinIO by presigned GET URLs: 30-minute TTL,
   * with the expiry and the signature in the query string. Running those
   * through `/_next/image` is wrong three ways, and the middle one is a broken
   * image rather than a slow one:
   *
   *   1. **The cache key is the whole URL, signature included.** Every render
   *      presigns afresh, so every render is a cache miss and a fresh
   *      transformation. The optimizer's cache — the thing `minimumCacheTTL`
   *      below exists to protect — cannot hit even once, so it is pure cost.
   *   2. **`minimumCacheTTL` is 31 days and the URL lives 30 minutes.** The
   *      only way an entry is ever reused is if the same signed URL is
   *      requested twice, and on a miss the optimizer refetches the `src` it
   *      was given — by then a URL MinIO answers `AccessDenied` to. A cached
   *      entry that outlives its own source is a broken image waiting for a
   *      cold cache, which is exactly the failure mode a long TTL is supposed
   *      to prevent.
   *   3. **It is an SSRF allowlist.** `remotePatterns` lets the optimizer
   *      fetch, server-side, any URL matching the pattern. Adding the file
   *      host to it buys nothing here (see 1) and widens that surface.
   *
   * So presigned reads render through a plain `<img>` instead — see
   * `ImageTile` in `src/components/item-api/ItemImages.tsx`. The tradeoff is
   * real and accepted: no server-side resize and no WebP transcode for item
   * photos, so the original bytes go over the wire. It is paid down with a
   * Joy `AspectRatio` box that reserves the space before the bytes arrive (so
   * no layout shift), plus `loading="lazy"` and `decoding="async"` on the tag
   * itself. The right long-term fix is to resize on the way
   * *in* — one derivative per upload, in `FileActor` — not to re-derive one
   * per view from a URL that expires. `img-src` already allows the host.
   *
   * The other patterns here are OAuth avatars: stable, unsigned, public URLs.
   * They are exactly what the optimizer is good at, and they stay.
   */
  images: {
    dangerouslyAllowLocalIP: process.env.NODE_ENV === "development",
    // Cache transformed images for 31 days — item images rarely change.
    // Default is 60s which causes the same transformation to be regenerated
    // repeatedly throughout the day, burning through the free tier limit.
    minimumCacheTTL: 2678400,
    // Only webp — default includes avif+webp which doubles transformations per image.
    formats: ["image/webp"],
    // Only the sizes actually used in the app (200, 400, 500px display sizes + 2x DPR).
    // Default device/image size lists generate many unused variants per image.
    deviceSizes: [400, 500, 828, 1080],
    imageSizes: [200, 400, 500],
    remotePatterns: [
      { protocol: "https", hostname: "s.gravatar.com" },
      { protocol: "https", hostname: "cdn.discordapp.com" },
      { protocol: "https", hostname: "platform-lookaside.fbsbx.com" },
      { protocol: "https", hostname: "graph.facebook.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      // The `*.storage.nhost.run` patterns went with D9, and **nothing replaces
      // them**. That is a decision (D10), not an omission — see below.
    ],
  },
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  async headers() {
    const headers = [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(self)",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https: http:",
              "font-src 'self' data:",
              // See the `fileOrigins` comment at the top of this file before
              // touching this line.
              [
                "connect-src",
                "'self'",
                "https://*.googleapis.com",
                "https://basemaps.cartocdn.com",
                "https://*.basemaps.cartocdn.com",
                "https://d2ad6b4ur7yvpq.cloudfront.net",
                "https://va.vercel-scripts.com",
                ...fileOrigins(),
              ].join(" "),
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];

    return headers;
  },
};

export default withSerwist(nextConfig);
