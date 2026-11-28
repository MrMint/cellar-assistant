import { forgetRememberedCompanions } from "@/components/pour/remembered-companions";
import { MAP_TILES_CACHE, WASM_CACHE } from "./cache-names";

/**
 * Which of the service worker's caches survive a sign-out.
 *
 * The worker caches more than static files. `defaultCache` (see
 * `runtime-caching.ts`) keeps RSC payloads (`pages-rsc`,
 * `pages-rsc-prefetch`), HTML (`pages`), same-origin GETs (`others`, `apis`),
 * optimised images (`next-image` — that is every bottle photo, through
 * `/_next/image`) and anything cross-origin (`cross-origin` — presigned photo
 * reads among them). All of it was rendered for the person who was signed in,
 * and none of it was cleared when they signed out, so the next person on a
 * shared phone could be served the last one's cellar from cache.
 *
 * So this is an **allowlist of what to keep**, not a list of what to delete:
 * a cache this file has never heard of is purged. Getting that backwards
 * would mean every new runtime rule added to `runtime-caching.ts` is kept by
 * default, which is the leak again. What is kept is identical for every
 * viewer: the precache (build assets and the offline page, which is public —
 * `src/lib/pwa/offline.ts`), hashed or public static assets, fonts, the
 * barcode reader and map tiles.
 */
const KEEP_EXACT = new Set<string>([
  "google-fonts-webfonts",
  "google-fonts-stylesheets",
  "static-font-assets",
  "static-image-assets",
  "next-static-js-assets",
  "static-audio-assets",
  "static-video-assets",
  "static-js-assets",
  "static-style-assets",
  WASM_CACHE,
  MAP_TILES_CACHE,
]);

/** serwist's precache: `serwist-precache-v2-<scope>`. */
const KEEP_PREFIXES = ["serwist-precache"];

export const cachesToPurge = (names: readonly string[]): string[] =>
  names.filter(
    (name) =>
      !KEEP_EXACT.has(name) &&
      !KEEP_PREFIXES.some((prefix) => name.startsWith(prefix)),
  );

/**
 * Delete every viewer-specific cache. Returns the names it deleted.
 *
 * Runs in the page, not the worker: `CacheStorage` is shared between a
 * window and its service worker for the same origin, so there is no message
 * to send. It never throws — `caches` is absent on an insecure origin and can
 * reject in a private window, and a sign-out must not fail because a cache
 * could not be cleared.
 */
export async function purgeUserCaches(
  storage:
    | Pick<CacheStorage, "keys" | "delete">
    | undefined = globalThis.caches,
): Promise<string[]> {
  forgetRememberedCompanions();
  if (storage === undefined) return [];
  try {
    const doomed = cachesToPurge(await storage.keys());
    await Promise.all(doomed.map((name) => storage.delete(name)));
    return doomed;
  } catch (error) {
    console.error("Could not clear cached pages on sign-out:", error);
    return [];
  }
}
