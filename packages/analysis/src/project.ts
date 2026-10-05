/**
 * A `ts.Program` and its checker, loaded once per process.
 *
 * Every architecture scan in this repo used to parse files one at a time with
 * `ts.createSourceFile`, which sees syntax and nothing else: a renamed import,
 * a namespace import, a re-export or a `const` defined in another module was a
 * name the scan had to chase by hand, and each scan chased it differently. A
 * program answers those questions exactly, so this module is the one place a
 * scan gets one.
 *
 * Programs are expensive (≈1s for `services/actors`), so {@link loadProject}
 * caches per process, and every program built here shares one parsed-file
 * cache — which is what makes a fixture program over a handful of in-memory
 * files cost milliseconds even when its files import real modules.
 */
import { existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import ts from "typescript";
import { isSpecPath, normalizePath } from "./files.ts";

export type Project = {
  readonly program: ts.Program;
  readonly checker: ts.TypeChecker;
  /** The directory findings are reported relative to. `/`-separated. */
  readonly root: string;
};

/* -------------------------------------------------------------------------- */
/* The shared parsed-file cache                                                */
/* -------------------------------------------------------------------------- */

type CachedFile = { readonly mtimeMs: number; readonly file: ts.SourceFile };
const PARSED = new Map<string, CachedFile>();

const mtimeOf = (path: string): number => {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return -1;
  }
};

/**
 * A compiler host that parses each real file once per process (re-parsing
 * only if it changed on disk) and serves `overlay` from memory in front of
 * the filesystem.
 */
const makeHost = (
  options: ts.CompilerOptions,
  overlay: ReadonlyMap<string, string> = new Map(),
): ts.CompilerHost => {
  const host = ts.createCompilerHost(options, true);
  const overlaidDirs = new Set<string>();
  for (const path of overlay.keys()) {
    for (let dir = dirname(path); dir !== dirname(dir); dir = dirname(dir)) {
      overlaidDirs.add(dir);
    }
  }
  const readReal = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const directoryExists = host.directoryExists?.bind(host);
  host.fileExists = (path) => overlay.has(path) || fileExists(path);
  host.readFile = (path) => overlay.get(path) ?? readReal(path);
  host.directoryExists = (dir) =>
    overlaidDirs.has(normalizePath(dir)) ||
    (directoryExists === undefined ? existsSync(dir) : directoryExists(dir));
  host.getSourceFile = (path, languageVersion) => {
    const virtual = overlay.get(path);
    if (virtual !== undefined) {
      return ts.createSourceFile(path, virtual, languageVersion, true);
    }
    const mtimeMs = mtimeOf(path);
    const cached = PARSED.get(path);
    if (cached !== undefined && cached.mtimeMs === mtimeMs) return cached.file;
    const text = readReal(path);
    if (text === undefined) return undefined;
    const file = ts.createSourceFile(path, text, languageVersion, true);
    PARSED.set(path, { mtimeMs, file });
    return file;
  };
  return host;
};

const formatDiagnostics = (diagnostics: readonly ts.Diagnostic[]): string =>
  ts.formatDiagnostics(diagnostics, {
    getCanonicalFileName: (name) => name,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => "\n",
  });

/* -------------------------------------------------------------------------- */
/* Projects                                                                    */
/* -------------------------------------------------------------------------- */

export type LoadOptions = {
  /**
   * Include `*.test.ts` / `*.spec.ts` files as roots. Off by default: no scan
   * judges tests, and leaving them out makes the program smaller. Harnesses
   * (`*testing.ts`) are always roots, so a scan can opt into judging them.
   */
  readonly includeTests?: boolean;
  /**
   * Directories whose `.ts` files (tests aside) are roots too — the sibling
   * packages a scan resolves across, for a {@link LoadOptions.repoOnly}
   * program.
   */
  readonly extraRoots?: readonly string[];
  /**
   * Load only the roots (and TypeScript's lib files): an import resolves if
   * its target is a root, and anything in `node_modules` is `any`. A third
   * the size of a full program for `services/actors`, and enough for every
   * rule about *this repo's* symbols — identity across modules and packages,
   * literal types, re-exports. A rule that needs a library's types (Drizzle's
   * table names, Dapr's state manager) loads the full program instead.
   */
  readonly repoOnly?: boolean;
};

/**
 * The timeout for a scan's setup — building a program and making the
 * checker's first pass over it — passed to the `beforeAll` that does it.
 *
 * vitest's defaults (5 s for a test, 10 s for a hook) are sized for tests
 * that wait on something. This is pure CPU, and it scales with whatever else
 * the machine is running: `no-actor-state`'s full program plus its scan was
 * ≈2 s alone and 4.1 s at load 30, and timed out at 5 s in three full-suite
 * runs at load 30–46 — a red that said nothing about the code. Deterministic
 * work that is merely slow should not fail for being slow; the bound is
 * there only so a real hang still ends.
 *
 * Checking is lazy, so a `loadProject` at module scope does not pay for the
 * checker: the first scan that resolves a symbol does. Put that first scan in
 * the `beforeAll` too, not only the load. A negative control's
 * {@link fixtureProject} is the exception that stays in its test: a handful
 * of in-memory files over an already-parsed tree checks in well under a
 * second even under that load.
 */
