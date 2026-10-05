/**
 * The error contract, carried all the way into the client — and kept there.
 *
 * `ActorError.reason` was built end to end (contracts, actors, the Dapr
 * envelope, the API's SDL) so that a client could tell apart the outcomes one
 * `code` covers without reading English. The client then dropped it on the
 * floor for three independent reasons, and each is a check below:
 *
 * 1. **No document selected it.** ~120 error branches were written inline as
 *    `... on ActorError { code message }`, each copied from one written before
 *    `reason` existed. The fix is one fragment, `ActorErrorFields`
 *    (`src/lib/api/errors.ts`); this fails on an inline `... on ActorError {`
 *    or `... on Error {` selection anywhere in client source, and on any field
 *    whose result union carries the typed errors but not the fragment — a
 *    branch left out entirely makes `unwrapResult` report `UNKNOWN` with the
 *    actor's explanation discarded.
 * 2. **`ApiFailure` had nowhere to put it.** Fixed in `result.ts`; the
 *    `urql-client.test.ts` round trip asserts `reason` survives the cache.
 * 3. **The one page that needed it parsed `message` instead.**
 *    `FriendsClient` decided between "Send request" and "Accept their
 *    request" with `message.includes("accept it instead")`. This fails on a
 *    string test against anything named `message` in client source.
 *
 * Read from the TypeScript AST, not grepped, so a doc comment that *describes*
 * the old inline selection — several do, to explain why it is gone — is not a
 * violation, and a template literal that is not a `graphql()` call still is.
 *
 *   bun run --filter @cellar-assistant/client test
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildSchema,
  getNamedType,
  isAbstractType,
  Kind,
  parse,
  TypeInfo,
  visit,
  visitWithTypeInfo,
} from "graphql";
import ts from "typescript";

const CLIENT_SRC = fileURLToPath(new URL("../..", import.meta.url));
const SCHEMA_PATH = fileURLToPath(
  new URL("../../../../../packages/schema/schema.graphql", import.meta.url),
);

/** The fragment every error branch spreads (`src/lib/api/errors.ts`). */
const FRAGMENT = "ActorErrorFields";

/**
 * An inline selection on either error interface. `Error` is included because
 * every member that implements it implements `ActorError` too, so an
 * `... on Error { message }` branch is the same omission with less in it —
 * the friend documents were written that way.
 */
const INLINE_ERROR_SELECTION = /\.\.\.\s*on\s+(?:ActorError|Error)\s*\{/;

/**
 * Files whose literals legitimately spell an error selection out.
 *
 * The reason is the point, as in `services/api`'s `NO_SURFACE`: say why the
 * fragment cannot be used here, not that the file is special.
 */
const INLINE_ALLOWED: Readonly<Record<string, string>> = {
  "lib/api/errors.ts":
    "Defines ActorErrorFields itself, as `fragment ActorErrorFields on ActorError`; " +
    "the definition is the one place the fields are listed.",
};

/**
 * Operations that leave a result union's error branch out on purpose, keyed
 * `file OperationName`. Each is a document whose consumer never reads a
 * failure, *and* a reason the few extra fields are not free.
 */
const BRANCH_OMITTED: Readonly<Record<string, string>> = {};

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return entry === "node_modules" ? [] : sourceFiles(path);
    }
    // Tests hold deliberately raw documents (canned bodies, a cap probe).
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) return [];
    return [path];
  });

const parseSource = (file: string): ts.SourceFile =>
  ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.ESNext,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

const lineOf = (source: ts.SourceFile, node: ts.Node): number =>
  source.getLineAndCharacterOfPosition(node.getStart()).line + 1;

type Literal = { where: string; text: string; inGraphqlCall: boolean };

/** Every string and template literal in client source, with its location. */
const literals = (): Literal[] => {
  const found: Literal[] = [];
  for (const file of sourceFiles(CLIENT_SRC)) {
    const source = parseSource(file);
    const rel = relative(CLIENT_SRC, file);
    const visitNode = (node: ts.Node, inGraphqlCall: boolean): void => {
      const isGraphqlCall =
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "graphql";
      if (
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isStringLiteral(node) ||
        ts.isTemplateExpression(node)
      ) {
        found.push({
          where: `${rel}:${lineOf(source, node)}`,
          text: node.getText(source),
          inGraphqlCall,
        });
      }
      ts.forEachChild(node, (child) =>
        visitNode(child, inGraphqlCall || isGraphqlCall),
      );
    };
    visitNode(source, false);
  }
  return found;
};

