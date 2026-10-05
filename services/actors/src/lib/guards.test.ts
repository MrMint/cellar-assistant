/**
 * The caller gates in `./guards.ts`: who each one admits, cell by cell, and a
 * scan that keeps them the only spelling.
 */
import {
  assertNoFindings,
  type ExportTarget,
  exportedSymbol,
  type Finding,
  findingAt,
  firstLineOf,
  isLoaded,
  PROGRAM_TIMEOUT_MS,
  type Project,
  referencedSymbol,
  sourceFiles,
  unwrapExpression,
} from "@cellar-assistant/analysis";
import type { Ctx } from "@cellar-assistant/contracts";
import {
  ActorError,
  adminCtx,
  anonymousCtx,
  systemCtx,
  userCtx,
} from "@cellar-assistant/contracts";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ACTORS_SRC,
  actorsFixture,
  actorsProject,
  CONTRACTS_SRC,
  POLICY_SRC,
} from "./analysis-testing.ts";
import {
  requireAdmin,
  requirePrivileged,
  requireSignedIn,
  requireSystem,
  requireViewer,
} from "./guards.ts";

const VIEWER = "00000000-0000-4000-8000-000000000001";

const CALLERS = {
  anonymous: anonymousCtx("r"),
  user: userCtx(VIEWER, "r"),
  admin: adminCtx(VIEWER, "r"),
  system: systemCtx("r"),
} as const satisfies Record<string, Ctx>;

type Caller = keyof typeof CALLERS;

/** `null` = admitted; otherwise the refusal's `code`. */
type Row = Record<Caller, string | null>;

const run = (guard: (ctx: Ctx) => unknown, ctx: Ctx): string | null => {
  try {
    guard(ctx);
    return null;
  } catch (error) {
    if (error instanceof ActorError) return error.code;
    throw error;
  }
};

/** The table in the module doc of `./guards.ts`, as data. */
const TABLE: Record<string, { guard: (ctx: Ctx) => unknown; row: Row }> = {
  requireSignedIn: {
    guard: (ctx) => requireSignedIn(ctx, "x"),
    row: { anonymous: "FORBIDDEN", user: null, admin: null, system: null },
  },
  requireViewer: {
    guard: (ctx) => requireViewer(ctx, "x"),
    row: {
      anonymous: "FORBIDDEN",
      user: null,
      admin: null,
      system: "VALIDATION",
    },
  },
  requirePrivileged: {
    guard: (ctx) => requirePrivileged(ctx, "x"),
    row: {
      anonymous: "FORBIDDEN",
      user: "FORBIDDEN",
      admin: null,
      system: null,
    },
  },
  requireSystem: {
    guard: (ctx) => requireSystem(ctx, "x"),
    row: {
      anonymous: "FORBIDDEN",
      user: "FORBIDDEN",
      admin: "FORBIDDEN",
      system: null,
    },
  },
  requireAdmin: {
    guard: (ctx) => requireAdmin(ctx, "x"),
    row: {
      anonymous: "FORBIDDEN",
      user: "FORBIDDEN",
      admin: null,
      system: "FORBIDDEN",
    },
  },
};

