/**
 * Every call of an exported function, found by *symbol identity* — and every
 * reference to it the scan cannot read as a call, reported rather than
 * dropped.
 *
 * A syntactic scan looks for the function's *name*, so it is walked around
 * by `import { f as g }`, `import * as ns`, `export { f } from`, a barrel,
 * or a local that happens to share the name. Here each identifier is asked
 * of the checker, aliases are followed to the declaration, and the answer is
 * compared with the target's own symbol: a call is found however it is
 * spelled, and a same-named function that is *not* the target is not.
 *
 * What the checker cannot give a scan is the call's *arguments* when the
 * function escapes as a value — `f.call(…)`, `run(f)`, `const g = f`,
 * `ns[name]`, `await import("./m.ts")`. Those are {@link Finding}s under the
 * caller's rule: a call nobody can see is a module nobody is checking, so
 * the conservative reading is to refuse it and make the author write the call
 * plainly.
 */
import { existsSync } from "node:fs";
import ts from "typescript";
import { normalizePath, sourceFiles } from "./files.ts";
import { type Finding, findingAt } from "./findings.ts";
import type { Project } from "./project.ts";
import { inTypePosition, resolveAlias } from "./values.ts";

/** An export of a module: `{ module: "/abs/lib/outbox.ts", name: "enqueueOutbox" }`. */
export type ExportTarget = { readonly module: string; readonly name: string };

export type CallLike =
  | ts.CallExpression
  | ts.NewExpression
  | ts.TaggedTemplateExpression;

export type CallSite = {
  /** The export name of the target called. */
  readonly target: string;
  readonly call: CallLike;
  /** The call's arguments; empty for a tagged template. */
  readonly args: readonly ts.Expression[];
  /** The identifier that named the target: `f`, `g` (an alias), `ns.f`'s `f`. */
  readonly callee: ts.Identifier;
};

export type ReferenceScan = {
  readonly calls: CallSite[];
  /** References that are not readable calls. Empty means nothing escaped. */
  readonly refusals: Finding[];
};

export type ReferenceOptions = {
  /** Rule id for refusals. */
  readonly rule: string;
  /** The files to scan; {@link sourceFiles} of the project by default. */
  readonly files?: readonly ts.SourceFile[];
  /**
   * Re-exports (`export { f } from`, `export * from`) are followed by the
   * checker, so a call through one is still found. Refuse them anyway (the
   * default) when the rule is about *which module* calls, and a second name
   * for the function is a surface nobody asked for.
   */
  readonly allowReexports?: boolean;
};

/** The symbol a module exports as `name`, aliases resolved. */
export const exportedSymbol = (
  project: Project,
  target: ExportTarget,
): ts.Symbol => {
  const module = moduleSymbol(project, target.module);
  const exported = project.checker
    .getExportsOfModule(module)
    .find((symbol) => symbol.name === target.name);
  if (exported === undefined) {
    throw new Error(`${target.module} exports no \`${target.name}\``);
  }
  return resolveAlias(project.checker, exported);
};

/**
 * Whether the program loaded the target's module. A module that exists but
 * that nothing in the program imports cannot be referenced, so a scan has
 * nothing to find — which is the normal case for a small fixture. A module
 * that does not exist at all is a mistake in the scan, and throws.
 */
export const isLoaded = (project: Project, target: ExportTarget): boolean => {
  if (project.program.getSourceFile(normalizePath(target.module))) return true;
  if (!existsSync(target.module)) {
    throw new Error(`${target.module} does not exist`);
  }
  return false;
};

/** The module symbol of a file in the program. */
export const moduleSymbol = (project: Project, path: string): ts.Symbol => {
  const file = project.program.getSourceFile(normalizePath(path));
  if (file === undefined) {
    throw new Error(`${path} is not in the program`);
  }
  const symbol = project.checker.getSymbolAtLocation(file);
  if (symbol === undefined) {
    throw new Error(`${path} is not a module (no imports or exports)`);
  }
  return symbol;
};

/**
 * The symbol a name refers to, aliases followed — for an identifier in any
 * position, including `{ f }` shorthand (the *value* `f`, not the property).
 */
