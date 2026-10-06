/**
 * The Playwright suite's own GraphQL, validated against the SDL offline.
 *
 * `packages/e2e` sends raw query strings — through the `Gql` fixture helper
 * (`fixtures/test.ts`, for setup and teardown that has no UI) and through a
 * few direct `request.post("/api/graphql", { data: { query } })` probes. None
 * of them is a gql.tada document, so nothing type-checks them, and a stale
 * field only surfaces as a failed spec — after a client image rebuild and a
 * full stack, minutes into a run, looking like a product regression. The
 * schema moves under these strings like any other consumer: `ActorError.code`
 * becoming an enum made every `... on Barcode { code } ... on ActorError
 * { code }` pair invalid overnight.
 *
 * It lives in the client suite because that suite has `graphql` and
 * `typescript` and the e2e package has neither, and because `app-ci` runs it
 * on every change under `packages/e2e/**` (the workflow's own `paths`).
 *
 * ## What is harvested
 *
 * From the TypeScript AST of every spec and fixture:
 *
 * - the first argument of any `.query(…)` / `.raw(…)` member call — the
 *   `Gql` helper's two methods;
 * - the value of any `query:` property — the direct-post shape.
 *
 * A literal is taken as-is; an identifier is resolved to a same-file `const`
 * initialised with a literal. Anything else is reported rather than skipped,
 * so a document cannot escape by being written differently.
 *
 *   bun run --filter @cellar-assistant/client test
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildSchema, parse, validate } from "graphql";
import ts from "typescript";

const E2E_ROOT = fileURLToPath(
  new URL("../../../../../packages/e2e", import.meta.url),
);
const SCHEMA_PATH = fileURLToPath(
  new URL("../../../../../packages/schema/schema.graphql", import.meta.url),
);

/** Where the suite's sources live; `artifacts/` and `node_modules/` are not. */
const SOURCE_DIRS = ["specs", "fixtures"];
const SOURCE_FILES = ["global-setup.ts"];

const sources = (): string[] => {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (entry.endsWith(".ts")) found.push(path);
    }
  };
  for (const dir of SOURCE_DIRS) walk(join(E2E_ROOT, dir));
  for (const file of SOURCE_FILES) found.push(join(E2E_ROOT, file));
  return found;
};

type Harvested = { where: string; text: string };

const harvest = (): { documents: Harvested[]; unreadable: string[] } => {
  const documents: Harvested[] = [];
  const unreadable: string[] = [];
  for (const file of sources()) {
    const text = readFileSync(file, "utf8");
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.ESNext,
      true,
      ts.ScriptKind.TS,
    );
    const rel = relative(E2E_ROOT, file);

    // Same-file `const NAME = <literal>` initialisers, for identifier args.
    const constants = new Map<string, string>();
    const collect = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined &&
        (ts.isNoSubstitutionTemplateLiteral(node.initializer) ||
          ts.isStringLiteral(node.initializer))
      ) {
        constants.set(node.name.text, node.initializer.text);
      }
      ts.forEachChild(node, collect);
    };
    collect(source);

    /**
     * True for an identifier naming a parameter of an enclosing function —
     * the `Gql` helper's own `query(query, …)` handing its argument to
     * `raw`. That is a pass-through, not a document; its callers' literals
     * are what get checked.
     */
    const isParameter = (node: ts.Identifier): boolean => {
      for (let at: ts.Node | undefined = node.parent; at; at = at.parent) {
        if (
          ts.isFunctionLike(at) &&
          at.parameters.some(
            (parameter) =>
              ts.isIdentifier(parameter.name) &&
              parameter.name.text === node.text,
          )
        ) {
          return true;
        }
      }
      return false;
    };

    const take = (node: ts.Expression): void => {
      if (ts.isIdentifier(node) && isParameter(node)) return;
      const where = `${rel}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
      if (
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isStringLiteral(node)
      ) {
        documents.push({ where, text: node.text });
      } else if (ts.isIdentifier(node) && constants.has(node.text)) {
        documents.push({ where, text: constants.get(node.text) ?? "" });
      } else {
        unreadable.push(where);
      }
    };

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        (node.expression.name.text === "query" ||
          node.expression.name.text === "raw") &&
        node.arguments[0] !== undefined
      ) {
        take(node.arguments[0]);
      }
      if (
        ts.isPropertyAssignment(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === "query"
      ) {
        take(node.initializer);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { documents, unreadable };
};

describe("packages/e2e GraphQL against packages/schema/schema.graphql", () => {
  const schema = buildSchema(readFileSync(SCHEMA_PATH, "utf8"));
  const { documents, unreadable } = harvest();

  test("the harvest sees the suite's documents", () => {
    // ~30 today. A floor, so a harvest that went blind fails here instead of
    // passing every document below by checking none.
    assert.ok(documents.length > 20, `only ${documents.length} found`);
  });

  test("every document can be read from source", () => {
    assert.deepEqual(
      unreadable,
      [],
      "Pass the Gql helper (or a `query:` property) a literal, or a same-file " +
        "const holding one, so this check can validate it.",
    );
  });

  for (const { where, text } of documents) {
    test(where, () => {
      assert.deepEqual(
        validate(schema, parse(text)).map((error) => error.message),
        [],
      );
    });
  }
});
