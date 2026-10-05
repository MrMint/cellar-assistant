#!/usr/bin/env node
// Runs as the workspace root's `preinstall` (package.json) AND as an explicit
// step in both CI workflows. It needs both, and the reason is the difference
// between the two package managers:
//
//   pnpm install                    ran this
//   pnpm install --filter "./x..."  ran this too — verified at the time
//   bun install                     runs this
//   bun install --filter "./x..."   DOES NOT run it — measured under bun 1.4.2
//
// CI (.github/workflows/*.yaml) installs with `--filter` per leg, never a bare
// install, so the `preinstall` hook alone would silently protect nothing there.
// Each leg therefore calls this script by name right after `actions/setup-node`
// and before the install. Locally the hook still fires, because a developer
// running `bun install` at the root is the unfiltered case.
//
// The other consequence of that table: this file is NOT reachable from the
// Docker build context (.dockerignore excludes `scripts`), and under bun that
// is fine, because the Dockerfiles' filtered installs never invoke it.
//
// Why this exists: nothing enforced `.nvmrc` before this. A shell whose
// default Node is not the pinned one (fnm/nvm not auto-switching in a
// non-interactive shell, say) got whatever was on PATH, and a wrong major
// version doesn't fail cleanly — it breaks Node's built-in TypeScript type
// stripping in a way that surfaces as unrelated-looking test failures deep in
// a run (see services/actors/src/auth/migrate-users.test.ts) rather than as
// "you're on the wrong Node". Failing once, here, with a clear message, is
// cheaper than debugging that.
//
// Deliberately dependency-free: `preinstall` runs before anything in
// node_modules exists, so this cannot `require("semver")` or similar.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const nvmrcPath = fileURLToPath(new URL("../.nvmrc", import.meta.url));
const required = readFileSync(nvmrcPath, "utf8").trim();
const [requiredMajor, requiredMinor] = required.split(".").map(Number);

// Bun populates `process.versions.node` with a synthetic value (26.3.0 under
// bun 1.4.2) that is higher than any real release, so a naive comparison here
// does not merely pass by accident — it FAILS, and then tells a Bun user that
// "this shell is running Node 26.3.0" and to `fnm use`, which is both untrue
// and useless. Bun transpiles TypeScript itself, so the type-stripping premise
// this guard exists to protect does not apply to it at all.
if (process.versions.bun !== undefined) {
  console.log(
    `Running under Bun ${process.versions.bun}; skipping the Node ${
      readFileSync(nvmrcPath, "utf8").trim()
    } check, which only governs Node's type stripping.`,
  );
  process.exit(0);
}

const current = process.versions.node;
const [currentMajor, currentMinor] = current.split(".").map(Number);

const ok =
  currentMajor === requiredMajor &&
  (requiredMinor === undefined || currentMinor >= requiredMinor);

if (!ok) {
  console.error(
    `\nThis repo requires Node ${required} (.nvmrc); this shell is running Node ${current}.\n` +
      "Switch first (fnm use / nvm use), then re-run install.\n" +
      "A wrong major version does not fail cleanly later — it breaks Node's\n" +
      "built-in TypeScript type stripping in ways that look like unrelated\n" +
      "test failures instead of a version mismatch.\n",
  );
  process.exit(1);
}
