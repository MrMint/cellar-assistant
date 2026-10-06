/**
 * Every file outside services/client that the client's source reaches is in
 * the client image's build context and `COPY`'d into it — and reached through
 * a declared workspace dependency, and safe to put in a browser bundle.
 *
 * The client reaches out of its own tree through its workspace dependencies:
 * `@cellar-assistant/schema` for gql.tada, and `@cellar-assistant/contracts`
 * for `displayBarcode` (`src/lib/items/barcode.ts`). Nothing but a real
 * `docker build` would otherwise notice that the image does not carry one of
 * those files: typecheck and every suite run on the host, where the whole
 * repository is on disk, and `Dockerfile.dockerignore` excludes backend source
 * by default. `next build` type-checks what it bundles, so the requirement is
 * the **`tsc` closure** — `import type` included — not just the runtime
 * imports.
 *
 * Three more things hold for that closure, each a way the one import this
 * started from (`92166d02`, by relative path, before contracts was a
 * dependency) could come back wrong:
 *
 *  - client source leaves services/client only by package name, never by a
 *    relative path — a path skips the dependency declaration, and with it
 *    bun's link and turbo's task ordering;
 *  - every workspace package it names is in its `dependencies`;
 *  - nothing it reaches at runtime outside its tree imports a `node:` builtin.
 *    Contracts' package root is a barrel that reaches `search.ts`, which
 *    imports `node:crypto`; a client module importing the root instead of a
 *    subpath would put that in the browser bundle.
 *
 * Test files are left out on both sides: `tsconfig.json` excludes them, and so
 * does the image.
 *
 *   bun run --filter @cellar-assistant/client test
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
const clientDir = join(repoRoot, "services/client");
const rel = (path: string): string =>
  relative(repoRoot, path).split("\\").join("/");

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

type Specifier = { readonly spec: string; readonly typeOnly: boolean };

/**
 * Every `import`/`export … from` and bare `import "…"`, with whether it is
 * erased (`import type` / `export type`). A mixed `import { type A, b }` counts
 * as runtime: it is, for `b`.
 */
const specifiers = (source: string): Specifier[] => {
  const out: Specifier[] = [];
  const re =
    /(?:^|\n)\s*(import|export)(\s+type)?\b(?:[^;]*?\bfrom)?\s*["']([^"']+)["']/g;
  for (;;) {
    const match = re.exec(source);
    if (match === null) return out;
    out.push({ spec: match[3] ?? "", typeOnly: match[2] !== undefined });
  }
};

const resolveFile = (base: string): string | null => {
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
};

type Manifest = {
  readonly name?: string;
  readonly exports?: Readonly<Record<string, unknown>>;
  readonly dependencies?: Readonly<Record<string, string>>;
};

const manifestAt = (dir: string): Manifest =>
  JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as Manifest;

/** Workspace package name → its directory, for `services/*` and `packages/*`. */
const workspaces = (): ReadonlyMap<string, string> => {
  const byName = new Map<string, string>();
  for (const parent of ["services", "packages"]) {
    for (const entry of readdirSync(join(repoRoot, parent))) {
      const dir = join(repoRoot, parent, entry);
      if (!existsSync(join(dir, "package.json"))) continue;
      const { name } = manifestAt(dir);
      if (name !== undefined) byName.set(name, dir);
    }
  }
  return byName;
};

/**
 * The file a specifier names, if it is repository source: a relative path, or
 * a workspace package resolved through its own `exports` map. A package from
 * the registry is `null` — it arrives in the image by `bun install`, not by a
 * `COPY`. A workspace specifier that does not resolve throws: a scan that
 * skipped it would pass by not looking.
 */
const resolveSpecifier = (
  packages: ReadonlyMap<string, string>,
  fromFile: string,
  spec: string,
): string | null => {
  if (spec.startsWith("."))
    return resolveFile(resolve(dirname(fromFile), spec));
  const name = [...packages.keys()].find(
    (candidate) => spec === candidate || spec.startsWith(`${candidate}/`),
  );
  if (name === undefined) return null;
  const dir = packages.get(name) ?? "";
  const subpath = `.${spec.slice(name.length)}`;
  const target = manifestAt(dir).exports?.[subpath];
  const file =
    typeof target === "string" ? resolveFile(resolve(dir, target)) : null;
  if (file === null) {
    throw new Error(
      `${rel(fromFile)} imports ${spec}, which ${name}'s exports do not resolve`,
    );
  }
  return file;
};

