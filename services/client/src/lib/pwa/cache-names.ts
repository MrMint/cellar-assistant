/**
 * The names of the caches this app's own runtime rules create
 * (`runtime-caching.ts`). A module of its own, with no imports, because the
 * sign-out path (`purge-caches.ts`) needs the names in the page bundle and
 * must not drag serwist's strategies in with them.
 */

/** zxing-wasm, self-hosted, so barcode scanning works offline after one load. */
export const WASM_CACHE = "static-wasm";

/** CARTO basemap styles, glyphs, sprites and vector tiles. */
export const MAP_TILES_CACHE = "map-tiles";
