import { defaultCache } from "@serwist/turbopack/worker";
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkOnly,
  type RuntimeCaching,
  StaleWhileRevalidate,
} from "serwist";
import { MAP_TILES_CACHE, WASM_CACHE } from "./cache-names";

/**
 * The service worker's runtime caching rules, in the order the worker tries
 * them. **Order is the whole contract**: serwist hands a request to the first
 * entry whose matcher accepts it, and `defaultCache` ends in catch-alls — an
 * `others` route for every same-origin GET and a `cross-origin` route for
 * every other one. Anything listed after `...defaultCache` is unreachable.
 *
 * That is what this module fixes. `sw.ts` used to list its own rules *after*
 * `...defaultCache`, so none of them ever ran:
 *
 *   - the `/v1/graphql` and `/v1/auth` rules named endpoints this app does
 *     not serve (GraphQL is `/api/graphql`,
 *     a POST the worker does not cache; auth is `/api/auth/*`, which
 *     `defaultCache` already sends to the network). Deleted.
 *   - the font, image and `/_next/image` rules duplicated rules `defaultCache`
 *     already has under its own names (`static-font-assets`,
 *     `static-image-assets`, `next-image`), which won. Deleted rather than
 *     kept as decoration.
 *   - the `.wasm` rule (the zxing barcode reader) and the map-tile rule are
 *     the two that meant something. They now come first, so they apply.
 *
 * The map-tile matcher could not have matched even in first place: a `RegExp`
 * matcher only accepts a **cross-origin** URL when the match starts at index 0
 * of the href (serwist's `RegExpRoute`), and the old `/basemaps\.cartocdn\.com/`
 * matched in the middle of `https://tiles.basemaps.cartocdn.com/…`. It is
 * anchored now.
 *
 * Kept in its own module, rather than inline in `sw.ts`, so it can be tested:
 * `sw.ts` constructs a `Serwist` against `self` at import time. Imported from
 * `sw.ts` by relative path, because the worker is bundled by serwist's own
 * esbuild step, not by Next.
 */

export { MAP_TILES_CACHE, WASM_CACHE };

/**
 * The UI sounds (`lib/feedback/sound.ts`, `public/sounds/`). The production
 * worker precaches them already (`@serwist/turbopack` globs `public/**`);
 * this rule keeps them offline wherever the precache is off (development) or
 * a revision changed under a running worker. Not private data, so the
 * sign-out purge leaves it alone.
 */
export const SOUNDS_CACHE = "ui-sounds";
export const SOUNDS_MATCHER = /\/sounds\/[\w-]+\.mp3$/i;

/** Every `*.basemaps.cartocdn.com` URL, anchored so serwist accepts it cross-origin. */
export const MAP_TILES_MATCHER =
  /^https:\/\/(?:[a-z0-9-]+\.)*basemaps\.cartocdn\.com\//i;

export const runtimeCaching: RuntimeCaching[] = [
  {
    // Pages always come from the network; a failed one falls back to the
    // precached offline page (`fallbacks` in `sw.ts`). Reading real pages
    // offline is phase 2 (roadmap L07).
    matcher: ({ request }) => request.mode === "navigate",
    handler: new NetworkOnly(),
  },
  {
    matcher: /\.wasm$/i,
    handler: new CacheFirst({
      cacheName: WASM_CACHE,
      plugins: [
        new ExpirationPlugin({
          maxEntries: 5,
          maxAgeSeconds: 60 * 60 * 24 * 365,
        }),
      ],
    }),
  },
  {
    matcher: ({ url, sameOrigin }) =>
      sameOrigin && SOUNDS_MATCHER.test(url.pathname),
    handler: new CacheFirst({
      cacheName: SOUNDS_CACHE,
      plugins: [new ExpirationPlugin({ maxEntries: 8 })],
    }),
  },
  {
    matcher: MAP_TILES_MATCHER,
    handler: new StaleWhileRevalidate({
      cacheName: MAP_TILES_CACHE,
      plugins: [
        new ExpirationPlugin({
          maxEntries: 500,
          maxAgeSeconds: 60 * 60 * 24 * 7,
        }),
      ],
    }),
  },
  ...defaultCache,
];
