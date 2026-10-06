/**
 * Every image that runs `bun install --frozen-lockfile` must see the manifest
 * of EVERY workspace member, not just its own closure.
 *
 * There is one lockfile at the root, and bun's `--frozen-lockfile` compares it
 * against every member it can see; a member listed in `bun.lock` whose
 * `package.json` is absent fails the install ("… which is listed in bun.lock
 * but not on disk"), even when nothing in the image depends on it. The
 * Dockerfiles copy those manifests from a hand-maintained list of `COPY` lines,
 * so a new `packages/*` directory breaks all three images at once and nothing
 * but a real `docker build` notices. That happened with `packages/analysis`
 * (wave 3b-2): typecheck and every suite stayed green while the images the
 * production deploy builds could not install.
 *
 * This test derives the member list the way bun does — from the root
 * `package.json`'s `workspaces.packages` globs — and holds each such
 * Dockerfile to it, and holds each Dockerfile's build-context ignore file to
 * not excluding those manifests (a `COPY` of an ignored file fails too).
 *
 * It lives in services/api because that leg of `stack-ci.yaml` triggers on
 * every input it reads (see that workflow's `paths`); the client Dockerfile is
 * checked from here as well rather than duplicating the test in app-ci.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const read = (relative: string): string =>
  readFileSync(join(repoRoot, relative), "utf8");

/**
 * Deliberate exceptions: `"<dockerfile>": { "<workspace dir>": "reason" }`.
 * Empty today — every image needs every manifest. An entry needs a reason a
 * reviewer can check, and the test below fails on an entry that names a
 * Dockerfile or workspace that no longer exists.
 */
const EXCLUSIONS: Record<string, Record<string, string>> = {};

/**
 * Expands the `workspaces.packages` globs. Only the two shapes bun workspaces
 * here actually use are supported — a literal directory and `dir/*` — and
 * anything else THROWS rather than being under-expanded, because a glob this
 * function silently misread is exactly the drift the test exists to catch.
 */
function workspaceDirs(): string[] {
  const manifest = JSON.parse(read("package.json")) as {
    workspaces?: { packages?: unknown };
  };
  const globs = manifest.workspaces?.packages;
  if (!Array.isArray(globs) || globs.length === 0) {
    throw new Error("root package.json has no workspaces.packages array");
  }
  const dirs: string[] = [];
  for (const glob of globs) {
    if (typeof glob !== "string") throw new Error(`bad glob ${String(glob)}`);
    const star = /^([\w.-]+(?:\/[\w.-]+)*)\/\*$/.exec(glob);
    if (star) {
      const parent = star[1] ?? "";
      for (const entry of readdirSync(join(repoRoot, parent), {
        withFileTypes: true,
      })) {
        const dir = `${parent}/${entry.name}`;
        if (
          entry.isDirectory() &&
          existsSync(join(repoRoot, dir, "package.json"))
        ) {
          dirs.push(dir);
        }
      }
    } else if (/^[\w.-]+(?:\/[\w.-]+)*$/.test(glob)) {
      if (existsSync(join(repoRoot, glob, "package.json"))) dirs.push(glob);
    } else {
      throw new Error(
        `workspaces glob ${JSON.stringify(glob)} is not a shape this test ` +
          "can expand (a literal dir or `dir/*`); extend workspaceDirs().",
      );
    }
  }
  return dirs.sort();
}

/** Dockerfiles that install the workspace with the frozen root lockfile. */
function installingDockerfiles(workspaces: string[]): string[] {
  return workspaces
    .map((dir) => `${dir}/Dockerfile`)
    .filter((file) => existsSync(join(repoRoot, file)))
    .filter((file) => /bun install[^\n]*--frozen-lockfile/.test(read(file)));
}

const escapeRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** `COPY [--flags] <dir>/package.json ./<dir>/` as its own instruction. */
function copiesManifest(dockerfile: string, dir: string): boolean {
  const pattern = new RegExp(
    `^COPY(?:\\s+--\\S+)*\\s+${escapeRegExp(dir)}/package\\.json\\s+\\./${escapeRegExp(dir)}/?\\s*$`,
    "m",
  );
  return pattern.test(dockerfile);
}

/**
 * BuildKit reads `<Dockerfile>.dockerignore` INSTEAD of the root
 * `.dockerignore` when it exists (it replaces, not extends).
 */
function ignoreFileFor(dockerfile: string): string {
  const own = `${dockerfile}.dockerignore`;
  return existsSync(join(repoRoot, own)) ? own : ".dockerignore";
}

function globToRegExp(pattern: string): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i] ?? "";
    if (c === "*" && pattern[i + 1] === "*") {
      out += ".*";
      i++;
      if (pattern[i + 1] === "/") i++;
    } else if (c === "*") out += "[^/]*";
    else if (c === "?") out += "[^/]";
    else out += escapeRegExp(c);
  }
  return new RegExp(`^${out}$`);
}

/**
 * Docker's rule: patterns are evaluated in order, a pattern matches a path if
 * it matches the path or any ancestor directory of it, and the last matching
 * pattern wins (`!` re-includes).
 */
function isIgnored(ignoreFile: string, path: string): boolean {
  const parts = path.split("/");
  const candidates = parts.map((_, i) => parts.slice(0, i + 1).join("/"));
  let ignored = false;
  for (const raw of read(ignoreFile).split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const negated = line.startsWith("!");
    const body = (negated ? line.slice(1) : line).replace(/^\/+|\/+$/g, "");
    const re = globToRegExp(body);
    if (candidates.some((candidate) => re.test(candidate))) ignored = !negated;
  }
  return ignored;
}

