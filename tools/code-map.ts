// Code map for a stream brief: for each file a stream will change, its owning package, its
// top-level exports with line numbers and signatures, the files that import it across the whole
// workspace, and the tests that do.
//
// tools/slice-briefs.ts calls it for a source's `@map` lines, so the stream starts knowing where
// things are and who calls them. Run it directly before you change what an export does or takes,
// or move it, to list the callers as they stand now:
//
//   node tools/code-map.ts <repo-relative file or directory>…
//
// WHY: in smart-home's Fettle R4 build (2026-10-22), 54% of stream spend went on turns that only
// searched or read, and 75% of those turns came in runs of three or more. Each one re-read about
// 180k tokens of context to learn a line number or a caller. The map answers the questions every
// stream asks first, once, at slicing time. In the 2026-10-22 file splits grep missed three
// callers that came through barrels.
//
// Importers are found in every workspace package (packages/*, services/*) by reading import and
// export-from specifiers: relative ones, the client's `@/` alias (services/client/src/), and
// `@cellar-assistant/<pkg>[/subpath]`, resolved through that package's package.json `exports`
// (or `main`). Re-export barrels are followed: a file that imports a barrel which re-exports the
// target is listed "via" that barrel. That is the case grep misses. The map in a brief is true at
// slicing time, and other streams' merges move it, so a stream re-runs this before it changes an
// export. It does not see a test that reads a source file by path: grep the tests for a moved
// file's old name.
//
// TypeScript is loaded from packages/contracts' dependencies (tools/ is not a workspace and has
// none), so the repo must be installed: `bun install --frozen-lockfile`.
//
// Every export is a pure function over strings; only loadSources(), loadPackages() and the
// main-guard touch the disk.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type TS from "typescript";

/** The repo this file lives in. */
export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const SCOPE = "@cellar-assistant/";
const TS_FROM = "packages/contracts/package.json";

/** TypeScript from the workspace's install, or a clear error. */
export function loadTypescript(root: string = ROOT): typeof TS {
  try {
    return createRequire(join(root, TS_FROM))("typescript") as typeof TS;
  } catch {
    throw new Error(
      `code-map: cannot load typescript through ${TS_FROM}. Run \`bun install --frozen-lockfile\` at the repo root.`,
    );
  }
}

let tsCache: typeof TS | undefined;
const ts = (): typeof TS => {
  tsCache ??= loadTypescript();
  return tsCache;
};

export interface ExportEntry {
  name: string;
  kind: string;
  line: number; // 1-based
  signature: string;
}

export interface Importer {
  file: string;
  via?: string; // the barrel the import goes through
  barrel?: boolean; // it re-exports the target's names rather than using them
}

/** Files the map can read, repo-relative path → text. */
export type Sources = ReadonlyMap<string, string>;

/** A workspace package: its name, repo-relative dir, and subpath → repo-relative file. */
export interface Package {
  name: string;
  dir: string;
  exports: Record<string, string>;
}

const SIGNATURE_MAX = 140;
const IMPORTER_MAX = 12;
const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];
export const TEST_FILE = /\.(test|spec)\.tsx?$/;
export const USAGE =
  "usage: node tools/code-map.ts <repo-relative file or directory>…";

/** The first file target of an exports value: a string, or the types/import/default condition. */
function exportTarget(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    for (const k of ["types", "import", "bun", "node", "default", "require"]) {
      const t = exportTarget(v[k]);
      if (t) return t;
    }
  }
  return null;
}

/** A package from its package.json text and repo-relative dir. */
export function parsePackage(dir: string, text: string): Package | null {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof json.name !== "string") return null;
  const exports: Record<string, string> = {};
  const raw = json.exports;
  const map: Record<string, unknown> =
    typeof raw === "string" ||
    (raw &&
      typeof raw === "object" &&
      !Object.keys(raw).some((k) => k.startsWith(".")))
      ? { ".": raw }
      : ((raw as Record<string, unknown>) ?? {});
  for (const [sub, value] of Object.entries(map)) {
    const t = exportTarget(value);
    if (t) exports[sub] = join(dir, t);
  }
  if (!exports["."] && typeof json.main === "string")
    exports["."] = join(dir, json.main);
  return { name: json.name, dir, exports };
}

