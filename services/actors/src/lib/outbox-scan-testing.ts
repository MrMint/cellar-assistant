/**
 * The containment half of the outbox allow-list (§1.4, §8.5): a static scan of
 * `services/actors/src` for `enqueueOutbox` / `enqueueOutboxOnce` call sites,
 * the pair(s) each one's handle names, and the shape of its `targetId`.
 *
 * Test-support, not runtime — nothing in `services/actors` imports it but
 * `outbox-targets.test.ts`, and its name ends in `testing.ts` so the scans
 * (this one and `packages/db`'s writers scan) skip it. The *registry* it
 * checks against (`./outbox-targets.ts`) is plain data and is imported at
 * runtime by `OutboxActor`, which is why the two are separate files.
 *
 * ## What the types already hold, and so this does not
 *
 * Each enqueue names a typed handle, so *which* pairs exist, that each names a
 * real method, and what payload it takes are compile errors
 * (`./outbox-targets.ts`, "Handles"). What no type can say is **which module**
 * enqueues a pair and **whose id** it enqueues it on — and those are the two
 * things E5a's holes were. This scan exists for them.
 *
 * ## Reading the handle
 *
 * A call's second argument is read by its **type**, through the checker: each
 * handle's type carries its own literal `key`, so `OUTBOX_TARGETS["A.m"]` is
 * `"A.m"`, and a parameter or `const` typed `(typeof OUTBOX_TARGETS)["A.m" |
 * "B.n"]` is exactly those two. `MaintenanceActor.armCycle` and
 * `JobActor.scheduleBatch` are the two sites that choose a handle at runtime.
 * A handle whose key is not a literal (`OutboxTarget` unparameterised, `any`)
 * is reported with `pairs: null`, and the test refuses it.
 *
 * ## Finding the calls: by symbol, and closed on anything else
 *
 * Calls are found by symbol identity (`@cellar-assistant/analysis`,
 * `findCalls`): a renamed import, a namespace import of `lib/outbox.ts` and a
 * call through a re-export are all the same function to the checker, and a
 * local that merely shares the name is not. Every *other* reference to either
 * function — `.call`/`.apply`/`.bind`, passing it as a callback, storing it,
 * `ns[name]`, a re-export, a dynamic `import()` — is a {@link Finding} in
 * `unclassified`, and the test requires there to be none: the module that
 * calls the function is the module containment judges, so a call the scan
 * cannot see is a module nobody is checking. (Re-exports are followed, and
 * refused anyway: a second name for the function is a surface nobody asked
 * for.)
 *
 * ## `targetId`
 *
 * What matters is whether the scan can see that it is the enqueuing actor's
 * own key — `this.key` — a constant (a literal, or a `const` the checker
 * resolves through its binding, imports included), or some other expression,
 * whose provenance only a human can state.
 */
import {
  enclosingName,
  type Finding,
  findCalls,
  firstLineOf,
  lineOf,
  literalValue,
  type Project,
  propertyLiterals,
  relativePath,
  sourceFiles,
  unwrapExpression,
} from "@cellar-assistant/analysis";
import ts from "typescript";
import { ACTORS_SRC, actorsProject } from "./analysis-testing.ts";

export { ACTORS_SRC, actorsProject } from "./analysis-testing.ts";

/** The two functions that write an `outbox` row. */
export const ENQUEUE_FUNCTIONS: readonly string[] = [
  "enqueueOutbox",
  "enqueueOutboxOnce",
];

/** Where they live, relative to the scanned root. */
export const OUTBOX_MODULE = "lib/outbox.ts";

export type TargetIdShape = "self" | "constant" | "expression";

export type EnqueueSite = {
  /** Relative to the scanned root, `/`-separated. */
  readonly file: string;
  readonly line: number;
  /** Which of the two functions. */
  readonly fn: string;
  /** The enclosing function, as `Class.method` or a function name. */
  readonly enclosing: string;
  /**
   * The `"Actor.method"` keys the handle can be, sorted — or `null` when its
   * type does not pin them (module doc, "Reading the handle").
   */
  readonly pairs: readonly string[] | null;
  readonly targetId: TargetIdShape;
  readonly handleText: string;
  readonly targetIdText: string;
};

