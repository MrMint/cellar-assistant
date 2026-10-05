/**
 * A static scan of the React server/client boundary.
 *
 * Turbopack compiles every export of a `"use client"` module into a **client
 * reference**, and React refuses to serialise a function into a client
 * component's props. Both rules are invisible to `tsc` — the types are correct,
 * the *runtime boundary* is not — and both fail in ways that do not name the
 * frontend at all. Hence a scan, not a lint rule waiting to be written.
 *
 * It reads files and nothing else: no browser, no dev server, no Docker, no
 * database. `src/lib/dev-checks/client-boundary.test.ts` runs it under
 * `node --test` in a few hundred milliseconds.
 *
 * ## Rule 1 — a server module reading a value out of a `"use client"` module
 *
 * The import does not give you the value; it gives you the stub. Two shapes of
 * breakage follow, and the second is the dangerous one:
 *
 *  - **Loud.** `cellarRole(...)` is *called*, the stub throws, the route 500s.
 *  - **Silent.** `CELLARS_PAGE_SIZE` is only *passed*, as a GraphQL variable.
 *    `JSON.stringify` drops function-valued keys, so the variable vanishes from
 *    the request body and the server answers *`Variable "$first" of required
 *    type "Int!" was not provided`*. Nothing in the frontend mentions page
 *    size; the error names a GraphQL variable.
 *
 * The fix is **not** to make the constant a component: move the shared value
 * into a module with no `"use client"` directive and import it from both sides.
 *
 * ## Rule 2 — a server module passing a function as a prop
 *
 * `<Typography component={NextLink}>` inside a server component throws
 * *"Functions cannot be passed directly to Client Components"* at render. The
 * fix is a `"use client"` wrapper that binds the two together on the client
 * side — `src/components/common/Link.tsx` is exactly that for `next/link`.
 *
 * ### What rule 2 can and cannot see
 *
 * It flags a **bare identifier** passed as a JSX prop when that identifier is
 * certainly a function: a component-shaped import (`NextLink`, `MdHome`), or a
 * function or arrow declared in the same module. Those are decidable by reading
 * one file.
 *
 * It deliberately does **not** try to decide whether the receiving element is a
 * client component. That would mean resolving `@mui/joy`'s `"use client"`
 * directive through `node_modules` and following every re-export — expensive,
 * and wrong the moment a dependency is hoisted differently. Instead it judges
 * the *value* side, where a false positive is only possible for a server
 * component passing a component to another server component, which this
 * codebase does not do (and which `ALLOWED_FUNCTION_PROPS` below can exempt if
 * it ever does).
 *
 * Three things it genuinely misses, stated plainly rather than papered over:
 *
 *  - an inline arrow, `onClick={() => …}` — a regex cannot tell a prop's arrow
 *    from the `(x) => …` inside a neighbouring `.map()`, and an AST parse is
 *    more machinery than this check is worth;
 *  - a function reached through a member or call expression,
 *    `handlers.onSave` / `makeHandler()`;
 *  - a spread, `{...props}`, which can carry anything.
 *
 * Rule 2 catches the shape that actually shipped ten times in `src/app`. It is
 * not a proof of serialisability.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** The repo root, derived from this file rather than from `process.cwd()`. */
export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

export type Finding = {
  /** Repo-relative, forward-slashed. */
  readonly file: string;
  readonly message: string;
};

export type ScanResult = {
  readonly valueImports: readonly Finding[];
  readonly functionProps: readonly Finding[];
  /** So that "found nothing" can be told apart from "walked nothing". */
  readonly counts: {
    readonly files: number;
    readonly clientModules: number;
    readonly serverModulesJudged: number;
  };
};

/**
 * Props whose function value is legitimate on the server. Empty today; kept so
 * that a real exemption is a one-line, reviewable change rather than a reason
 * to delete the rule.
 */
const ALLOWED_FUNCTION_PROPS = new Set<string>();

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
      out.push(path);
  }
  return out;
};

/**
 * `"use client"` must be the first statement, but comments may precede it — and
 * several modules here open with a long doc comment. Strip leading whitespace
 * and comments, then look at what is actually first.
 */
