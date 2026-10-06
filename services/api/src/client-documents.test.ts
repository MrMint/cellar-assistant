/**
 * **Every operation the client sends passes every cost limit.**
 *
 * `limits.ts` opens by saying a limit set too low is the worse defect — it
 * takes the app down for everybody instead of for an attacker — and its table
 * of headroom was measured by composing every `graphql()` body in
 * `services/client/src` and costing the result. That was a one-off
 * measurement. `limits.test.ts`'s "client's own documents" block rebuilds the
 * worst case per dimension by hand, which proves the numbers recorded there
 * and nothing about a document written since.
 *
 * This is the standing version of that measurement: it reads the client's
 * source, composes each operation with the fragments it spreads, adds the
 * `__typename` URQL puts on the wire, and runs the real rule over it with the
 * real limits. A limit tightened past a real document, a field added to
 * `MODEL_BACKED_FIELDS` that a real page selects five times, or a client
 * document that grows past a cap all fail here, by operation name, before a
 * page does.
 *
 * **When it runs:** with the api suite, which `stack-ci` runs on changes under
 * `services/**` and — for this file's sake — `services/client/src/**`, which
 * its filter re-includes after excluding the rest of `services/client`. So a
 * client-only change that pushes a document past a limit fails here on its
 * own PR. (`app-ci` runs only the client's own suite.)
 *
 * Read from disk rather than imported: the client's modules import React,
 * Next and the gql.tada types, none of which this package depends on, and the
 * documents are string literals — the TypeScript AST is enough to find them.
 *
 * **It also validates every one of them in full** — graphql-js's
 * `specifiedRules`, what Yoga runs before executing. The client's own
 * `documents.test.ts` does too, but it finds documents by the identifier
 * text `graphql(` and a hand-kept module list, so `import { graphql as gql }`
 * would take a document past it unvalidated. This harvest finds calls by
 * symbol, so it is the check that cannot be walked around by a rename; the
 * negative control below proves a renamed import with a wrong argument fails.
 */
import { fileURLToPath } from "node:url";
import {
  FIXTURE_OPTIONS,
  findCalls,
  fixtureProject,
  lineOf,
  loadProject,
  type Project,
  relativePath,
  sourceFiles,
} from "@cellar-assistant/analysis";
import type {
  DefinitionNode,
  DocumentNode,
  FragmentDefinitionNode,
  OperationDefinitionNode,
  SelectionSetNode,
} from "graphql";
import {
  Kind,
  NoUnusedFragmentsRule,
  parse,
  print,
  specifiedRules,
  validate,
  visit,
} from "graphql";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { DEFAULT_COST_LIMITS, queryCostRule } from "./limits.ts";
import { schema } from "./schema/index.ts";

const CLIENT_SRC = fileURLToPath(new URL("../../client/src", import.meta.url));

/* -------------------------------------------------------------------------- */
/* Finding the documents                                                       */
/* -------------------------------------------------------------------------- */

/** `packages/schema/src`, where the gql.tada `graphql` binding is defined. */
const SCHEMA_PKG_SRC = fileURLToPath(
  new URL("../../../packages/schema/src", import.meta.url),
);

/**
 * The client as a repo-only program (`@cellar-assistant/analysis`): its own
 * sources and `packages/schema`'s, nothing from `node_modules` — enough to
 * resolve every import of `graphql` to the one binding, and cheap.
 */
const clientProject = (): Project =>
  loadProject(
    fileURLToPath(new URL("../../client/tsconfig.json", import.meta.url)),
    {
      root: CLIENT_SRC,
      repoOnly: true,
      extraRoots: [SCHEMA_PKG_SRC],
    },
  );

/** The one `graphql` every client document is written with. */
const GRAPHQL = { module: `${SCHEMA_PKG_SRC}/index.ts`, name: "graphql" };

type Body = { readonly file: string; readonly text: string };

type Harvest = {
  readonly bodies: readonly Body[];
  /** `graphql()` calls (or references) whose document cannot be read. */
  readonly unreadable: readonly string[];
};

/**
 * Every call of the gql.tada `graphql` binding in the client, found by
 * symbol — `import { graphql as gql }`, a re-export through
 * `lib/api/graphql.ts` and a namespace member are all the same function. A
 * call whose first argument is not a literal — a template with a
 * substitution, a variable — cannot be costed from source, and neither can a
 * reference that is not a call; both are reported rather than skipped:
 * skipping them would let a document escape this test by being written
 * differently. Test files are not judged: a test may hold a deliberately bad
 * document, and only shipped code is sent.
 */
