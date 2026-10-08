/**
 * Copy MapLibre GL JS's web worker into `public/maplibre/`, so the app serves
 * it same-origin at `MAPLIBRE_WORKER_URL`
 * (`src/components/map/maplibre/workerUrl.ts`).
 *
 * Why this exists: maplibre-gl v6 ships ESM only, and its worker is a real
 * module file (`dist/maplibre-gl-worker.mjs`) that imports its sibling
 * `maplibre-gl-shared.mjs` by relative path. Next's asset handling — Turbopack
 * and `next build --webpack` alike — emits a `new URL(..., import.meta.url)`
 * worker as one hashed file without that sibling, so the worker dies on its
 * first import and the map mounts but never requests a tile, with no error a
 * typecheck or unit test could see. Upstream's documented fix for Next.js is
 * exactly this: serve both files from `public/` and point `setWorkerUrl` at
 * the worker (maplibre-gl-js docs/index.md, ESM → Turbopack).
 *
 * Both files are copied, not just the worker, and they are copied from
 * `node_modules` at dev/build time, so they always match the installed
 * version — a committed copy would go stale on the next bump and fail the same
 * silent way. `public/maplibre/` is gitignored.
 *
 * Every path that starts Next runs this first: the `dev`, `dev:node`, `build`
 * and `build:node` scripts in package.json, and the client Dockerfile's build
 * stage. `src/lib/dev-checks/maplibre-worker.test.ts` holds that list.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAPLIBRE_WORKER_FILES = [
  "maplibre-gl-worker.mjs",
  "maplibre-gl-shared.mjs",
];

const clientDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const require = createRequire(path.join(clientDir, "package.json"));
const dist = path.join(
  path.dirname(require.resolve("maplibre-gl/package.json")),
  "dist",
);
const dest = path.join(clientDir, "public", "maplibre");

mkdirSync(dest, { recursive: true });
for (const file of MAPLIBRE_WORKER_FILES) {
  copyFileSync(path.join(dist, file), path.join(dest, file));
}