describe("who each guard admits", () => {
  for (const [name, { guard, row }] of Object.entries(TABLE)) {
    it(name, () => {
      const actual = Object.fromEntries(
        (Object.keys(CALLERS) as Caller[]).map((caller) => [
          caller,
          run(guard, CALLERS[caller]),
        ]),
      );
      expect(actual).toEqual(row);
    });
  }

  it("returns the viewer from the two that name one", () => {
    expect(requireSignedIn(CALLERS.user, "x")).toBe(VIEWER);
    expect(requireSignedIn(CALLERS.system, "x")).toBeNull();
    expect(requireViewer(CALLERS.admin, "x")).toBe(VIEWER);
  });

  it("words the refusals the way the call sites rely on", () => {
    expect(() => requireSignedIn(CALLERS.anonymous, "view a place")).toThrow(
      "sign in to view a place",
    );
    expect(() => requireViewer(CALLERS.system, "vote")).toThrow(
      "vote needs a viewer to attribute it to",
    );
    expect(() => requirePrivileged(CALLERS.user, "outbox only")).toThrow(
      "outbox only",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* The only spelling                                                           */
/* -------------------------------------------------------------------------- */

const PROJECT = actorsProject();
const SCANNED = sourceFiles(PROJECT, {
  under: [`${ACTORS_SRC}/actors`, `${ACTORS_SRC}/lib`],
  exclude: (file) => file === "lib/guards.ts",
  // The harnesses too: a copy of a gate in lib/testing.ts is still a copy.
  includeHarness: true,
});

/**
 * A private or module-level helper whose name says it gates the caller by
 * kind — every spelling the codebase used before `./guards.ts` (`#requireSignedIn`,
 * `#requireSystem`, `#requireSystemOrAdmin`, `#requireOutboxOrAdmin`,
 * `#requireAdmin`, `#requireViewer`, `requireAdmin`) and the obvious next
 * ones.
 */
const BANNED_GUARD_NAME =
  /^#?(require|assert|ensure)(SignedIn|Viewer|Privileged|System|Admin|Outbox)(Or(Admin|System))?$/;

/** The caller-kind predicates whose negation, thrown on, is a guard. */
const KIND_PREDICATES: readonly ExportTarget[] = [
  { module: `${POLICY_SRC}/index.ts`, name: "bypassesPolicy" },
  { module: `${CONTRACTS_SRC}/ctx.ts`, name: "isSystem" },
  { module: `${CONTRACTS_SRC}/ctx.ts`, name: "isAdmin" },
];
const PREDICATE_NAMES = new Set(KIND_PREDICATES.map((target) => target.name));

/**
 * Parsed and resolved, not grepped, so a comment explaining the rule never
 * trips it.
 *
 * Two shapes are refused:
 *
 *  1. a declaration (method, private method, function, `const`) named like a
 *     caller gate — {@link BANNED_GUARD_NAME};
 *  2. `if (!bypassesPolicy(ctx)) throw …` — or `!isSystem`, `!isAdmin` — as a
 *     bare `throw` or a block that *starts* with one. A block that starts with
 *     anything else is a data decision (`ItemActor.updateGeneric` picks a
 *     creator rule; `PlaceActor.enrichFromGoogle` queues instead of spending)
 *     and stays legal, as does every non-negated use.
 *
 * The predicate is recognised by **symbol** — a renamed import, a namespace
 * member, or a `const` bound to one is the predicate — and, as before, by
 * name, so a local re-implementation called `isSystem` is still caught.
 */
const scanGuardSpellings = (
  project: Project,
  files: readonly ts.SourceFile[],
): Finding[] => {
  const { checker } = project;
  const predicates = new Set(
    KIND_PREDICATES.filter((target) => isLoaded(project, target)).map(
      (target) => exportedSymbol(project, target),
    ),
  );
  const isPredicate = (callee: ts.Expression): boolean => {
    const expression = unwrapExpression(callee);
    const name = ts.isPropertyAccessExpression(expression)
      ? expression.name
      : expression;
    if (!ts.isIdentifier(name)) return false;
    if (PREDICATE_NAMES.has(name.text)) return true;
    const symbol = referencedSymbol(checker, name);
    if (symbol === undefined) return false;
    if (predicates.has(symbol)) return true;
    // `const sys = isSystem` — one hop through a const binding.
    const declaration = symbol.valueDeclaration;
    return (
      declaration !== undefined &&
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer !== undefined &&
      isPredicate(declaration.initializer)
    );
  };
  const isNegatedKindCheck = (expr: ts.Expression): boolean => {
    const unwrapped = unwrapExpression(expr);
    if (
      !ts.isPrefixUnaryExpression(unwrapped) ||
      unwrapped.operator !== ts.SyntaxKind.ExclamationToken
    ) {
      return false;
    }
    const operand = unwrapExpression(unwrapped.operand);
    return ts.isCallExpression(operand) && isPredicate(operand.expression);
  };
  const startsWithThrow = (statement: ts.Statement): boolean =>
    ts.isThrowStatement(statement) ||
    (ts.isBlock(statement) &&
      statement.statements[0] !== undefined &&
      ts.isThrowStatement(statement.statements[0]));

  const findings: Finding[] = [];
  for (const file of files) {
    const visit = (node: ts.Node): void => {
      if (
        (ts.isMethodDeclaration(node) ||
          ts.isFunctionDeclaration(node) ||
          ts.isVariableDeclaration(node)) &&
        node.name !== undefined &&
        BANNED_GUARD_NAME.test(node.name.getText())
      ) {
        findings.push(
          findingAt(
            project,
            node,
            "guards/private-copy",
            `\`${node.name.getText()}\` is a caller gate by name — use ./guards.ts`,
          ),
        );
      }
      if (
        ts.isIfStatement(node) &&
        isNegatedKindCheck(node.expression) &&
        startsWithThrow(node.thenStatement)
      ) {
        findings.push(
          findingAt(
            project,
            node,
            "guards/inline-gate",
            `${firstLineOf(node)} — an inline caller gate; use ./guards.ts`,
          ),
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return findings;
};

/** Scans `text` as one module of a fixture overlaid on `src/`. */
const probe = (text: string): Finding[] => {
  const project = actorsFixture({ "probe.ts": text });
  return scanGuardSpellings(project, sourceFiles(project));
};

describe("guards.ts is the only spelling of a caller gate", () => {
  // Checking is lazy: loading PROJECT above paid for parsing, and this scan
  // pays for the checker. Once, under a timeout sized for CPU
  // (PROGRAM_TIMEOUT_MS says why).
  let tree: Finding[] = [];
  beforeAll(() => {
    tree = scanGuardSpellings(PROJECT, SCANNED);
  }, PROGRAM_TIMEOUT_MS);

  it("scans the actors and lib trees at all", () => {
    expect(SCANNED.length).toBeGreaterThan(80);
  });

  it("finds no private copy or inline gate under src/actors or src/lib", () => {
    assertNoFindings(tree);
  });

  // The scanner must see the shapes it exists to refuse, or the test above
  // passes by seeing nothing.
  it.each([
    [
      "a private copy",
      "export class A { #requireSystem(ctx: unknown) { return ctx; } }",
    ],
    [
      "a renamed copy",
      "export class A { #requireSystemOrAdmin(ctx: unknown, m: string) { return [ctx, m]; } }",
    ],
    [
      "a module-level copy",
      "export const requireAdmin = (ctx: unknown, what: string) => [ctx, what];",
    ],
    [
      "an inline throw",
      `import { bypassesPolicy } from "@cellar-assistant/policy";
       import type { Ctx } from "@cellar-assistant/contracts";
       export function f(ctx: Ctx) { if (!bypassesPolicy(ctx)) throw new Error('x'); }`,
    ],
    [
      "an inline block",
      `import { isSystem } from "@cellar-assistant/contracts";
       import type { Ctx } from "@cellar-assistant/contracts";
       export function f(ctx: Ctx) { if (!isSystem(ctx)) { throw new Error('x'); } }`,
    ],
    [
      "a renamed import",
      `import { isSystem as sys, type Ctx } from "@cellar-assistant/contracts";
       export function f(ctx: Ctx) { if (!sys(ctx)) throw new Error('x'); }`,
    ],
    [
      "a namespace member",
      `import * as c from "@cellar-assistant/contracts";
       export function f(ctx: c.Ctx) { if (!(c.isAdmin(ctx))) { throw new Error('x'); } }`,
    ],
    [
      "a const bound to the predicate",
      `import { isAdmin, type Ctx } from "@cellar-assistant/contracts";
       const admin = isAdmin;
       export function f(ctx: Ctx) { if (!admin(ctx)) throw new Error('x'); }`,
    ],
    [
      "a local re-implementation under the name",
      `export function f(ctx: { kind: string }) {
         const isSystem = (c: { kind: string }) => c.kind === "system";
         if (!isSystem(ctx)) throw new Error('x');
       }`,
    ],
  ])("flags %s", (_what, text) => {
    expect(probe(text)).toHaveLength(1);
  });

  it.each([
    [
      "a data decision",
      `import { bypassesPolicy } from "@cellar-assistant/policy";
       import type { Ctx } from "@cellar-assistant/contracts";
       declare function queue(): void;
       export function f(ctx: Ctx) { if (!bypassesPolicy(ctx)) { queue(); return; } }`,
    ],
    [
      "a positive check",
      `import { bypassesPolicy } from "@cellar-assistant/policy";
       import type { Ctx } from "@cellar-assistant/contracts";
       export function f(ctx: Ctx) { if (bypassesPolicy(ctx)) return; }`,
    ],
    [
      "an aggregate gate",
      "export class A { #requireOwner(ctx: unknown) { return ctx; } }",
    ],
    [
      "a key gate",
      "export class A { #requireViewerKey(ctx: unknown) { return ctx; } }",
    ],
    [
      "a call to the guard",
      `import { requirePrivileged } from "../lib/guards.ts";
       import type { Ctx } from "@cellar-assistant/contracts";
       export const f = (ctx: Ctx) => requirePrivileged(ctx, 'x');`,
    ],
  ])("leaves %s alone", (_what, text) => {
    expect(probe(text)).toEqual([]);
  });
});