const harvest = (project: Project = clientProject()): Harvest => {
  const bodies: Body[] = [];
  const { calls, refusals } = findCalls(project, [GRAPHQL], {
    rule: "client-documents/unreadable",
    files: sourceFiles(project),
    allowReexports: true,
  });
  const unreadable = refusals.map(
    (finding) => `${finding.file}:${finding.line}`,
  );
  for (const { call, args } of calls) {
    const where = relativePath(project.root, call.getSourceFile().fileName);
    const [first] = args;
    if (
      first !== undefined &&
      (ts.isNoSubstitutionTemplateLiteral(first) || ts.isStringLiteral(first))
    ) {
      bodies.push({ file: where, text: first.text });
    } else {
      unreadable.push(`${where}:${lineOf(call)}`);
    }
  }
  return { bodies, unreadable };
};

/* -------------------------------------------------------------------------- */
/* Composing them the way they go on the wire                                  */
/* -------------------------------------------------------------------------- */

type Operation = {
  readonly name: string;
  readonly file: string;
  readonly document: DocumentNode;
};

type Composed = {
  readonly operations: readonly Operation[];
  /**
   * Each fragment on its own, with the fragments it reaches: a fragment a
   * module exports but no operation spreads is still validated.
   */
  readonly fragments: readonly Operation[];
  /** Fragment names defined twice with different bodies. */
  readonly ambiguous: readonly string[];
  readonly bodyCount: number;
  readonly fragmentCount: number;
};

const spreadsIn = (node: DefinitionNode): string[] => {
  const names: string[] = [];
  visit(node, {
    FragmentSpread(spread) {
      names.push(spread.name.value);
    },
  });
  return names;
};

/**
 * URQL's `formatDocument` adds `__typename` to every selection set below the
 * operation root that lacks one, and graphcache depends on it. Those fields
 * are real field nodes on the wire, so they are costed here too — PlacesById's
 * 136 static field nodes are ~145 once they are added (see `MAX_FIELD_NODES`).
 */
const withTypenames = (document: DocumentNode): DocumentNode =>
  visit(document, {
    SelectionSet: {
      leave(selectionSet: SelectionSetNode, _key, parent) {
        if (
          parent !== undefined &&
          !Array.isArray(parent) &&
          (parent as { kind?: string }).kind === Kind.OPERATION_DEFINITION
        ) {
          return undefined;
        }
        const has = selectionSet.selections.some(
          (selection) =>
            selection.kind === Kind.FIELD &&
            selection.name.value === "__typename" &&
            selection.alias === undefined,
        );
        if (has) return undefined;
        return {
          ...selectionSet,
          selections: [
            ...selectionSet.selections,
            {
              kind: Kind.FIELD,
              name: { kind: Kind.NAME, value: "__typename" },
            },
          ],
        };
      },
    },
  });

/**
 * gql.tada's client-only directives. `@_unmask` tells gql.tada's *types* not
 * to mask a fragment; gql.tada strips it from the document it builds, so it
 * never reaches the server, and it is stripped here for the same reason.
 */
const CLIENT_ONLY_DIRECTIVES = new Set(["_unmask", "_optional", "_required"]);

const withoutClientDirectives = (document: DocumentNode): DocumentNode =>
  visit(document, {
    Directive(directive) {
      return CLIENT_ONLY_DIRECTIVES.has(directive.name.value)
        ? null
        : undefined;
    },
  });

/**
 * Each operation, with every fragment it reaches appended — which is what
 * gql.tada's composition puts on the wire.
 *
 * Fragments are joined by *name*. gql.tada joins them by reference, so two
 * modules could in principle each define a `CellarCard` and mean different
 * things; that would make a name join wrong, so it is reported as `ambiguous`
 * and fails the test rather than being resolved by guesswork.
 */