type Edge = {
  readonly from: string;
  readonly spec: string;
  readonly to: string;
};

type Closure = {
  /** Repo-relative files outside services/client that client source reaches. */
  readonly files: readonly string[];
  /** …of which reached through at least one runtime (not type-only) import. */
  readonly runtime: readonly string[];
  /** Client source files importing out of services/client by relative path. */
  readonly byPath: readonly Edge[];
  /** Workspace packages client source names, by package name. */
  readonly packagesNamed: readonly string[];
};

const closureOf = (): Closure => {
  const packages = workspaces();
  const named = new Set<string>();
  const byPath: Edge[] = [];
  const queue: { file: string; runtime: boolean }[] = [];
  for (const file of walk(join(clientDir, "src"))) {
    for (const { spec, typeOnly } of specifiers(readFileSync(file, "utf8"))) {
      const target = resolveSpecifier(packages, file, spec);
      if (target === null || target.startsWith(clientDir)) continue;
      if (spec.startsWith(".")) {
        byPath.push({ from: rel(file), spec, to: rel(target) });
      } else {
        named.add(spec.split("/").slice(0, 2).join("/"));
      }
      queue.push({ file: target, runtime: !typeOnly });
    }
  }
  const seen = new Map<string, boolean>();
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    const { file, runtime } = next;
    const before = seen.get(file);
    if (before === true || (before === false && !runtime)) continue;
    seen.set(file, runtime);
    for (const { spec, typeOnly } of specifiers(readFileSync(file, "utf8"))) {
      const target = resolveSpecifier(packages, file, spec);
      if (target !== null) {
        queue.push({ file: target, runtime: runtime && !typeOnly });
      }
    }
  }
  return {
    files: [...seen.keys()].map(rel).sort(),
    runtime: [...seen]
      .filter(([, runtime]) => runtime)
      .map(([file]) => rel(file))
      .sort(),
    byPath,
    packagesNamed: [...named].sort(),
  };
};

