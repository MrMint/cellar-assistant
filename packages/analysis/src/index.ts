/**
 * `@cellar-assistant/analysis` — the shared foundation for the repo's
 * architecture scans: a `ts.Program` and its checker instead of one
 * `ts.createSourceFile` per file.
 *
 * Test-time only. Nothing that ships imports it.
 */
export {
  isExcludedPath,
  isGeneratedPath,
  isHarnessPath,
  isSpecPath,
  isTestPath,
  moduleSpecifiers,
  normalizePath,
  relativePath,
  type SourceFileQuery,
  sourceFileAt,
  sourceFiles,
} from "./files.ts";
export {
  assertNoFindings,
  type Finding,
  findingAt,
  firstLineOf,
  formatFindings,
  lineOf,
  sortFindings,
} from "./findings.ts";
export {
  FIXTURE_OPTIONS,
  type FixtureOptions,
  fixtureProject,
  type LoadOptions,
  loadProject,
  PROGRAM_TIMEOUT_MS,
  type Project,
  workspacePaths,
} from "./project.ts";
export {
  type CallLike,
  type CallSite,
  callOf,
  type ExportTarget,
  exportedSymbol,
  findCalls,
  findReferences,
  isLoaded,
  moduleSymbol,
  type Reference,
  type ReferenceOptions,
  type ReferenceScan,
  referencedSymbol,
} from "./references.ts";
export {
  enclosingName,
  inTypePosition,
  type Literal,
  literalsOfType,
  literalValue,
  literalValues,
  propertyLiterals,
  resolveAlias,
  unwrapExpression,
} from "./values.ts";