/** The file a `@cellar-assistant/<pkg>[/subpath]` specifier names, through `exports`. */
function resolvePackage(
  spec: string,
  packages: readonly Package[],
): string | null {
  const pkg = packages
    .filter((p) => spec === p.name || spec.startsWith(`${p.name}/`))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (!pkg) return null;
  const sub = `.${spec.slice(pkg.name.length)}`;
  if (pkg.exports[sub]) return pkg.exports[sub];
  for (const [pattern, target] of Object.entries(pkg.exports)) {
    const star = pattern.indexOf("*");
    if (star < 0) continue;
    const head = pattern.slice(0, star);
    const tail = pattern.slice(star + 1);
    if (
      sub.startsWith(head) &&
      sub.endsWith(tail) &&
      sub.length >= head.length + tail.length
    )
      return target.replace(
        "*",
        sub.slice(head.length, sub.length - tail.length),
      );
  }
  return null;
}

/** The package whose dir holds a repo-relative file. */
export function ownerOf(
  file: string,
  packages: readonly Package[],
): Package | null {
  return (
    packages
      .filter((p) => file.startsWith(`${p.dir}/`))
      .sort((a, b) => b.dir.length - a.dir.length)[0] ?? null
  );
}

function hasExport(node: TS.Node): boolean {
  const t = ts();
  return (
    t.canHaveModifiers(node) &&
    (t.getModifiers(node) ?? []).some(
      (m) => m.kind === t.SyntaxKind.ExportKeyword,
    )
  );
}

/** The declaration's head: its first line, without a body, cut to a readable length. */
function signatureOf(text: string): string {
  let head = text.split("\n")[0].trim();
  head = head.replace(/\s*\{\s*$/, "").replace(/^export\s+(default\s+)?/, "");
  return head.length > SIGNATURE_MAX
    ? `${head.slice(0, SIGNATURE_MAX - 1)}…`
    : head;
}

/** Top-level exported declarations, in file order. */
export function exportsOf(path: string, text: string): ExportEntry[] {
  const t = ts();
  const file = t.createSourceFile(
    path,
    text,
    t.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? t.ScriptKind.TSX : t.ScriptKind.TS,
  );
  const out: ExportEntry[] = [];
  const lineOf = (node: TS.Node) =>
    file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  for (const node of file.statements) {
    if (t.isExportDeclaration(node) || t.isExportAssignment(node)) {
      out.push({
        name: t.isExportAssignment(node) ? "default" : "*",
        kind: "re-export",
        line: lineOf(node),
        signature: signatureOf(node.getText(file)),
      });
      continue;
    }
    if (!hasExport(node)) continue;
    const sig = signatureOf(node.getText(file));
    if (t.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        out.push({
          name: d.name.getText(file),
          kind: "const",
          line: lineOf(node),
          signature: sig,
        });
      }
      continue;
    }
    const named = node as TS.DeclarationStatement;
    const kind = t.isFunctionDeclaration(node)
      ? "function"
      : t.isClassDeclaration(node)
        ? "class"
        : t.isInterfaceDeclaration(node)
          ? "interface"
          : t.isTypeAliasDeclaration(node)
            ? "type"
            : t.isEnumDeclaration(node)
              ? "enum"
              : "declaration";
    out.push({
      name: named.name?.getText(file) ?? "default",
      kind,
      line: lineOf(node),
      signature: sig,
    });
  }
  return out;
}

/** The names an import or re-export carries: a list, or "*" for all of them. For a re-export each
 *  pair is [name in the source module, name it is exported as]. */
export interface Specifier {
  spec: string;
  reexport: boolean;
  names: "*" | [string, string][];
}

function namedList(braces: string): [string, string][] {
  return braces
    .split(",")
    .map((part) => part.trim().replace(/^type\s+/, ""))
    .filter(Boolean)
    .map((part) => {
      const [from, as] = part.split(/\s+as\s+/);
      return [from.trim(), (as ?? from).trim()];
    });
}