/** Sources of the build stage's plain `COPY <src> <dest>` lines. */
const copySources = (dockerfile: string): string[] =>
  dockerfile
    .split("\n")
    .map((line) => /^COPY\s+(?!--from)(\S+)\s+\S+\s*$/.exec(line.trim()))
    .flatMap((match) => (match?.[1] === undefined ? [] : [match[1]]))
    .map((source) => source.replace(/^\.\//, "").replace(/\/+$/, ""));

const globToRegExp = (glob: string): RegExp => {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob.charAt(i);
    if (char === "*" && glob.charAt(i + 1) === "*") {
      out += ".*";
      i++;
      if (glob.charAt(i + 1) === "/") i++;
    } else if (char === "*") out += "[^/]*";
    else if (char === "?") out += "[^/]";
    else out += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
};

/**
 * Docker's rule: the last matching pattern wins, and a pattern that matches a
 * directory matches everything under it.
 */
const isIgnored = (ignoreFile: string, path: string): boolean => {
  const parents = path
    .split("/")
    .map((_, i, parts) => parts.slice(0, i + 1).join("/"));
  let ignored = false;
  for (const raw of ignoreFile.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const negated = line.startsWith("!");
    const re = globToRegExp(
      (negated ? line.slice(1) : line).replace(/^\/+|\/+$/g, ""),
    );
    if (parents.some((candidate) => re.test(candidate))) ignored = !negated;
  }
  return ignored;
};

describe("the client image carries what client source reaches outside its tree", () => {
  const closure = closureOf();
  const dockerfile = readFileSync(join(clientDir, "Dockerfile"), "utf8");
  const ignore = readFileSync(
    join(clientDir, "Dockerfile.dockerignore"),
    "utf8",
  );

  test("the scan follows both workspace packages into their sources", () => {
    // Guards the derivation: a scan that resolved nothing passes vacuously.
    assert.ok(
      closure.files.includes("packages/contracts/src/barcodes.ts"),
      `closure was: ${closure.files.join(", ") || "(empty)"}`,
    );
    // barcodes.ts' `import type` closure — what `next build` type-checks.
    assert.ok(closure.files.includes("packages/contracts/src/items.ts"));
    assert.ok(closure.files.includes("packages/schema/src/index.ts"));
    assert.ok(closure.files.includes("packages/schema/graphql-env.d.ts"));
    // …and it tells runtime from type-only: barcodes.ts is bundled, the
    // modules it only names types from are not.
    assert.ok(closure.runtime.includes("packages/contracts/src/barcodes.ts"));
    assert.ok(!closure.runtime.includes("packages/contracts/src/items.ts"));
  });

  test("the specifier reader tells erased imports from bundled ones", () => {
    assert.deepEqual(
      specifiers(
        [
          'import type { A } from "./a.ts";',
          'import { type B, c } from "./b.ts";',
          'export type { D } from "./d.ts";',
          'export { e } from "@cellar-assistant/contracts";',
          'import "./side-effect.ts";',
        ].join("\n"),
      ),
      [
        { spec: "./a.ts", typeOnly: true },
        { spec: "./b.ts", typeOnly: false },
        { spec: "./d.ts", typeOnly: true },
        { spec: "@cellar-assistant/contracts", typeOnly: false },
        { spec: "./side-effect.ts", typeOnly: false },
      ],
    );
  });

  test("the ignore-file reader agrees with rules it can check", () => {
    assert.equal(isIgnored(ignore, "services/api/src/index.ts"), true);
    assert.equal(isIgnored(ignore, "packages/contracts/package.json"), false);
    assert.equal(isIgnored(ignore, "packages/db/src/schema/tables.ts"), true);
    assert.equal(
      isIgnored(ignore, "packages/contracts/src/barcodes.test.ts"),
      true,
    );
  });

  test("every such file is in the build context", () => {
    const hidden = closure.files.filter((file) => isIgnored(ignore, file));
    assert.deepEqual(
      hidden,
      [],
      `services/client/Dockerfile.dockerignore excludes files client source
reaches — \`next build\` in the image will fail to resolve them:
${hidden.join("\n")}`,
    );
  });

  test("every such file is COPY'd into the build stage", () => {
    const sources = copySources(dockerfile);
    const uncopied = closure.files.filter(
      (file) =>
        !sources.some(
          (source) => file === source || file.startsWith(`${source}/`),
        ),
    );
    assert.deepEqual(
      uncopied,
      [],
      `services/client/Dockerfile has no COPY for files client source reaches:
${uncopied.join("\n")}`,
    );
  });

  test("client source leaves its tree by package name, never by path", () => {
    assert.deepEqual(
      closure.byPath.map((edge) => `${edge.from}: ${edge.spec}`),
      [],
      "Import another workspace package by its name (add it to " +
        "services/client/package.json's dependencies), not by a relative " +
        "path: a path skips the dependency declaration, bun's link and " +
        "turbo's task ordering.",
    );
  });

  test("every workspace package client source names is a declared dependency", () => {
    const declared = Object.keys(manifestAt(clientDir).dependencies ?? {});
    assert.ok(closure.packagesNamed.length > 0);
    assert.deepEqual(
      closure.packagesNamed.filter((name) => !declared.includes(name)),
      [],
    );
  });

  test("nothing it bundles from outside its tree imports a node: builtin", () => {
    const offenders = closure.runtime.flatMap((file) =>
      specifiers(readFileSync(join(repoRoot, file), "utf8"))
        .filter(({ spec, typeOnly }) => !typeOnly && spec.startsWith("node:"))
        .map(({ spec }) => `${file}: ${spec}`),
    );
    assert.deepEqual(
      offenders,
      [],
      "A client module reaches a workspace module that imports a Node " +
        "builtin — usually by importing a package root (a barrel) instead of " +
        "the subpath it needs. Import the subpath.",
    );
  });
});