export const referencedSymbol = (
  checker: ts.TypeChecker,
  node: ts.Node,
): ts.Symbol | undefined => {
  const parent = node.parent;
  const symbol =
    parent !== undefined &&
    ts.isShorthandPropertyAssignment(parent) &&
    parent.name === node
      ? checker.getShorthandAssignmentValueSymbol(parent)
      : checker.getSymbolAtLocation(node);
  return symbol === undefined ? undefined : resolveAlias(checker, symbol);
};

/** Climbs through `(…)`, `!`, `as`, `satisfies` from `node`. */
const outermost = (node: ts.Expression): ts.Expression => {
  let current = node;
  for (;;) {
    const parent = current.parent;
    if (
      parent !== undefined &&
      (ts.isParenthesizedExpression(parent) ||
        ts.isNonNullExpression(parent) ||
        ts.isAsExpression(parent) ||
        ts.isSatisfiesExpression(parent))
    ) {
      current = parent;
    } else {
      return current;
    }
  }
};

/** The call `expression` is the callee of, if it is one. */
export const callOf = (expression: ts.Expression): CallLike | undefined => {
  const outer = outermost(expression);
  const parent = outer.parent;
  if (parent === undefined) return undefined;
  if (
    (ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
    parent.expression === outer
  ) {
    return parent;
  }
  if (ts.isTaggedTemplateExpression(parent) && parent.tag === outer) {
    return parent;
  }
  return undefined;
};

const INDIRECT = new Set(["call", "apply", "bind"]);

const isBindingIntroduction = (node: ts.Identifier): boolean => {
  const parent = node.parent;
  return (
    ts.isImportSpecifier(parent) ||
    ts.isImportClause(parent) ||
    ts.isNamespaceImport(parent) ||
    ts.isImportEqualsDeclaration(parent)
  );
};

/** `node` is the name a declaration declares (not a use of it). */
const isDeclarationName = (node: ts.Identifier): boolean => {
  const parent = node.parent;
  return (
    (ts.isFunctionDeclaration(parent) ||
      ts.isVariableDeclaration(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isPropertyAssignment(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isParameter(parent) ||
      ts.isEnumMember(parent)) &&
    parent.name === node
  );
};

export type Reference = {
  /** The export name of the target referred to. */
  readonly target: string;
  /** The identifier (or `["name"]` literal) that refers to it. */
  readonly node: ts.Identifier | ts.StringLiteralLike;
};

/**
 * Every place the `targets` are *named*, by symbol: imports, re-exports,
 * type positions, calls, values — anything whose symbol, aliases followed, is
 * a target. For "which files may mention X" rules, where a use of any kind
 * is the thing being fenced; a same-named unrelated binding is not a use, and
 * a renamed import is.
 */
export const findReferences = (
  project: Project,
  targets: readonly ExportTarget[],
  options: { readonly files?: readonly ts.SourceFile[] } = {},
): Reference[] => {
  const { checker } = project;
  const bySymbol = new Map<ts.Symbol, string>();
  for (const target of targets) {
    if (!isLoaded(project, target)) continue;
    bySymbol.set(exportedSymbol(project, target), target.name);
  }
  const out: Reference[] = [];
  for (const file of options.files ?? sourceFiles(project)) {
    const visit = (node: ts.Node): void => {
      if (
        ts.isIdentifier(node) ||
        (ts.isStringLiteralLike(node) &&
          ts.isElementAccessExpression(node.parent) &&
          node.parent.argumentExpression === node)
      ) {
        const symbol = referencedSymbol(checker, node);
        const name = symbol === undefined ? undefined : bySymbol.get(symbol);
        if (name !== undefined) out.push({ target: name, node });
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return out;
};

/**
 * Every call of the `targets`, and every reference to one that is not a
 * readable call, across `options.files`.
 */
export const findCalls = (
  project: Project,
  targets: readonly ExportTarget[],
  options: ReferenceOptions,
): ReferenceScan => {
  const { checker } = project;
  const bySymbol = new Map<ts.Symbol, string>();
  const modules = new Map<ts.Symbol, string>();
  for (const target of targets) {
    if (!isLoaded(project, target)) continue;
    bySymbol.set(exportedSymbol(project, target), target.name);
    modules.set(moduleSymbol(project, target.module), target.module);
  }
  const files = options.files ?? sourceFiles(project);
  const calls: CallSite[] = [];
  const refusals: Finding[] = [];
  const refuse = (node: ts.Node, message: string): void => {
    refusals.push(findingAt(project, node, options.rule, message));
  };
  const moduleOf = (specifier: ts.Expression): string | undefined => {
    const symbol = checker.getSymbolAtLocation(specifier);
    return symbol === undefined ? undefined : modules.get(symbol);
  };
  const shortName = (module: string): string =>
    module.split("/").slice(-2).join("/");

  const classifyTarget = (node: ts.Identifier, name: string): void => {
    const parent = node.parent;
    if (isBindingIntroduction(node) || isDeclarationName(node)) return;
    if (inTypePosition(node)) return;
    if (ts.isExportSpecifier(parent)) {
      // `export { f as g }`: both identifiers resolve to `f`; judge it once.
      if (node !== (parent.propertyName ?? parent.name)) return;
      if (options.allowReexports === true) return;
      refuse(
        parent,
        `re-exports \`${name}\`: every module importing it from here reaches ` +
          "it under a second name — import it from where it is defined",
      );
      return;
    }
    if (ts.isBindingElement(parent)) {
      refuse(
        parent,
        `\`${name}\` is destructured into a local, so its calls are not ` +
          "calls of it — call it by its import",
      );
      return;
    }
    const expression =
      ts.isPropertyAccessExpression(parent) && parent.name === node
        ? parent
        : node;
    const call = callOf(expression);
    if (call !== undefined) {
      calls.push({
        target: name,
        call,
        args: ts.isTaggedTemplateExpression(call)
          ? []
          : [...(call.arguments ?? [])],
        callee: node,
      });
      return;
    }
    const outer = outermost(expression);
    if (
      ts.isPropertyAccessExpression(outer.parent) &&
      outer.parent.expression === outer &&
      INDIRECT.has(outer.parent.name.text)
    ) {
      refuse(
        outer.parent,
        `\`${name}\` is referenced without being called — ` +
          `\`.${outer.parent.name.text}\` hides its arguments from the scan`,
      );
      return;
    }
    refuse(
      node,
      `\`${name}\` is referenced without being called — passed as a value, ` +
        "stored or rebound — so what it is called with is not in this " +
        "expression",
    );
  };

  const classifyNamespace = (node: ts.Identifier, module: string): void => {
    const parent = node.parent;
    if (isBindingIntroduction(node) || inTypePosition(node)) return;
    if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
      return; // `ns.f` — the member is judged on its own.
    }
    if (ts.isExportSpecifier(parent) && options.allowReexports === true) {
      return;
    }
    refuse(
      node,
      `\`${node.text}\` is ${shortName(module)}'s namespace, used as a value: ` +
        "the scan follows `ns.f(…)` and nothing else",
    );
  };

  for (const file of files) {
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node)) {
        const symbol = referencedSymbol(checker, node);
        if (symbol !== undefined) {
          const name = bySymbol.get(symbol);
          if (name !== undefined) classifyTarget(node, name);
          const module = modules.get(symbol);
          if (module !== undefined) classifyNamespace(node, module);
        }
      } else if (
        ts.isElementAccessExpression(node) &&
        ts.isStringLiteralLike(node.argumentExpression)
      ) {
        const symbol = referencedSymbol(checker, node.argumentExpression);
        const name = symbol === undefined ? undefined : bySymbol.get(symbol);
        if (name !== undefined) {
          refuse(
            node,
            `\`[${JSON.stringify(name)}]\` reaches \`${name}\` by computed ` +
              "name — write it as a plain call",
          );
        }
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] !== undefined
      ) {
        const module = moduleOf(node.arguments[0]);
        if (module !== undefined) {
          refuse(
            node,
            `a dynamic import of ${shortName(module)} hands its exports to ` +
              "whatever holds the promise, where the scan cannot follow them",
          );
        }
      } else if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier !== undefined &&
        (node.exportClause === undefined ||
          ts.isNamespaceExport(node.exportClause)) &&
        options.allowReexports !== true
      ) {
        const module = moduleOf(node.moduleSpecifier);
        if (module !== undefined) {
          refuse(
            node,
            `re-exports ${shortName(module)} wholesale, so its exports can be ` +
              "imported from here under a second name",
          );
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return { calls, refusals };
};
