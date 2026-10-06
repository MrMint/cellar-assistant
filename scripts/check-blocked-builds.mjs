#!/usr/bin/env node
// Fails when an installed dependency carries an install/postinstall script that
// nobody has ruled on. Run it right after every `bun install` — CI does, in
// both .github/workflows/app-ci.yaml and .github/workflows/stack-ci.yaml, and
// `bun run check:builds` runs it by hand.
//
// WHY THIS EXISTS
// ---------------
// pnpm refused to run a dependency's build script until it was listed in
// pnpm-workspace.yaml's `allowBuilds`, and `strictDepBuilds` defaulted to true,
// so an unreviewed one FAILED THE INSTALL (ERR_PNPM_IGNORED_BUILDS). That is
// how services/actors/Dockerfile's lost corepack pin was caught: it fetched a
// floating pnpm, could not build protobufjs/esbuild, and said so loudly.
//
// Bun's `trustedDependencies` is the same idea with the enforcement removed,
// and under this repo's linker it is worse than the "warns and exits 0" that
// was expected. MEASURED with bun 1.4.2 against a throwaway package whose
// postinstall writes a marker file:
//
//   linker              trusted?  script ran?  install printed a warning?  `bun pm untrusted`
//   isolated (default   no        NO           NO — completely silent      "Found 0"  <-- WRONG
//     for a workspace)  yes       YES          n/a                         "Found 0"
//   hoisted             no        NO           yes, "Blocked 1 postinstall" lists it correctly
//
// Bun picks the isolated linker by default for a workspace, which is the
// column this repo lives in. So the obvious check — grep `bun pm untrusted` —
// is a FALSE NEGATIVE here: it reports zero while scripts are being skipped.
// Hence this script, which reads the installed tree directly and does not care
// which linker produced it.
//
// WHAT IT CHECKS
// --------------
// Every installed package that declares preinstall/install/postinstall must
// appear in the root package.json's `trustedDependencies`. Bun's own
// `bun pm default-trusted` list (367 packages it has decided to trust for
// everyone) is deliberately NOT accepted as a ruling: pnpm trusted nothing
// implicitly, and a package whose build script runs on this repo's CI should be
// named in this repo. Everything currently in that position is already listed.
//
// Deliberately dependency-free, same as scripts/check-node-version.mjs: it runs
// in CI legs that installed only one project's closure.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootManifest = JSON.parse(
  readFileSync(join(repoRoot, "package.json"), "utf8"),
);
const trusted = new Set(rootManifest.trustedDependencies ?? []);

const LIFECYCLE = ["preinstall", "install", "postinstall"];
const found = new Map(); // "name@version" -> [script names]

// Handles both linkers. Under `isolated` the real packages live in
// node_modules/.bun/<key>/node_modules/<name>; under `hoisted` they live
// directly in node_modules/<name>. Scanning both means this keeps working if
// the linker is ever changed, and costs nothing when one of them is absent.
function scanPackageDir(dir) {
  const manifestPath = join(dir, "package.json");
  if (!existsSync(manifestPath)) return;
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return;
  }
  const scripts = manifest.scripts ?? {};
  const hits = LIFECYCLE.filter((name) => scripts[name]);
  if (hits.length === 0) return;
  const name = manifest.name;
  if (!name || trusted.has(name)) return;
  found.set(`${name}@${manifest.version ?? "?"}`, hits);
}

// One node_modules directory: every package in it, scopes included.
function scanNodeModules(nodeModules) {
  if (!existsSync(nodeModules)) return;
  for (const entry of readdirSync(nodeModules, { withFileTypes: true })) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (entry.name === ".bin" || entry.name === ".bun") continue;
    const path = join(nodeModules, entry.name);
    if (entry.name.startsWith("@")) {
      for (const scoped of readdirSync(path, { withFileTypes: true })) {
        if (!scoped.isDirectory() && !scoped.isSymbolicLink()) continue;
        scanPackageDir(join(path, scoped.name));
      }
      continue;
    }
    scanPackageDir(path);
  }
}

const rootNodeModules = join(repoRoot, "node_modules");
if (!existsSync(rootNodeModules)) {
  console.error(
    "\nNo node_modules at the repo root — run `bun install` before this check.\n",
  );
  process.exit(1);
}

// Isolated store.
const store = join(rootNodeModules, ".bun");
if (existsSync(store)) {
  for (const key of readdirSync(store)) {
    scanNodeModules(join(store, key, "node_modules"));
  }
}
// Hoisted tree, plus each workspace member's own directory of links.
scanNodeModules(rootNodeModules);
for (const group of ["services", "packages"]) {
  const groupDir = join(repoRoot, group);
  if (!existsSync(groupDir)) continue;
  for (const member of readdirSync(groupDir)) {
    scanNodeModules(join(groupDir, member, "node_modules"));
  }
}

if (found.size > 0) {
  const lines = [...found.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, hits]) => `  ${id}  [${hits.join(", ")}]`);
  console.error(
    "\nUnreviewed dependency build scripts.\n\n" +
      `${lines.join("\n")}\n\n` +
      "Bun's isolated linker SKIPS these silently — no warning at install time,\n" +
      'and `bun pm untrusted` reports "Found 0". Whatever they were supposed to\n' +
      "build has not been built, and something downstream will fail in a way that\n" +
      "does not mention install scripts.\n\n" +
      "Decide, then record the decision: add the package to the root\n" +
      'package.json\'s "trustedDependencies" to let it build, or remove the\n' +
      "dependency. Do not silence this check.\n",
  );
  process.exit(1);
}

console.log(
  `Dependency build scripts: all reviewed (${trusted.size} trusted: ${[...trusted].sort().join(", ")}).`,
);