describe("service Dockerfiles see every workspace member's manifest", () => {
  const workspaces = workspaceDirs();
  const dockerfiles = installingDockerfiles(workspaces);

  it("finds the workspaces and the Dockerfiles it is supposed to check", () => {
    // Guards the derivation itself: a discovery bug that found nothing would
    // otherwise make every assertion below vacuously true.
    expect(workspaces).toEqual(
      expect.arrayContaining([
        "packages/analysis",
        "packages/contracts",
        "services/actors",
        "services/api",
        "services/client",
      ]),
    );
    expect(dockerfiles).toEqual(
      expect.arrayContaining([
        "services/actors/Dockerfile",
        "services/api/Dockerfile",
        "services/client/Dockerfile",
      ]),
    );
  });

  it("every installing Dockerfile COPYs every workspace package.json", () => {
    const missing: string[] = [];
    for (const file of dockerfiles) {
      const text = read(file);
      for (const dir of workspaces) {
        if (EXCLUSIONS[file]?.[dir] !== undefined) continue;
        if (!copiesManifest(text, dir)) {
          missing.push(
            `${file}: no \`COPY ${dir}/package.json ./${dir}/\` — ` +
              "`bun install --frozen-lockfile` will fail with " +
              `"… ${dir} … listed in bun.lock but not on disk"`,
          );
        }
      }
    }
    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("no build context ignores a workspace package.json", () => {
    const hidden: string[] = [];
    for (const file of dockerfiles) {
      const ignoreFile = ignoreFileFor(file);
      for (const dir of workspaces) {
        if (isIgnored(ignoreFile, `${dir}/package.json`)) {
          hidden.push(
            `${ignoreFile} (context of ${file}) excludes ${dir}/package.json — ` +
              `add \`!${dir}/package.json\` after the rule that excludes it`,
          );
        }
      }
    }
    expect(hidden, hidden.join("\n")).toEqual([]);
  });

  it("a dev-only workspace of a --production image declares no dependencies", () => {
    // MEASURED 2026-09-28 (bun 1.4.2): `bun install --production --filter
    // "./services/api..."` does not link a devDependency workspace, but it
    // still resolves that workspace's own `dependencies` into the store. With
    // `typescript` in packages/analysis's `dependencies`, both backend runtime
    // images gained an unlinked node_modules/.bun/typescript@6.0.3 (24 MB)
    // that the pre-analysis tree did not have. A test-only package's imports
    // belong in its devDependencies: a plain or `--filter` install (every CI
    // leg) still links them, and `--production` then drops them entirely.
    const manifests = new Map(
      workspaces.map((dir) => [
        dir,
        JSON.parse(read(`${dir}/package.json`)) as {
          name: string;
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        },
      ]),
    );
    const dirOf = new Map(
      [...manifests].map(([dir, manifest]) => [manifest.name, dir]),
    );
    const workspaceDeps = (deps: Record<string, string> = {}): string[] =>
      Object.keys(deps).flatMap((name) => dirOf.get(name) ?? []);

    const offenders: string[] = [];
    for (const file of dockerfiles) {
      const install =
        /bun install[^\n]*--production[^\n]*--filter "\.\/([^"]+?)\.\.\."/.exec(
          read(file),
        );
      if (!install?.[1]) continue;
      const closure = new Set<string>();
      const queue = [install[1]];
      for (let dir = queue.shift(); dir !== undefined; dir = queue.shift()) {
        if (closure.has(dir)) continue;
        closure.add(dir);
        queue.push(...workspaceDeps(manifests.get(dir)?.dependencies));
      }
      for (const member of closure) {
        for (const dev of workspaceDeps(
          manifests.get(member)?.devDependencies,
        )) {
          if (closure.has(dev)) continue;
          const deps = Object.keys(manifests.get(dev)?.dependencies ?? {});
          if (deps.length > 0) {
            offenders.push(
              `${file}: ${dev} is only a devDependency (of ${member}) but ` +
                `declares dependencies [${deps.join(", ")}] — the --production ` +
                "install puts them in the runtime image; move them to its " +
                "devDependencies",
            );
          }
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("every exclusion names a real Dockerfile and a real workspace", () => {
    const stale: string[] = [];
    for (const [file, dirs] of Object.entries(EXCLUSIONS)) {
      if (!dockerfiles.includes(file)) stale.push(file);
      for (const dir of Object.keys(dirs)) {
        if (!workspaces.includes(dir)) stale.push(`${file} → ${dir}`);
      }
    }
    expect(stale).toEqual([]);
  });

  it("the ignore-file reader agrees with the rules it is checking", () => {
    // Self-test of isIgnored() against the real files: sources the root
    // context deliberately drops really read as ignored, and their re-included
    // manifests really read as kept.
    expect(isIgnored(".dockerignore", "services/client/src/app/page.tsx")).toBe(
      true,
    );
    expect(isIgnored(".dockerignore", "services/client/package.json")).toBe(
      false,
    );
    expect(isIgnored(".dockerignore", "services/api/node_modules/x")).toBe(
      true,
    );
    expect(
      isIgnored(
        "services/client/Dockerfile.dockerignore",
        "services/api/src/index.ts",
      ),
    ).toBe(true);
  });
});
