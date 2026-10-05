/**
 * The containment half of the single-writer test (§1.2): a static scan of
 * `services/actors/src` for Drizzle write helpers, reported per table.
 *
 * Test-support, not runtime. It builds the actor host's `ts.Program`
 * (`@cellar-assistant/analysis`); nothing in `services/actors` should ever
 * import it.
 *
 * ## Read by the checker, not by name
 *
 * A `.insert(t)` / `.update(t)` / `.delete(t)` call is a Drizzle write when the
 * checker resolves the method to a declaration inside `drizzle-orm` — whatever
 * the receiver is called (`tx`, `db`, `this.#db`) — and its table is read from
 * the argument's **type**: every Drizzle table's type carries its Postgres name
 * as a literal (`_.name`). So `tx.insert(ITEM_TABLE[type])` is one site per
 * table the union can be, and a local alias of a table is still that table.
 *
 * What it cannot read it reports, in `unresolved`:
 *
 * - a Drizzle write whose table type is not a literal name (`PgTable`, `any`);
 * - a write-shaped call on an `any` receiver, where there is no method to ask;
 * - a write-shaped call on a method *this repo* declares (a seam such as
 *   `FilesBinding.delete`) — each is reviewed in `writers.test.ts`, by the
 *   declaring `Type.method`, because a seam can wrap a Postgres write.
 *
 * `Hash.update`, `Set.delete`, `Map.delete` and every other method declared by
 * a library or by TypeScript's own lib files are not writes, and need no
 * review list: the checker says whose method each one is.
 *
 * Raw SQL is still read syntactically — the scan looks inside string and
 * template literals for `insert into x` and friends — because a SQL string has
 * no symbols. Comments are not nodes, so a table named in a doc block explaining
 * the rule does not trip it.
 */
import { fileURLToPath } from "node:url";
import {
  firstLineOf,
  lineOf,
  loadProject,
  type Project,
  propertyLiterals,
  relativePath,
  sourceFiles,
  unwrapExpression,
} from "@cellar-assistant/analysis";
import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import ts from "typescript";
import * as schema from "./schema/tables.ts";

/** `db.insert(t)`, `db.update(t)`, `db.delete(t)` — Drizzle's whole write API. */
const WRITE_METHODS = new Set(["insert", "update", "delete"]);

export const ACTORS_SRC = fileURLToPath(
  new URL("../../../services/actors/src", import.meta.url),
).replace(/[/\\]$/, "");

/**
 * The actor host's program, built once per process. `auth/` is scanned like
 * any other directory since X2 merged better-auth into the main database (its
 * five tables are `infrastructure:better-auth` in `TABLE_WRITERS`). Test files
 * and the harness (`lib/testing.ts`, which seeds rows on purpose) are not
 * judged — the rule is about production modules.
 */
export const actorsProject = (): Project =>
  loadProject(`${ACTORS_SRC}/../tsconfig.json`, { root: ACTORS_SRC });

/** Drizzle export identifier (`cellarOwners`) → Postgres name (`cellar_owners`). */
export const EXPORT_TO_TABLE: ReadonlyMap<string, string> = new Map(
  Object.entries(schema)
    .filter(([, value]) => is(value, PgTable))
    .map(([exportName, table]) => [exportName, getTableName(table as PgTable)]),
);

/** Every table name the schema declares. Since X2 that is `public` alone. */
export const KNOWN_TABLES: ReadonlySet<string> = new Set(
  EXPORT_TO_TABLE.values(),
);

export type WriteSite = {
  /** Path relative to `services/actors/src`, with `/` separators. */
  readonly file: string;
  readonly line: number;
  /** Postgres table name. */
  readonly table: string;
  /** `insert` / `update` / `delete`, or `raw sql` for a write in a SQL string. */
  readonly how: string;
  readonly text: string;
};

