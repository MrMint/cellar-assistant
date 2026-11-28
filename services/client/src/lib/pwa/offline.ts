/**
 * The service worker's offline fallback page.
 *
 * Three places have to agree on this path, which is why it is a constant:
 *
 *   - `src/app/serwist/[path]/route.ts` precaches it,
 *   - `src/app/sw.ts` serves it when a document request fails,
 *   - `src/proxy.ts` lets it through **without a session**.
 *
 * The last one is the one that used to be missing. The worker installs on
 * whatever page the browser first loads, and for a new visitor that is
 * `/sign-in` — so the precache request for this page went out signed out, the
 * signed-in gate answered it with a redirect, and what got cached as "the
 * offline page" was the sign-in page. Offline, a signed-out cache showed a
 * sign-in form that could not work.
 */
export const OFFLINE_PATH = "/~offline";
