/**
 * maplibre-gl v6's worker reaches the browser by one route only: copied from
 * `node_modules` into `public/maplibre/` by `scripts/copy-maplibre-worker.mjs`
 * (that file says why the bundler cannot do it), and named to every map by
 * `MAPLIBRE_WORKER_URL`. Each link in that chain fails the same way — the map
 * mounts, draws its background, and never requests a tile, with nothing in
 * `tsc`, `biome` or the build output to show for it. So the links are pinned
 * here:
 *
 *  1. the copy script copies every file the worker needs: the worker plus
 *     each sibling it imports by relative path, read from the installed dist
 *     (a later maplibre release that splits out another chunk fails here,
 *     not in a browser);
 *  2. `MAPLIBRE_WORKER_URL` points at the copied worker;
 *  3. every way this app starts Next — the dev/build scripts and the image's
 *     build stage — runs the copy first;
 *  4. every module that constructs a map tells it the worker URL. (v5's
 *     default import, which v6 no longer exports, is also refused here with a
 *     message naming the fix; `tsc` reports it too, as TS1192.)
 *
 *   bun run --filter @cellar-assistant/client test
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, posix, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { MAPLIBRE_WORKER_URL } from "@/components/map/maplibre/workerUrl";

const clientDir = fileURLToPath(new URL("../../../", import.meta.url));
const read = (path: string): string =>
  readFileSync(join(clientDir, path), "utf8");

const copyScript = read("scripts/copy-maplibre-worker.mjs");
const copiedFiles = (() => {
  const list = /const MAPLIBRE_WORKER_FILES = \[([^\]]*)\]/.exec(copyScript);
  assert.ok(list, "MAPLIBRE_WORKER_FILES not found in the copy script");
  return [...(list[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
})();

const dist = join(
  dirname(
    createRequire(join(clientDir, "package.json")).resolve(
      "maplibre-gl/package.json",
    ),
  ),
  "dist",
);

test("the copy script copies the worker and every sibling it imports", () => {
  const needed = new Set<string>(["maplibre-gl-worker.mjs"]);
  const queue = ["maplibre-gl-worker.mjs"];
  while (queue.length > 0) {
    const file = queue.pop() ?? "";
    const source = readFileSync(join(dist, file), "utf8");
    for (const m of source.matchAll(
      /(?:\bfrom|\bimport)\s*\(?\s*["'](\.\/[^"']+)["']/g,
    )) {
      const sibling = posix.normalize(m[1] ?? "");
      if (!needed.has(sibling)) {
        needed.add(sibling);
        queue.push(sibling);
      }
    }
  }
  assert.deepEqual([...copiedFiles].sort(), [...needed].sort());
});

test("MAPLIBRE_WORKER_URL names the copied worker under public/maplibre/", () => {
  assert.equal(MAPLIBRE_WORKER_URL, "/maplibre/maplibre-gl-worker.mjs");
  assert.ok(copyScript.includes('path.join(clientDir, "public", "maplibre")'));
  assert.ok(copiedFiles.includes(posix.basename(MAPLIBRE_WORKER_URL)));
});

test("every script that starts Next copies the worker first", () => {
  const { scripts } = JSON.parse(read("package.json")) as {
    scripts: Record<string, string>;
  };
  const starters = Object.entries(scripts).filter(([, cmd]) =>
    /\bnext (dev|build)\b/.test(cmd),
  );
  assert.ok(starters.length >= 4, "expected dev, dev:node, build, build:node");
  for (const [name, cmd] of starters) {
    assert.ok(
      cmd.startsWith("node scripts/copy-maplibre-worker.mjs && "),
      `script "${name}" starts Next without copying the maplibre worker: ${cmd}`,
    );
  }
});

test("the client image copies the worker before `next build`", () => {
  const runs = read("Dockerfile")
    .split("\n")
    .filter((line) => line.startsWith("RUN "));
  const copy = runs.findIndex((l) => l.includes("copy-maplibre-worker.mjs"));
  const build = runs.findIndex((l) => /\bnext build\b/.test(l));
  assert.ok(build >= 0, "no `next build` RUN in the Dockerfile");
  assert.ok(copy >= 0 && copy < build, "worker copy must run before build");
});

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path)) {
      out.push(path);
    }
  }
  return out;
};

test("every map constructor is given the worker URL", () => {
  const constructors: string[] = [];
  for (const path of walk(join(clientDir, "src"))) {
    const source = readFileSync(path, "utf8");
    const file = relative(clientDir, path);
    assert.ok(
      !/import\s+\w+\s+from\s+["']maplibre-gl["']/.test(source),
      `${file}: maplibre-gl v6 has no default export; use a namespace or named import`,
    );
    const reactMapGlMap =
      /import\s*\{[^}]*\bMap\b[^}]*\}\s*from\s*["']react-map-gl\/maplibre["']/.test(
        source,
      ) && /<\s*Map(GL)?\b/.test(source);
    const bareMap =
      /new\s+(maplibregl\.)?Map\s*\(\s*\{/.test(source) &&
      /from\s+["']maplibre-gl["']/.test(source);
    if (!reactMapGlMap && !bareMap) continue;
    constructors.push(file);
    assert.ok(
      source.includes("MAPLIBRE_WORKER_URL"),
      `${file} constructs a map without MAPLIBRE_WORKER_URL`,
    );
  }
  // Both known maps were found — a regex that silently matched nothing would
  // pass the loop above vacuously.
  assert.ok(
    constructors.some((f) => f.endsWith("MapLibreRenderer.tsx")) &&
      constructors.some((f) => f.endsWith("CountryHeatmap.tsx")),
    `expected both maps, found: ${constructors.join(", ")}`,
  );
});
