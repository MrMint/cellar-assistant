/**
 * The origin a share page was requested on, for the absolute URLs a
 * link preview needs (`og:image`, `og:url`). The app has no configured site
 * URL — it is served on whatever host Vercel, the compose lane or a dev
 * server gives it — so the request says.
 *
 * `x-forwarded-host`/`-proto` first (Vercel and any proxy in front set them),
 * then `host`. Plain `http` only for a loopback host; everything else is
 * `https`. A host that is not host-shaped yields `null`, and the caller
 * leaves the URLs relative rather than print a header it cannot trust.
 */

const HOST = /^[a-z0-9.-]+(?::\d{1,5})?$|^\[[0-9a-f:]+\](?::\d{1,5})?$/i;
const LOOPBACK =
  /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$|\.localhost(:\d+)?$/i;

type HeaderReader = { get(name: string): string | null };

const first = (value: string | null): string | null =>
  value?.split(",")[0]?.trim() || null;

export const requestOrigin = (headers: HeaderReader): string | null => {
  const host =
    first(headers.get("x-forwarded-host")) ?? first(headers.get("host"));
  if (host === null || !HOST.test(host)) return null;
  const forwarded = first(headers.get("x-forwarded-proto"));
  const proto =
    forwarded === "http" || forwarded === "https"
      ? forwarded
      : LOOPBACK.test(host)
        ? "http"
        : "https";
  return `${proto}://${host}`;
};
