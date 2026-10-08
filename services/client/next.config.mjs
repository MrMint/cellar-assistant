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

/** Loopback names: a files origin on one of these can only be a local lane. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * `images.remotePatterns` entry for one file origin from {@link fileOrigins}:
 * that exact scheme, host and port, any path, any query (the presigned
 * signature lives in the query).
 *
 * Any path rather than `/<bucket>/**`: the bucket is the actor host's
 * `FILES_S3_BUCKET`, which this build does not see, and a mismatch would be a
 * broken image on every card. Nothing is lost by it — this is the deployment's
 * own MinIO, which answers 403 to anything that is not a valid signature, so
 * the optimizer can fetch nothing through this entry that a signed URL did not
 * already authorise.
 */
export const fileImagePattern = (origin) => {
  const url = new URL(origin);
  return {
    protocol: url.protocol === "http:" ? "http" : "https",
    hostname: url.hostname,
    // `""` for the scheme's default port, which is what Next compares against
    // (`URL#port` is empty there too).
    port: url.port,
    pathname: "/**",
  };
};

/**
 * Remote images the app renders through `/_next/image`, and how they are
 * cached. Evaluated from `process.env` on every call, so the test can vary
 * it; Next evaluates it at build time **and again at `next start`**
 * (`loadConfig(PHASE_PRODUCTION_SERVER)`), so a self-hosted server needs the
 * same file-host variable at runtime as at build — `services/client/Dockerfile`
 * sets it in both stages. Vercel takes the build's.
 *
 * ## The file host is back (D10 reversed, 2026-10-06)
 *
 * D10 kept presigned reads out of the optimizer for three reasons. Two were
 * about the URL changing on every render — a cache key that could never hit,
 * and a cached entry outliving its source. Both are gone: `FileActor.presignRead`
 * now signs **one URL per object per window** (6 days by default,
 * `services/actors/src/lib/s3-presign.ts`, "Stable read URLs"), so the same
 * image is the same `url=` for the whole window, the optimizer's cache hits, and no page
 * ever asks for a URL after its window rolls over. The third, the SSRF
 * allowlist, is bounded by {@link fileImagePattern}: one origin, ours, which
 * serves nothing unsigned.
 *
 * What it buys: production measured full originals (up to 4.6 MB) downloaded
 * for 400 px cards. Through the optimizer they are WebP at the rendered width.
 *
 * ## `minimumCacheTTL` is the window, not 31 days
 *
 * Production at `82450ad1` used 31 days for Nhost storage URLs, which never
 * changed. A presigned URL changes every window, so an optimizer entry older
 * than the window is one no page will request again — a longer TTL adds no
 * hits. It only lets anyone holding an old `/_next/image?url=<signed URL>`
 * keep fetching the image from the optimizer's (public) cache long after the
 * URL itself stopped verifying. So it is the default window, 6 days — set
 * here explicitly rather than left to the upstream `max-age=<window>` the
 * actor host signs into every read URL, because that header also says
 * `private` and the cache that matters in production is Vercel's, not Next's
 * own `getMaxAge`. Keep the two equal: change `DEFAULT_READ_URL_WINDOW_SECONDS`
 * (or `FILES_READ_URL_WINDOW_SECONDS`) and change this with it.
 *
 * It was a day until 2026-10-05, which meant every image × width was
 * re-transformed daily — each window rollover is a new `url=`.
 *
 * ## `dangerouslyAllowLocalIP`: only when the file host is loopback
 *
 * Next 16 refuses to optimise an image whose host resolves to a private
 * address. Both local lanes serve files from `localhost`: the host-run dev
 * server (`NODE_ENV=development`) and the `cellar-stack` client container,
 * which is a production build whose `FILES_S3_PUBLIC_URL` is
 * `http://localhost:9100` (the container reaches it through the
 * `client-files-loopback` forwarder in `infra/docker-compose.yml`). The flag
 * is derived from that rather than from a variable someone could set: a build
 * whose file host is loopback cannot be serving real users, because no
 * browser but the developer's could fetch its images.
 */
export const imagesConfig = () => {
  const origins = fileOrigins(false);
  const loopbackOnly =
    origins.length > 0 &&
    origins.every((origin) => LOOPBACK_HOSTS.has(new URL(origin).hostname));
  return {
    dangerouslyAllowLocalIP:
      process.env.NODE_ENV === "development" || loopbackOnly,
    // See "`minimumCacheTTL` is the window" above. Was 31 days (2678400)
    // under Nhost, then 1 day (86400).
    minimumCacheTTL: 518400,
    // Only webp — default includes avif+webp which doubles transformations per image.
    formats: ["image/webp"],
    // Only the sizes actually used in the app (200, 400, 500px display sizes + 2x DPR).
    // Default device/image size lists generate many unused variants per image.
    deviceSizes: [400, 500, 828, 1080],
    imageSizes: [200, 400, 500],
    remotePatterns: [
      // Item photos and mirrored place photos: presigned GETs on our MinIO.
      ...origins.map(fileImagePattern),
      // OAuth avatars: stable, unsigned, public URLs.
      { protocol: "https", hostname: "s.gravatar.com" },
      { protocol: "https", hostname: "cdn.discordapp.com" },
      { protocol: "https", hostname: "platform-lookaside.fbsbx.com" },
      { protocol: "https", hostname: "graph.facebook.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      // Brand logos and recipe pictures are NOT here: `Brand.logoUrl` and
      // `Recipe.imageUrl` are free-form URLs on any producer's host, which no
      // pattern can bound without becoming an open SSRF proxy. They stay
      // plain `<img>` (`BrandCard`, `RecipeDetails`, …).
    ],
  };
};

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
  images: imagesConfig(),
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