/** `insert into x`, `update x set`, `delete from x` in a SQL string literal. */
const RAW_WRITE =
  /\b(?:insert\s+into|update|delete\s+from)\s+(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?/gi;

/**
 * A write-shaped call the scan could NOT resolve to a schema table.
 *
 * These used to be dropped silently, which made the containment half fail
 * *open*. They are reported, and `writers.test.ts` fails on every one that is
 * not a reviewed seam in its `NOT_DRIZZLE_SEAMS` list. Pass the table itself —
 * any expression whose type is one (or a union of) schema tables — and the
 * site becomes an ordinary, checked write.
 */
export type UnresolvedWrite = {
  /** Path relative to `services/actors/src`, with `/` separators. */
  readonly file: string;
  readonly line: number;
  readonly how: string;
  /** The receiver's source text: `tx`, `this.#binding`. */
  readonly receiver: string;
  /**
   * The declaring `Type.method` when the method is this repo's own
   * (`FilesBinding.delete`); `null` for a Drizzle write whose table type is
   * not a literal, or a receiver with no method to ask (`any`).
   */
  readonly seam: string | null;
  readonly text: string;
};

export type WriteScan = {
  readonly sites: WriteSite[];
  readonly unresolved: UnresolvedWrite[];
};

type MethodOwner =
  | { readonly kind: "drizzle" }
  | { readonly kind: "library" }
  | { readonly kind: "repo"; readonly seam: string }
  | { readonly kind: "unknown" };

const isLibraryFile = (program: ts.Program, file: ts.SourceFile): boolean =>
  file.fileName.includes("/node_modules/") ||
  program.isSourceFileDefaultLibrary(file) ||
  program.isSourceFileFromExternalLibrary(file);

/** `Type.method` for a member declared in this repo. */
const seamName = (declaration: ts.Declaration, method: string): string => {
  let owner: ts.Node | undefined = declaration.parent;
  if (owner !== undefined && ts.isTypeLiteralNode(owner)) owner = owner.parent;
  const name =
    owner !== undefined &&
    (ts.isClassLike(owner) ||
      ts.isInterfaceDeclaration(owner) ||
      ts.isTypeAliasDeclaration(owner)) &&
    owner.name !== undefined
      ? owner.name.text
      : "<anonymous>";
  return `${name}.${method}`;
};

/** Whose method `access` calls, as the checker resolves it. */
const ownerOf = (
  project: Project,
  access: ts.PropertyAccessExpression,
): MethodOwner => {
  const symbol = project.checker.getSymbolAtLocation(access.name);
  const declarations = symbol?.declarations ?? [];
  if (declarations.length === 0) return { kind: "unknown" };
  const files = declarations.map((d) => d.getSourceFile());
  if (
    files.every((file) => file.fileName.includes("/node_modules/drizzle-orm/"))
  ) {
    return { kind: "drizzle" };
  }
  if (files.every((file) => isLibraryFile(project.program, file))) {
    return { kind: "library" };
  }
  const own = declarations.find(
    (d) => !isLibraryFile(project.program, d.getSourceFile()),
  );
  return own === undefined
    ? { kind: "unknown" }
    : { kind: "repo", seam: seamName(own, access.name.text) };
};

/**
 * The schema tables an expression's type is — `["cellars"]`, or every member
 * of a union — or `null` if its type is not (only) schema tables.
 */
const tablesOf = (
  checker: ts.TypeChecker,
  node: ts.Expression,
): string[] | null => {
  const type = checker.getTypeAtLocation(unwrapExpression(node));
  const brand = type.getProperty("_");
  if (brand === undefined) return null;
  const names = propertyLiterals(
    checker,
    checker.getTypeOfSymbol(brand),
    "name",
  );
  if (
    names === null ||
    names.length === 0 ||
    names.some((name) => typeof name !== "string" || !KNOWN_TABLES.has(name))
  ) {
    return null;
  }
  return (names as string[]).sort();
};

/**
 * Every write site and every unresolved write-shaped call under `root` in
 * `project` — the actor host's by default; a negative control passes a
 * fixture program.
 */
export const scanWrites = (
  project: Project = actorsProject(),
  root: string = ACTORS_SRC,
): WriteScan => {
  const sites: WriteSite[] = [];
  const unresolved: UnresolvedWrite[] = [];

  for (const source of sourceFiles(project, { under: root })) {
    const file = relativePath(root, source.fileName);
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        WRITE_METHODS.has(node.expression.name.text) &&
        node.arguments[0] !== undefined
      ) {
        const access = node.expression;
        const how = access.name.text;
        const owner = ownerOf(project, access);
        // A schema table handed to any write-shaped method is a write, whoever
        // declares the method — the old scan's rule, kept.
        const tables = tablesOf(project.checker, node.arguments[0]);
        if (tables !== null) {
          for (const table of tables) {
            sites.push({
              file,
              line: lineOf(node),
              table,
              how,
              text: firstLineOf(node),
            });
          }
        } else if (owner.kind !== "library") {
          unresolved.push({
            file,
            line: lineOf(node),
            how,
            receiver: access.expression.getText(),
            seam: owner.kind === "repo" ? owner.seam : null,
            text: firstLineOf(node),
          });
        }
      }

      // Raw SQL is the obvious way around the builder, so look inside string
      // and template literals too.
      if (
        ts.isStringLiteralLike(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)
      ) {
        for (const match of node.text.matchAll(RAW_WRITE)) {
          const table = match[1]?.toLowerCase();
          if (table !== undefined && KNOWN_TABLES.has(table)) {
            sites.push({
              file,
              line: lineOf(node),
              table,
              how: "raw sql",
              text: match[0],
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { sites, unresolved };
};

let host: WriteScan | undefined;

/**
 * {@link scanWrites} over the actor host, run once per process. The full
 * program (Drizzle's types are what a table is resolved by) and the checker's
 * pass over every write-shaped call took ≈5 s at load 20 — inside whichever
 * test asked first, on vitest's 5 s default — and each later test that asked
 * ran the walk again. Callers take it in a `beforeAll` with
 * `PROGRAM_TIMEOUT_MS`.
 */
export const hostWrites = (): WriteScan => {
  host ??= scanWrites();
  return host;
};