export const hasUseClientDirective = (source: string): boolean => {
  let rest = source;
  for (;;) {
    const trimmed = rest.replace(/^\s+/, "");
    if (trimmed.startsWith("//")) {
      rest = trimmed.slice(trimmed.indexOf("\n") + 1);
      continue;
    }
    if (trimmed.startsWith("/*")) {
      const end = trimmed.indexOf("*/");
      if (end === -1) return false;
      rest = trimmed.slice(end + 2);
      continue;
    }
    return /^["']use client["']/.test(trimmed);
  }
};

const resolveImport = (
  fromFile: string,
  spec: string,
  srcDir: string,
): string | null => {
  let base: string;
  if (spec.startsWith("@/")) base = join(srcDir, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // a package, not ours
  base = base.replace(/\.(tsx?|jsx?)$/, "");
  for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    if (existsSync(base + ext)) return base + ext;
  }
  return null;
};

/**
 * Every match of a `/g` regex, as an array.
 *
 * An `exec` loop rather than `matchAll` because this repo's shared tsconfig
 * targets ES5, where iterating an iterator needs `downlevelIteration`; and the
 * result is materialised rather than yielded so that callers need no
 * assignment-in-condition, which biome's `noAssignInExpressions` rejects.
 */
const allMatches = (source: string, pattern: RegExp): RegExpExecArray[] => {
  const re = new RegExp(pattern.source, pattern.flags);
  const out: RegExpExecArray[] = [];
  for (;;) {
    const match = re.exec(source);
    if (match === null) return out;
    out.push(match);
  }
};

type Import = {
  readonly names: readonly string[];
  readonly spec: string;
  readonly typeOnly: boolean;
};

/**
 * Every `import` in a module, with its bound names. Covers default, namespace
 * and named forms; drops `import type` and inline `type` specifiers, which are
 * erased before the boundary exists.
 */
const parseImports = (source: string): Import[] => {
  const imports: Import[] = [];
  const matches = allMatches(
    source,
    /import\s+(type\s+)?([^;'"]*?)\s*from\s*["']([^"']+)["']/g,
  );
  for (const match of matches) {
    const typeOnly = match[1] !== undefined;
    const clause = match[2];
    const spec = match[3];
    const names: string[] = [];

    const braced = /\{([^}]*)\}/.exec(clause);
    if (braced !== null) {
      for (const raw of braced[1].split(",")) {
        const specifier = raw.trim();
        if (specifier === "" || /^type\s/.test(specifier)) continue;
        const aliased = specifier.split(/\s+as\s+/);
        names.push((aliased[1] ?? aliased[0]).trim());
      }
    }
    // Default and namespace bindings sit outside the braces.
    const outside = clause.replace(/\{[^}]*\}/, "").replace(/,/g, " ");
    for (const token of outside.split(/\s+/)) {
      const bare = token.trim();
      if (bare === "" || bare === "*" || bare === "as") continue;
      if (/^[A-Za-z_$][\w$]*$/.test(bare)) names.push(bare);
    }
    imports.push({ names, spec, typeOnly });
  }
  return imports;
};

/** `NextLink`, `MdHome` — PascalCase, so a component by convention. */
const isComponentShaped = (name: string): boolean =>
  /^[A-Z][A-Za-z0-9]*$/.test(name) && /[a-z]/.test(name);

/** Functions and arrows declared at any depth in this module. */
const localFunctionNames = (source: string): Set<string> => {
  const names = new Set<string>();
  const patterns = [
    /\bfunction\s+([A-Za-z_$][\w$]*)/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]+)?=>/g,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of allMatches(source, pattern)) names.add(match[1]);
  }
  return names;
};

/**
 * Scan `src` for both rules.
 *
 * @param repoRoot defaults to the repo this file lives in, so the scan is
 *   independent of the working directory `node --test` was launched from.
 */
export const scanClientBoundary = (
  repoRoot: string = REPO_ROOT,
): ScanResult => {
  const srcDir = join(repoRoot, "src");
  const appPrefix = `${join("src", "app")}${sep}`;
  const files = walk(srcDir);

  const clientModule = new Map<string, boolean>();
  const sources = new Map<string, string>();
  let clientModules = 0;
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    sources.set(file, source);
    const isClient = hasUseClientDirective(source);
    if (isClient) clientModules += 1;
    clientModule.set(file, isClient);
  }

  const label = (file: string) => relative(repoRoot, file).split(sep).join("/");

  const valueImports: Finding[] = [];
  const functionProps: Finding[] = [];
  let serverModulesJudged = 0;

  for (const file of files) {
    // A client module may import anything from another client module, and may
    // pass functions to its children — it is all one client graph.
    if (clientModule.get(file) === true) continue;
    // Server *components* live under `src/app`. A plain library module under
    // `src/lib` is imported by whichever side needs it and is judged there.
    if (!file.includes(appPrefix)) continue;
    serverModulesJudged += 1;

    const source = sources.get(file) as string;
    const imports = parseImports(source);

    // ---- Rule 1: a value read across the boundary ----
    for (const entry of imports) {
      if (entry.typeOnly) continue;
      const target = resolveImport(file, entry.spec, srcDir);
      if (target === null || clientModule.get(target) !== true) continue;
      // Rendering `<Name />` is the one legal way to consume a client export
      // from the server. Anything else is a value read.
      const reads = entry.names.filter(
        (name) => !new RegExp(`<${name}[\\s/>]`).test(source),
      );
      if (reads.length > 0) {
        valueImports.push({
          file: label(file),
          message: `${reads.join(", ")} from "${entry.spec}"`,
        });
      }
    }

    // ---- Rule 2: a function passed as a prop ----
    const importedNames = new Map<string, string>();
    for (const entry of imports) {
      if (entry.typeOnly) continue;
      for (const name of entry.names) importedNames.set(name, entry.spec);
    }
    const locals = localFunctionNames(source);

    const propMatches = allMatches(
      source,
      /\s([a-zA-Z][\w]*)=\{\s*([A-Za-z_$][\w$]*)\s*\}/g,
    );
    for (const m of propMatches) {
      const prop = m[1];
      const value = m[2];
      if (ALLOWED_FUNCTION_PROPS.has(prop)) continue;
      const from = importedNames.get(value);
      const isFunction =
        (from !== undefined && isComponentShaped(value)) || locals.has(value);
      if (!isFunction) continue;
      const line = source.slice(0, m.index).split("\n").length;
      functionProps.push({
        file: `${label(file)}:${line}`,
        message:
          from !== undefined
            ? `${prop}={${value}} — ${value} is a component imported from "${from}"`
            : `${prop}={${value}} — ${value} is a function declared in this module`,
      });
    }
  }

  return {
    valueImports,
    functionProps,
    counts: { files: files.length, clientModules, serverModulesJudged },
  };
};

/** One line per finding, for a test failure message or a CLI run. */
export const formatFindings = (findings: readonly Finding[]): string =>
  findings.map((f) => `  ${f.file}: ${f.message}`).join("\n");
