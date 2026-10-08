/**
 * The path a signed-in-looking request asked for, handed from `src/proxy.ts`
 * to the server components behind it (D19, X17: "returnTo survives the
 * proxy").
 *
 * The proxy lets a request through on the mere presence of a session cookie;
 * only `getServerUser()` learns the session behind it has ended, and it
 * redirects to `/sign-in`. A server component is not told its own URL, so
 * that redirect used to drop the destination: a friend whose session had
 * lapsed opened a shared link, signed in, and landed on Home. The proxy now
 * stamps the path on the request, and the redirect carries it as `returnTo`.
 *
 * The value is the proxy's own reading of the URL, set (never appended) over
 * anything a client sent, and it is sanitised again where it is used
 * (`withReturnTo`), so it can only ever name a path on this site.
 */
export const REQUEST_PATH_HEADER = "x-cellar-request-path";

/** `pathname + search`, as the proxy saw it. */
export const requestPathOf = (url: { pathname: string; search: string }) =>
  `${url.pathname}${url.search}`;