const compose = (bodies: readonly Body[]): Composed => {
  const fragments = new Map<string, FragmentDefinitionNode>();
  const fragmentText = new Map<string, string>();
  const ambiguous = new Set<string>();
  const operations: { node: OperationDefinitionNode; file: string }[] = [];

  for (const body of bodies) {
    for (const definition of parse(body.text).definitions) {
      if (definition.kind === Kind.FRAGMENT_DEFINITION) {
        const name = definition.name.value;
        const printed = JSON.stringify(definition, (key, value) =>
          key === "loc" ? undefined : value,
        );
        const earlier = fragmentText.get(name);
        if (earlier !== undefined && earlier !== printed) ambiguous.add(name);
        fragments.set(name, definition);
        fragmentText.set(name, printed);
      } else if (definition.kind === Kind.OPERATION_DEFINITION) {
        operations.push({ node: definition, file: body.file });
      }
    }
  }

  /** `root`, then every fragment it reaches, as one wire document. */
  const withReached = (root: DefinitionNode): DocumentNode => {
    const reached = new Set<string>();
    const pending = spreadsIn(root);
    while (pending.length > 0) {
      const name = pending.pop() ?? "";
      if (reached.has(name)) continue;
      reached.add(name);
      const fragment = fragments.get(name);
      if (fragment !== undefined) pending.push(...spreadsIn(fragment));
    }
    const definitions: DefinitionNode[] = [root];
    for (const name of [...reached].sort()) {
      const fragment = fragments.get(name);
      if (fragment !== undefined && fragment !== root) {
        definitions.push(fragment);
      }
    }
    return withoutClientDirectives(
      withTypenames({ kind: Kind.DOCUMENT, definitions }),
    );
  };

  const fragmentFile = new Map<string, string>();
  for (const body of bodies) {
    for (const definition of parse(body.text).definitions) {
      if (definition.kind === Kind.FRAGMENT_DEFINITION) {
        fragmentFile.set(definition.name.value, body.file);
      }
    }
  }

  return {
    ambiguous: [...ambiguous].sort(),
    bodyCount: bodies.length,
    fragmentCount: fragments.size,
    operations: operations.map(({ node, file }) => ({
      name: `${node.operation} ${node.name?.value ?? "(anonymous)"}`,
      file,
      document: withReached(node),
    })),
    fragments: [...fragments].map(([name, node]) => ({
      name: `fragment ${name}`,
      file: fragmentFile.get(name) ?? "unknown",
      document: withReached(node),
    })),
  };
};

/**
 * A fragment exported on its own is not a sendable document, so it is exempt
 * from the one rule about the document rather than the selection: that every
 * fragment in it is spread.
 */
const FRAGMENT_RULES = specifiedRules.filter(
  (rule) => rule !== NoUnusedFragmentsRule,
);

/** Every full-validation failure, as `name (file): message`. */
const invalid = (composed: Composed): string[] => [
  ...composed.operations.flatMap((operation) =>
    validate(schema, operation.document, specifiedRules).map(
      (error) => `${operation.name} (${operation.file}): ${error.message}`,
    ),
  ),
  ...composed.fragments.flatMap((fragment) =>
    validate(schema, fragment.document, FRAGMENT_RULES).map(
      (error) => `${fragment.name} (${fragment.file}): ${error.message}`,
    ),
  ),
];

/* -------------------------------------------------------------------------- */
/* The guards                                                                  */
/* -------------------------------------------------------------------------- */