describe("error branches use the ActorErrorFields fragment", () => {
  const all = literals();
  const documents = all.filter((literal) => literal.inGraphqlCall);

  test("the harvest sees the client's documents", () => {
    // A floor, so a harvest that went blind cannot pass everything below on
    // an empty list. ~140 `graphql()` bodies exist today.
    assert.ok(
      documents.length > 100,
      `only ${documents.length} graphql() literals found — is the harvest broken?`,
    );
  });

  test("no literal selects an error interface inline", () => {
    const inline = all
      .filter((literal) => INLINE_ERROR_SELECTION.test(literal.text))
      .filter(
        (literal) =>
          !Object.hasOwn(INLINE_ALLOWED, literal.where.replace(/:\d+$/, "")),
      )
      .map((literal) => literal.where);
    assert.deepEqual(
      inline,
      [],
      "Spread `...ActorErrorFields` (src/lib/api/errors.ts) instead of an inline " +
        "`... on ActorError { … }` / `... on Error { … }` branch: the inline form " +
        "is how ~120 documents ended up without `reason`.",
    );
  });

  test("every omitted-branch entry names a real operation, and says why", () => {
    for (const [key, reason] of Object.entries(BRANCH_OMITTED)) {
      const [file, operation] = key.split(" ");
      assert.ok(reason.trim().length >= 40, `${key}: give a real reason`);
      assert.ok(
        documents.some(
          (literal) =>
            literal.where.startsWith(`${file}:`) &&
            new RegExp(`\\b(?:query|mutation)\\s+${operation}\\b`).test(
              literal.text,
            ),
        ),
        `${key} no longer exists; drop its entry`,
      );
    }
  });

  test("every allow-list entry still has something to allow, and says why", () => {
    for (const [file, reason] of Object.entries(INLINE_ALLOWED)) {
      assert.ok(
        reason.trim().length >= 40,
        `${file}: give a real reason, not a label`,
      );
      assert.ok(
        all.some(
          (literal) =>
            literal.where.startsWith(`${file}:`) &&
            /\bon\s+ActorError\b/.test(literal.text),
        ),
        `${file} no longer spells an error selection out; drop its entry`,
      );
    }
  });

  test("every field whose result union carries the typed errors spreads the fragment", () => {
    const schema = buildSchema(readFileSync(SCHEMA_PATH, "utf8"));
    const actorError = schema.getType("ActorError");
    assert.ok(actorError !== undefined && isAbstractType(actorError));
    const errorTypes = new Set(
      schema.getPossibleTypes(actorError).map((type) => type.name),
    );

    const missing: string[] = [];
    let checked = 0;
    for (const literal of documents) {
      // A `graphql()` literal is a template with no substitutions; strip the
      // quotes and it is the document.
      const body = literal.text.slice(1, -1).replace(/\\`/g, "`");
      const typeInfo = new TypeInfo(schema);
      const file = literal.where.replace(/:\d+$/, "");
      let operation = "";
      visit(
        parse(body),
        visitWithTypeInfo(typeInfo, {
          [Kind.OPERATION_DEFINITION]: (node) => {
            operation = node.name?.value ?? "";
          },
          [Kind.FRAGMENT_DEFINITION]: () => {
            operation = "";
          },
          [Kind.FIELD]: (node) => {
            const type = typeInfo.getType();
            if (type === null || type === undefined) return;
            const named = getNamedType(type);
            if (!isAbstractType(named)) return;
            const members = schema.getPossibleTypes(named);
            // Only result unions: the success type plus the five errors. An
            // `Item` interface field has no error members and is not one.
            if (!members.some((member) => errorTypes.has(member.name))) return;
            checked += 1;
            if (Object.hasOwn(BRANCH_OMITTED, `${file} ${operation}`)) return;
            const spreads = (node.selectionSet?.selections ?? []).some(
              (selection) =>
                selection.kind === Kind.FRAGMENT_SPREAD &&
                selection.name.value === FRAGMENT,
            );
            if (!spreads) {
              missing.push(
                `${literal.where} ${node.alias?.value ?? node.name.value}`,
              );
            }
          },
        }),
      );
    }

    assert.ok(checked > 100, `only ${checked} result-union fields found`);
    assert.deepEqual(
      missing,
      [],
      "These fields answer with a result union but do not spread " +
        "`...ActorErrorFields`, so a typed error reaches `unwrapResult` with no " +
        "code, reason or message and renders as 'Something went wrong.'",
    );
  });
});

/* --------------------------------------------------------------------------
 * Never branch on prose
 * ----------------------------------------------------------------------- */

/** String methods that turn a message into a branch condition. */
const PROSE_TESTS = new Set([
  "includes",
  "startsWith",
  "endsWith",
  "match",
  "matchAll",
  "search",
  "indexOf",
  "localeCompare",
]);

/** `message`, `error.message`, `result.error?.message`, `payload.message` … */
const isMessage = (node: ts.Expression): boolean => {
  const inner = ts.isParenthesizedExpression(node) ? node.expression : node;
  if (ts.isIdentifier(inner)) return /^(?:\w+)?[mM]essage$/.test(inner.text);
  if (ts.isPropertyAccessExpression(inner)) {
    return inner.name.text === "message";
  }
  return false;
};

/**
 * Places that test a `message` string and are not branching on an API
 * error's prose. Empty today; an entry needs a reason as real as
 * {@link INLINE_ALLOWED}'s.
 */
const PROSE_ALLOWED: Readonly<Record<string, string>> = {};

describe("no client code branches on an error's message", () => {
  test("no string test against anything named message", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(CLIENT_SRC)) {
      const rel = relative(CLIENT_SRC, file);
      if (Object.hasOwn(PROSE_ALLOWED, rel)) continue;
      const source = parseSource(file);
      const visitNode = (node: ts.Node): void => {
        if (ts.isCallExpression(node)) {
          const callee = node.expression;
          // `message.includes("…")` and friends.
          if (
            ts.isPropertyAccessExpression(callee) &&
            PROSE_TESTS.has(callee.name.text) &&
            isMessage(callee.expression)
          ) {
            offenders.push(`${rel}:${lineOf(source, node)}`);
          }
          // `/…/.test(message)`.
          if (
            ts.isPropertyAccessExpression(callee) &&
            callee.name.text === "test" &&
            ts.isRegularExpressionLiteral(callee.expression) &&
            node.arguments.some((argument) => isMessage(argument))
          ) {
            offenders.push(`${rel}:${lineOf(source, node)}`);
          }
        }
        ts.forEachChild(node, visitNode);
      };
      visitNode(source);
    }
    assert.deepEqual(
      offenders,
      [],
      "Branch on `reason`, then `code` (ApiFailure, src/lib/api/result.ts) — " +
        "never on `message`, which is the actor's English and changes without " +
        "notice. If the API gives you nothing to branch on, that is a missing " +
        "ActorErrorReason, not a reason to parse prose.",
    );
  });
});