/** Module specifiers a file imports or re-exports from, static and dynamic, with their names. */
export function specifiersOf(text: string): Specifier[] {
  const out: Specifier[] = [];
  for (const m of text.matchAll(
    /^\s*(import|export)\s+(?:type\s+)?([^;'"]*?)\s*\bfrom\s*["']([^"']+)["']/gms,
  )) {
    const [, verb, clause, spec] = m;
    const reexport = verb === "export";
    if (/^\*/.test(clause) || (!reexport && /\*\s+as\b/.test(clause))) {
      out.push({ spec, reexport, names: "*" });
      continue;
    }
    const names: [string, string][] = [];
    const braces = /\{([^}]*)\}/.exec(clause);
    if (braces) names.push(...namedList(braces[1]));
    const lead = clause
      .replace(/\{[^}]*\}/, "")
      .replace(/,/g, " ")
      .trim();
    if (!reexport && lead) names.push(["default", lead]);
    out.push({ spec, reexport, names });
  }
  for (const m of text.matchAll(/^\s*import\s*["']([^"']+)["']/gm))
    out.push({ spec: m[1], reexport: false, names: [] });
  for (const m of text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g))
    out.push({ spec: m[1], reexport: false, names: "*" });
  return out;
}

/** The repo-relative file a specifier names, or null for a third-party package or a file not
 *  in `sources`. */
export function resolveSpecifier(
  from: string,
  spec: string,
  sources: Sources,
  packages: readonly Package[] = [],
): string | null {
  let base: string | null;
  if (spec.startsWith("@/")) {
    const owner = ownerOf(from, packages);
    base = join(owner?.dir ?? "services/client", "src", spec.slice(2));
  } else if (spec.startsWith(".")) base = join(dirname(from), spec);
  else if (spec.startsWith(SCOPE)) base = resolvePackage(spec, packages);
  else return null;
  if (base === null) return null;
  if (sources.has(base)) return base;
  base = base.replace(/\.(js|jsx|mjs|ts|tsx)$/, "");
  if (sources.has(base)) return base;
  for (const ext of EXTENSIONS) if (sources.has(base + ext)) return base + ext;
  return null;
}

export interface Edge {
  file: string;
  reexport: boolean;
  names: Specifier["names"];
}

/** For every file, the edges of the files that import or re-export from it. */
export function importGraph(
  sources: Sources,
  packages: readonly Package[] = [],
): Map<string, Edge[]> {
  const graph = new Map<string, Edge[]>();
  for (const [file, text] of sources) {
    for (const { spec, reexport, names } of specifiersOf(text)) {
      const target = resolveSpecifier(file, spec, sources, packages);
      if (!target || target === file) continue;
      const list = graph.get(target) ?? [];
      list.push({ file, reexport, names });
      graph.set(target, list);
    }
  }
  return graph;
}

/** Who uses `target`: files that import it, and files that import one of its names through a
 *  barrel that re-exports it, up to three barrels deep. `exported` is the target's own names. */
export function importersOf(
  target: string,
  exported: readonly string[],
  graph: Map<string, Edge[]>,
): Importer[] {
  const out = new Map<string, Importer>();
  const walk = (
    file: string,
    visible: ReadonlySet<string>,
    via: string | undefined,
    depth: number,
  ) => {
    for (const edge of graph.get(file) ?? []) {
      if (edge.file === target) continue;
      if (edge.reexport) {
        if (depth >= 3) continue;
        const passed =
          edge.names === "*"
            ? new Set([...visible].filter((n) => n !== "default"))
            : new Set(
                edge.names
                  .filter(([from]) => visible.has(from))
                  .map(([, as]) => as),
              );
        if (passed.size === 0) continue;
        if (!out.has(edge.file))
          out.set(edge.file, {
            file: edge.file,
            barrel: true,
            ...(via ? { via } : {}),
          });
        walk(edge.file, passed, via ?? edge.file, depth + 1);
        continue;
      }
      const uses =
        edge.names === "*" ||
        (via === undefined && edge.names.length === 0) ||
        edge.names.some(([from]) => visible.has(from));
      if (uses && !out.has(edge.file))
        out.set(
          edge.file,
          via ? { file: edge.file, via } : { file: edge.file },
        );
    }
  };
  walk(target, new Set(exported), undefined, 0);
  return [...out.values()].sort((a, b) => a.file.localeCompare(b.file));
}