export type OutboxScan = {
  readonly sites: EnqueueSite[];
  /** References to the enqueue functions that are not readable calls. */
  readonly unclassified: Finding[];
};

/** The keys a handle's type pins, sorted; `null` if it pins none. */
const pairsOf = (
  checker: ts.TypeChecker,
  handle: ts.Expression | undefined,
): string[] | null => {
  if (handle === undefined) return null;
  const keys = propertyLiterals(
    checker,
    checker.getTypeAtLocation(unwrapExpression(handle)),
    "key",
  );
  if (keys === null || keys.some((key) => typeof key !== "string")) {
    return null;
  }
  return (keys as string[]).sort();
};

/** The `delivery` argument's `targetId`, when it is an object literal. */
const targetIdOf = (
  delivery: ts.Expression | undefined,
): ts.Expression | undefined => {
  if (delivery === undefined) return undefined;
  const object = unwrapExpression(delivery);
  if (!ts.isObjectLiteralExpression(object)) return undefined;
  for (const property of object.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === "targetId"
    ) {
      return property.initializer;
    }
    if (
      ts.isShorthandPropertyAssignment(property) &&
      property.name.text === "targetId"
    ) {
      return property.name;
    }
  }
  return undefined;
};

const shapeOf = (
  checker: ts.TypeChecker,
  node: ts.Expression | undefined,
): TargetIdShape => {
  if (node === undefined) return "expression";
  const expression = unwrapExpression(node);
  if (
    ts.isPropertyAccessExpression(expression) &&
    expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
    ts.isIdentifier(expression.name) &&
    expression.name.text === "key"
  ) {
    return "self";
  }
  return bindingLiteral(checker, expression) === undefined
    ? "expression"
    : "constant";
};

/**
 * `literalValue`, except for shorthand `{ targetId }`: there the node is the
 * property's *name*, whose type is the object literal's (widened to `string`
 * by `OutboxDelivery`), so it never read as a literal and every shorthand
 * site was classed `expression` — hiding an over-broad provenance
 * declaration behind it. Read the binding it abbreviates instead, and only
 * a `const` one: a `let` can be reassigned, so it stays an expression.
 */
const bindingLiteral = (
  checker: ts.TypeChecker,
  expression: ts.Expression,
): ReturnType<typeof literalValue> => {
  const parent = expression.parent;
  if (
    parent === undefined ||
    !ts.isShorthandPropertyAssignment(parent) ||
    parent.name !== expression
  ) {
    return literalValue(checker, expression);
  }
  const declaration =
    checker.getShorthandAssignmentValueSymbol(parent)?.valueDeclaration;
  if (
    declaration === undefined ||
    !ts.isVariableDeclaration(declaration) ||
    declaration.initializer === undefined ||
    (ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const) === 0
  ) {
    return undefined;
  }
  return literalValue(checker, declaration.initializer);
};

/**
 * Every enqueue under `root` (`services/actors/src` by default) in `project`.
 * A fixture passes its own project and root, with a stub `lib/outbox.ts`.
 */
export const scanOutbox = (
  project: Project = actorsProject(),
  root: string = ACTORS_SRC,
): OutboxScan => {
  const module = `${root}/${OUTBOX_MODULE}`;
  const { calls, refusals } = findCalls(
    project,
    ENQUEUE_FUNCTIONS.map((name) => ({ module, name })),
    {
      rule: "outbox/unreadable-reference",
      files: sourceFiles(project, { under: root }),
    },
  );
  const sites = calls.map(({ target, call, args }): EnqueueSite => {
    const handle = args[1];
    const idNode = targetIdOf(args[2]);
    return {
      file: relativePath(root, call.getSourceFile().fileName),
      line: lineOf(call),
      fn: target,
      enclosing: enclosingName(call),
      pairs: pairsOf(project.checker, handle),
      targetId: shapeOf(project.checker, idNode),
      handleText: firstLineOf(handle),
      targetIdText: firstLineOf(idNode),
    };
  });
  return { sites, unclassified: refusals };
};
