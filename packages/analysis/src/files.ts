/**
 * Which files a scan judges — decided once, here.
 *
 * Every scan used to carry its own `readdirSync` walk and its own idea of what
 * a test file is (three spellings of `isTestFile` existed at once). The rule
 * is the same everywhere: production source only. Tests, the test harnesses
 * (`*testing.ts`), generated files, declaration files and `node_modules` are
 * not judged.
 */
import { relative, resolve, sep } from "node:path";
import ts from "typescript";
import type { Project } from "./project.ts";

/** TypeScript's own spelling of a path: absolute and `/`-separated. */
export const normalizePath = (path: string): string =>
  resolve(path).split(sep).join("/");

/** `*.test.ts`, `*.spec.ts`. */
export const isSpecPath = (path: string): boolean =>
  /\.(test|spec)\.[cm]?tsx?$/.test(path);

/** A test harness — `testing.ts`, `*-testing.ts`: fixtures, imported only by tests. */
export const isHarnessPath = (path: string): boolean =>
  /testing\.[cm]?tsx?$/.test(path);

/** Either of the two. */
export const isTestPath = (path: string): boolean =>
  isSpecPath(path) || isHarnessPath(path);

/** Written by a tool, not a person: `*.generated.ts`, `graphql-env.d.ts`. */
export const isGeneratedPath = (path: string): boolean =>
  /\.generated\.[cm]?tsx?$/.test(path) || path.endsWith("graphql-env.d.ts");

/** The standard exclusions, as a predicate over an absolute path. */
export const isExcludedPath = (path: string): boolean =>
  path.includes("/node_modules/") ||
  path.endsWith(".d.ts") ||
  isTestPath(path) ||
  isGeneratedPath(path);

/** `file` relative to `root`, `/`-separated. */
export const relativePath = (root: string, file: string): string =>
  normalizePath(file) === normalizePath(root)
    ? ""
    : relative(root, file).split(sep).join("/");

export type SourceFileQuery = {
  /**
   * Only files under these directories (absolute). Defaults to the project's
   * root.
   */
  readonly under?: string | readonly string[];
  /** Judge test files (and harnesses) too. Off by default. */
  readonly includeTests?: boolean;
  /**
   * Judge the harnesses (`*testing.ts`) but not the tests. For a rule a
   * harness could break as well as production code can.
   */
  readonly includeHarness?: boolean;
  /** A further, scan-specific exclusion over the path relative to the root. */
  readonly exclude?: (relative: string) => boolean;
};

/**
 * The program's own source files a scan should judge, sorted by path.
 * Only files the program loaded are candidates, which for a project loaded
 * from a tsconfig is every file its `include` names.
 */
export const sourceFiles = (
  project: Project,
  query: SourceFileQuery = {},
): ts.SourceFile[] => {
  const unders = (
    query.under === undefined
      ? [project.root]
      : typeof query.under === "string"
        ? [query.under]
        : query.under
  ).map((dir) => `${normalizePath(dir)}/`);
  return project.program
    .getSourceFiles()
    .filter((file) => {
      const path = file.fileName;
      if (file.isDeclarationFile) return false;
      if (project.program.isSourceFileFromExternalLibrary(file)) return false;
      if (!unders.some((dir) => path.startsWith(dir))) return false;
      if (path.includes("/node_modules/") || isGeneratedPath(path)) {
        return false;
      }
      if (query.includeTests !== true) {
        if (isSpecPath(path)) return false;
        if (query.includeHarness !== true && isHarnessPath(path)) return false;
      }
      return !(query.exclude?.(relativePath(project.root, path)) ?? false);
    })
    .sort((a, b) => a.fileName.localeCompare(b.fileName));
};

/** The program's source file at `path`; throws if the program did not load it. */
export const sourceFileAt = (project: Project, path: string): ts.SourceFile => {
  const file = project.program.getSourceFile(normalizePath(path));
  if (file === undefined) throw new Error(`${path} is not in the program`);
  return file;
};

/**
 * Every module specifier `file` names: static `import` / `export … from`,
 * `import x = require(…)`, and a dynamic `import("…")` with a literal
 * argument — the obvious way around a static allow-list. In source order.
 */
export const moduleSpecifiers = (file: ts.SourceFile): string[] => {
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      specifiers.push(node.moduleReference.expression.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const [argument] = node.arguments;
      if (argument !== undefined && ts.isStringLiteralLike(argument)) {
        specifiers.push(argument.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return specifiers;
};
