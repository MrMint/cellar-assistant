/**
 * Where the app serves MapLibre's web worker. maplibre-gl v6 cannot find its
 * worker inside a Next bundle on its own, so every map must be told this URL
 * before it is constructed — `<Map workerUrl>` for react-map-gl, or
 * `setWorkerUrl()` for a bare `maplibregl.Map`. The file is copied into
 * `public/maplibre/` by `scripts/copy-maplibre-worker.mjs`; see that file for
 * why it cannot come from the bundler.
 */
export const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";