describe("the harvest itself", () => {
  it("reads every spelling of graphql(), and reports what it cannot (negative control)", () => {
    const project = fixtureProject({
      root: `${CLIENT_SRC}/__fixture__`,
      files: {
        "renamed.ts": `import { graphql as gql } from "@cellar-assistant/schema"; export const Q = gql("query A { a }");`,
        "reexported.ts": `import { graphql } from "../lib/api/graphql.ts"; export const Q = graphql(\`query B { b }\`);`,
        "dynamic.ts": `import { graphql } from "@cellar-assistant/schema"; declare const body: string; export const Q = graphql(body);`,
        "value.ts": `import { graphql } from "@cellar-assistant/schema"; export const make = [graphql];`,
        "lookalike.ts": `const graphql = (s: string) => s; export const Q = graphql("not a document");`,
      },
      options: {
        ...FIXTURE_OPTIONS,
        noResolve: true,
        jsx: ts.JsxEmit.ReactJSX,
      },
      extraRoots: [SCHEMA_PKG_SRC, `${CLIENT_SRC}/lib/api`],
    });
    const { bodies, unreadable } = harvest(project);
    expect(bodies.map((b) => `${b.file} ${b.text}`).sort()).toEqual([
      "reexported.ts query B { b }",
      "renamed.ts query A { a }",
    ]);
    expect([...unreadable].sort()).toEqual(["dynamic.ts:1", "value.ts:1"]);
  });

  it("validates what it finds in full: a renamed import with a wrong argument fails (negative control)", () => {
    // The shape `documents.test.ts` in the client cannot see: it looks for
    // the identifier `graphql`. Every error here is one only the full rule
    // set catches — the old two rules (known fragments, fields on the type)
    // passed all three.
    const project = fixtureProject({
      root: `${CLIENT_SRC}/__fixture__`,
      files: {
        "renamed.ts": [
          `import { graphql as gql } from "@cellar-assistant/schema";`,
          'export const Q = gql(`query WrongArg { cellar(cellarId: "x") { __typename } }`);',
          "export const V = gql(`query WrongVar($id: Int!) { cellar(id: $id) { __typename } }`);",
          "export const F = gql(`fragment Unmasked on Cellar @_unmask { id nope: id }`);",
          "export const G = gql(`fragment Clash on Cellar { x: id x: name }`);",
        ].join("\n"),
      },
      options: {
        ...FIXTURE_OPTIONS,
        noResolve: true,
        jsx: ts.JsxEmit.ReactJSX,
      },
      extraRoots: [SCHEMA_PKG_SRC, `${CLIENT_SRC}/lib/api`],
    });
    const { bodies } = harvest(project);
    expect(bodies).toHaveLength(4);
    const errors = invalid(compose(bodies));
    expect(errors.join("\n")).toMatch(
      /query WrongArg \(renamed\.ts\): Unknown argument "cellarId"/,
    );
    expect(errors.join("\n")).toMatch(
      /query WrongVar \(renamed\.ts\): Variable "\$id" of type "Int!" used in position expecting type "ID!"/,
    );
    expect(errors.join("\n")).toMatch(
      /fragment Clash \(renamed\.ts\): Fields "x" conflict/,
    );
    // `@_unmask` is gql.tada's, stripped before the wire; not an error.
    expect(errors.join("\n")).not.toMatch(/Unmasked/);
  });
});

describe("the client's real documents against the real limits", () => {
  const { bodies, unreadable } = harvest();
  const composed = compose(bodies);

  it("finds the client's documents", () => {
    // If this drops, the harvest silently stopped seeing `graphql()` calls and
    // every assertion below would pass on an empty list. 116 operations were
    // measured at `5adc5f64`; the floor leaves room for the client to shrink
    // without leaving room for the harvest to go blind.
    expect(composed.operations.length).toBeGreaterThan(100);
    expect(composed.fragmentCount).toBeGreaterThan(20);
  });

  it("can read every document from source", () => {
    expect(
      unreadable,
      "these graphql() calls do not take a plain literal, so this test cannot " +
        "cost them — write the document as a literal, or teach the harvest",
    ).toEqual([]);
  });

  it("joins fragments by name without ambiguity", () => {
    expect(composed.ambiguous).toEqual([]);
  });

  it("validates every operation and fragment in full against the API's schema", () => {
    // Full `specifiedRules`, what Yoga runs: unknown arguments, variable
    // types, fields that cannot merge — not only the two rules a cost is
    // built on (costing a document the schema does not recognise
    // under-counts it: `pageSizeOf` treats an unknown field as unpaged). The
    // schema is the one `schema.test.ts` holds equal to `schema.graphql`.
    expect(composed.fragments.length).toBe(composed.fragmentCount);
    expect(invalid(composed)).toEqual([]);
  });

  it("refuses none of them", () => {
    const refused = composed.operations.flatMap((operation) =>
      validate(schema, operation.document, [
        queryCostRule(DEFAULT_COST_LIMITS),
      ]).map(
        (error) => `${operation.name} (${operation.file}): ${error.message}`,
      ),
    );
    expect(refused).toEqual([]);
  });

  it("parses every one under the token bound", () => {
    // The one limit that is not a validation rule: `maxTokens` runs inside
    // `parse`, on the composed wire document, before anything above sees it.
    const tooLong = composed.operations.filter((operation) => {
      try {
        parse(print(operation.document), {
          maxTokens: DEFAULT_COST_LIMITS.maxParseTokens,
        });
        return false;
      } catch {
        return true;
      }
    });
    expect(tooLong.map((operation) => operation.name)).toEqual([]);
  });

  it("names every operation, so a refusal can say which", () => {
    const anonymous = composed.operations.filter((operation) =>
      operation.name.endsWith("(anonymous)"),
    );
    expect(anonymous.map((operation) => operation.file)).toEqual([]);
  });
});