export const PROGRAM_TIMEOUT_MS = 60_000;

const LISTED = new Map<string, readonly string[]>();

/** The `.ts` files under `dir`, tests aside — listed once per process. */
const rootsUnder = (dir: string): readonly string[] => {
  const key = normalizePath(dir);
  const cached = LISTED.get(key);
  if (cached !== undefined) return cached;
  const files = ts.sys
    .readDirectory(key, [".ts", ".tsx"], ["**/node_modules/**"])
    .map(normalizePath)
    .filter((path) => !isSpecPath(path) && !path.endsWith(".d.ts"));
  LISTED.set(key, files);
  return files;
};

const PROJECTS = new Map<string, Project>();

/**
 * The program `tsconfigPath` describes, with its checker. Cached per process
 * by path and options — call it as often as you like.
 *
 * `root` (where findings are reported relative to) is the tsconfig's
 * directory unless given.
 */
export const loadProject = (
  tsconfigPath: string,
  options: LoadOptions & { readonly root?: string } = {},
): Project => {
  const configPath = normalizePath(tsconfigPath);
  const key = JSON.stringify([
    configPath,
    options.includeTests === true,
    options.root ?? "",
    options.extraRoots ?? [],
    options.repoOnly === true,
  ]);
  const cached = PROJECTS.get(key);
  if (cached !== undefined) return cached;

  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error !== undefined) {
    throw new Error(formatDiagnostics([read.error]));
  }
  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    dirname(configPath),
    undefined,
    configPath,
  );
  if (parsed.errors.length > 0) {
    throw new Error(formatDiagnostics(parsed.errors));
  }
  const rootNames = [
    ...parsed.fileNames.filter(
      (path) => options.includeTests === true || !isSpecPath(path),
    ),
    ...(options.extraRoots ?? []).flatMap(rootsUnder),
  ];
  const compilerOptions: ts.CompilerOptions =
    options.repoOnly === true
      ? { ...parsed.options, noResolve: true }
      : parsed.options;
  const program = ts.createProgram({
    rootNames: [...new Set(rootNames)],
    options: compilerOptions,
    host: makeHost(compilerOptions),
  });
  const project: Project = {
    program,
    checker: program.getTypeChecker(),
    root: normalizePath(options.root ?? dirname(configPath)),
  };
  PROJECTS.set(key, project);
  return project;
};

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

/** The compiler options fixtures get unless told otherwise: the repo's base. */
export const FIXTURE_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2024,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  moduleDetection: ts.ModuleDetectionKind.Force,
  strict: true,
  noEmit: true,
  allowImportingTsExtensions: true,
  verbatimModuleSyntax: false,
  skipLibCheck: true,
  types: [],
};

let fixtureCount = 0;

export type FixtureOptions = {
  /** Path (relative to `root`) → source text. */
  readonly files: Readonly<Record<string, string>>;
  /**
   * The directory the files appear in. Defaults to a fresh, non-existent
   * directory under the OS temp dir: nothing is written there, the files
   * exist only in memory.
   *
   * Point it *inside a real tree* — `services/actors/src/__fixture__` — and
   * the fixture's imports resolve against the real modules and the real
   * `node_modules` around it, so a negative control can call the real
   * `enqueueOutbox` and be judged by the checker exactly as production code
   * is. Fixture files shadow real files at the same path.
   */
  readonly root?: string;
  /** Compiler options; {@link FIXTURE_OPTIONS} by default. */
  readonly options?: ts.CompilerOptions;
  /**
   * Real directories whose files join the fixture as roots — with
   * `options.noResolve`, the only way an import of a real module resolves,
   * and a cheap one: their parsed files are shared with every other program
   * in the process.
   */
  readonly extraRoots?: readonly string[];
};

/**
 * A program over in-memory files — the negative-control half of every scan:
 * build a tree that breaks the rule and prove the detector fires on it.
 * Not cached; the parsed real files it pulls in are.
 */
export const fixtureProject = ({
  files,
  root,
  options = FIXTURE_OPTIONS,
  extraRoots = [],
}: FixtureOptions): Project => {
  fixtureCount += 1;
  const base = normalizePath(
    root ?? join(tmpdir(), `analysis-fixture-${process.pid}-${fixtureCount}`),
  );
  const overlay = new Map<string, string>();
  for (const [path, text] of Object.entries(files)) {
    if (isAbsolute(path)) {
      throw new Error(`fixture paths are relative to the root: ${path}`);
    }
    overlay.set(normalizePath(join(base, path)), text);
  }
  const program = ts.createProgram({
    rootNames: [
      ...new Set([...overlay.keys(), ...extraRoots.flatMap(rootsUnder)]),
    ],
    options,
    host: makeHost(options, overlay),
  });
  return { program, checker: program.getTypeChecker(), root: base };
};