/** The markdown for one file's entry. */
export function renderEntry(
  path: string,
  text: string,
  importers: Importer[],
  max = IMPORTER_MAX,
  owner: string | null = null,
): string {
  const lines = text.split("\n").length;
  const out = [
    `### \`${path}\` · ${lines} lines${owner ? ` · ${owner}` : ""}`,
    "",
  ];
  const exports = exportsOf(path, text);
  if (exports.length === 0) out.push("No exports.");
  for (const e of exports)
    out.push(
      `- L${e.line} ${e.kind === "const" || e.kind === "re-export" ? "" : `${e.kind} `}\`${e.signature}\``,
    );
  const tests = importers.filter((i) => TEST_FILE.test(i.file));
  const barrels = importers.filter((i) => i.barrel);
  const code = importers.filter((i) => !i.barrel && !TEST_FILE.test(i.file));
  const name = (i: Importer) =>
    `\`${i.file}\`${i.via ? ` (via \`${i.via}\`)` : ""}`;
  const list = (items: Importer[]) =>
    items.length <= max
      ? items.map(name).join(", ")
      : `${items.slice(0, max).map(name).join(", ")}, and ${items.length - max} more`;
  out.push(
    "",
    `**Imported by (${code.length}):** ${code.length ? list(code) : "nothing"}`,
  );
  if (barrels.length) out.push(`**Re-exported by:** ${list(barrels)}`);
  if (tests.length) out.push(`**Tests (${tests.length}):** ${list(tests)}`);
  return out.join("\n");
}

/** The files a `@map` path names: the file itself, or every non-test .ts/.tsx under a directory. */
export function expandPaths(
  paths: readonly string[],
  sources: Sources,
): string[] {
  const out: string[] = [];
  for (const raw of paths) {
    const p = join(raw).replace(/\/$/, "");
    if (sources.has(p)) {
      out.push(p);
      continue;
    }
    const under = [...sources.keys()]
      .filter((f) => f.startsWith(`${p}/`) && !TEST_FILE.test(f))
      .sort();
    if (under.length === 0)
      throw new Error(
        `@map: ${raw} is no file or directory in a workspace package`,
      );
    out.push(...under);
  }
  return [...new Set(out)];
}

/** The whole map section for a brief. */
export function renderMap(
  paths: readonly string[],
  sources: Sources,
  packages: readonly Package[] = [],
  max = IMPORTER_MAX,
): string {
  const files = expandPaths(paths, sources);
  if (files.length > 25)
    throw new Error(
      `@map names ${files.length} files; map the ones the stream changes, at most 25`,
    );
  const graph = importGraph(sources, packages);
  return files
    .map((f) => {
      const text = sources.get(f) ?? "";
      const names = exportsOf(f, text).map((e) => e.name);
      return renderEntry(
        f,
        text,
        importersOf(f, names, graph),
        max,
        ownerOf(f, packages)?.name ?? null,
      );
    })
    .join("\n\n");
}

const SKIP = new Set([
  "node_modules",
  "coverage",
  "dist",
  "build",
  "artifacts",
]);
const WORKSPACES = ["packages", "services"];

/** The workspace packages under `root`. */
export function loadPackages(root: string = ROOT): Package[] {
  const out: Package[] = [];
  for (const top of WORKSPACES) {
    const dir = join(root, top);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      const json = join(dir, name, "package.json");
      if (!existsSync(json)) continue;
      const pkg = parsePackage(join(top, name), readFileSync(json, "utf8"));
      if (pkg) out.push(pkg);
    }
  }
  return out;
}

/** Every .ts/.tsx file in the workspace packages under `root`, repo-relative path → text. */
export function loadSources(root: string = ROOT): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (SKIP.has(name) || name.startsWith(".")) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name) && !name.endsWith(".d.ts"))
        out.set(relative(root, full), readFileSync(full, "utf8"));
    }
  };
  for (const top of WORKSPACES)
    if (existsSync(join(root, top))) walk(join(root, top));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const paths = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  if (paths.length === 0 || process.argv.includes("--help")) {
    console.error(USAGE);
    process.exit(paths.length === 0 ? 2 : 0);
  }
  try {
    console.log(renderMap(paths, loadSources(), loadPackages(), Infinity));
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
