/**
 * **`MODEL_BACKED_FIELDS` is derived from source, not remembered.**
 *
 * ## The failure this exists to stop
 *
 * `MAX_MODEL_BACKED_FIELDS` bounds how many model inferences one GraphQL
 * operation may start. It is only as good as the list of fields it counts,
 * and that list was written by hand — three search fields — and went stale
 * without anything noticing:
 *
 *  - `placeSearch` embeds its query on every call (`PlaceSearchActor` →
 *    `EmbeddingActor.embed`), and 25 aliased copies passed;
 *  - one request with 8 aliased `createRecipe` produced 8 embedding calls,
 *    through the `regenerateVector` each one enqueues, and the root-field
 *    limit would have allowed 30;
 *  - `startItemOnboarding` runs a vision model inside the request, and
 *    `createPlace` an LLM review.
 *
 * Each was found by someone reading actors. This test does the reading.
 *
 * ## How
 *
 * Two static passes over the TypeScript AST, joined in the middle:
 *
 * 1. **Actors.** The seven model seams are whatever the `SEAMS` table
 *    (`services/actors/src/lib/ai/install.ts`) installs — cross-checked
 *    against `MODEL_SPENDERS`, the budget's list of the same seven — and each
 *    seam is reached through the getter beside its setter. From every public
 *    method of every registered actor, the pass follows `this.` calls and
 *    fields (constructor-parameter defaults included, which is how every
 *    actor is handed its seam), module-level helpers across imports,
 *    typed actor-client hops (`internal(ctx)(Descriptor, id).method(…)`)
 *    and literal `invokeActorMethod` ones, and `enqueueOutbox` targets — so
 *    work an actor *enqueues* counts the same as work it does inline. The result is the set
 *    of actor methods that can reach a model, each with a witness path.
 *
 * 2. **API.** Every `context.actor(Descriptor, …).method(…)` call in
 *    `src/schema/` is attributed to the field whose resolver makes it,
 *    through module-level helpers where there are any.
 *
 * A field is model-backed when its resolver calls a model-reaching actor
 * method. The set this derives must equal `MODEL_BACKED_FIELDS`, down to the
 * `via` each entry names — both directions, so a new model-backed field fails
 * here, and so does an entry that stopped being one.
 *
 * ## What it does not see
 *
 * Stated so nobody reads a green run as more than it is:
 *
 *  - **Dispatch it cannot resolve.** An actor-client proxy, `invokeActorMethod`
 *    or `enqueueOutbox` whose actor or method is not a constant is a dynamic
 *    site. The known ones are listed in `DYNAMIC_SITES` with a reason each
 *    (none is reachable from a request); a new one fails the test rather than
 *    being skipped.
 *  - **Branches.** A call is followed if it is written, whether or not it is
 *    taken — `ItemActor.update` enqueues `regenerateVector` only when an
 *    embedded field changes, and is counted. That over-counts, which is the
 *    direction a cost limit may be wrong in.
 *  - **Arguments.** `Cellar.items` reaches a model only with `semanticQuery`.
 *    The analysis sees the call and not the condition, so `onlyWithArgument`
 *    on the entry is taken on trust: this file checks only that the argument
 *    exists on the field. If `CellarActor.items` ever embedded without it, the
 *    conditional charge would under-count and nothing here would say so.
 *  - **Anything not written in these shapes** — a seam reached through
 *    something other than its getter, an actor reached other than through
 *    `internal(ctx)`, `invokeActorMethod`, the outbox or a resolver's
 *    `context.actor`, or a
 *    helper *class* (`new Foo().bar()` is not followed; functions are). The
 *    "finds …" cases below fail if a known path disappears, which catches the
 *    analysis going blind wholesale; it cannot catch a brand-new shape it was
 *    never taught.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadProject,
  normalizePath,
  propertyLiterals,
} from "@cellar-assistant/analysis";
import type { AnyActorDescriptor } from "@cellar-assistant/contracts";
import * as contracts from "@cellar-assistant/contracts";
import { isInterfaceType, isObjectType } from "graphql";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { MODEL_BACKED_FIELDS } from "./limits.ts";
import { schema } from "./schema/index.ts";

const ACTORS_SRC = fileURLToPath(new URL("../../actors/src", import.meta.url));
const SCHEMA_SRC = fileURLToPath(new URL("./schema", import.meta.url));
const REPO = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * The API and the actor host as one repo-only program
 * (`@cellar-assistant/analysis`): every module below is read from it, so any
 * node the call graph holds can be asked of the checker. Today that is how an
 * outbox handle is read — by the literal `key` its type carries.
 */
const PROGRAM = loadProject(
  fileURLToPath(new URL("../tsconfig.json", import.meta.url)),
  {
    repoOnly: true,
    extraRoots: [
      ACTORS_SRC,
      ...["contracts", "policy", "db"].map((pkg) =>
        fileURLToPath(new URL(`../../../packages/${pkg}/src`, import.meta.url)),
      ),
    ],
  },
);

/* -------------------------------------------------------------------------- */
/* Modules                                                                     */
/* -------------------------------------------------------------------------- */

type Binding = { readonly from: string; readonly name: string };

type Module = {
  readonly path: string;
  readonly source: ts.SourceFile;
  /** Local name → the module (absolute path, or package specifier) and name it imports. */
  readonly imports: ReadonlyMap<string, Binding>;
  /** Top-level value declarations: functions, variables, classes. */
  readonly declarations: ReadonlyMap<string, ts.Node>;
  /** `export { a as b } from "./x"` — exported name → where it really lives. */
  readonly reexports: ReadonlyMap<string, Binding>;
  readonly starExports: readonly string[];
};

const modules = new Map<string, Module | null>();

const resolveSpecifier = (fromDir: string, specifier: string): string => {
  const base = resolve(fromDir, specifier);
  for (const candidate of [base, `${base}.ts`, join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return base;
};

const specifierOf = (path: string, node: ts.Expression | undefined): string =>
  node !== undefined && ts.isStringLiteral(node)
    ? node.text.startsWith(".")
      ? resolveSpecifier(dirname(path), node.text)
      : node.text
    : "";

const load = (path: string): Module | undefined => {
  const cached = modules.get(path);
  if (cached !== undefined) return cached ?? undefined;
  if (!existsSync(path) || !statSync(path).isFile()) {
    modules.set(path, null);
    return undefined;
  }
  const source =
    PROGRAM.program.getSourceFile(normalizePath(path)) ??
    ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.ESNext,
      true,
      ts.ScriptKind.TS,
    );
  const imports = new Map<string, Binding>();
  const declarations = new Map<string, ts.Node>();
  const reexports = new Map<string, Binding>();
  const starExports: string[] = [];

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      const from = specifierOf(path, statement.moduleSpecifier);
      const clause = statement.importClause;
      if (clause?.name !== undefined) {
        imports.set(clause.name.text, { from, name: "default" });
      }
      const bindings = clause?.namedBindings;
      if (bindings !== undefined && ts.isNamespaceImport(bindings)) {
        imports.set(bindings.name.text, { from, name: "*" });
      } else if (bindings !== undefined) {
        for (const element of bindings.elements) {
          imports.set(element.name.text, {
            from,
            name: element.propertyName?.text ?? element.name.text,
          });
        }
      }
    } else if (ts.isExportDeclaration(statement)) {
      const from = specifierOf(path, statement.moduleSpecifier);
      if (statement.exportClause === undefined) {
        if (from !== "") starExports.push(from);
      } else if (ts.isNamedExports(statement.exportClause) && from !== "") {
        for (const element of statement.exportClause.elements) {
          reexports.set(element.name.text, {
            from,
            name: element.propertyName?.text ?? element.name.text,
          });
        }
      }
    } else if (ts.isFunctionDeclaration(statement) && statement.name) {
      declarations.set(statement.name.text, statement);
    } else if (ts.isClassDeclaration(statement) && statement.name) {
      declarations.set(statement.name.text, statement);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          declarations.set(declaration.name.text, declaration);
        }
      }
    }
  }

  const module: Module = {
    path,
    source,
    imports,
    declarations,
    reexports,
    starExports,
  };
  modules.set(path, module);
  return module;
};

type Found = {
  readonly module: Module;
  readonly name: string;
  readonly node: ts.Node;
};

/** What `name` exported from `module` is, following re-exports. */
const exported = (
  module: Module,
  name: string,
  hops = 0,
): Found | undefined => {
  if (hops > 20) return undefined;
  const local = module.declarations.get(name);
  if (local !== undefined) return { module, name, node: local };
  const imported = module.imports.get(name);
  if (imported?.from.startsWith("/")) {
    const target = load(imported.from);
    if (target !== undefined) return exported(target, imported.name, hops + 1);
  }
  const reexport = module.reexports.get(name);
  if (reexport?.from.startsWith("/")) {
    const target = load(reexport.from);
    if (target !== undefined) return exported(target, reexport.name, hops + 1);
  }
  for (const star of module.starExports) {
    const target = star.startsWith("/") ? load(star) : undefined;
    const found =
      target === undefined ? undefined : exported(target, name, hops + 1);
    if (found !== undefined) return found;
  }
  return undefined;
};

/** What `name` means at the top level of `module`, across workspace imports. */
const lookup = (module: Module, name: string): Found | undefined =>
  exported(module, name);

const unwrap = (expression: ts.Expression): ts.Expression => {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isAwaitExpression(current)
  ) {
    current = current.expression;
  }
  return current;
};

const line = (module: Module, node: ts.Node): string =>
  `${relative(REPO, module.path)}:${
    module.source.getLineAndCharacterOfPosition(node.getStart()).line + 1
  }`;

/** A contracts export's value — the only package whose constants matter here. */
const contractValue = (name: string): unknown =>
  (contracts as Record<string, unknown>)[name];

/**
 * A string constant: a literal, a `const` holding one (here or across a
 * workspace import), a `@cellar-assistant/contracts` export, `X.actorType` on
 * a descriptor, or `this.getActorType()` — which is the concrete class's name,
 * because that is the actor type Dapr registers it under.
 */
const constantString = (
  module: Module,
  expression: ts.Expression,
  self: string | undefined,
  hops = 0,
): string | undefined => {
  if (hops > 20) return undefined;
  const node = unwrap(expression);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isIdentifier(node)) {
    const found = lookup(module, node.text);
    if (
      found !== undefined &&
      ts.isVariableDeclaration(found.node) &&
      found.node.initializer !== undefined
    ) {
      return constantString(
        found.module,
        found.node.initializer,
        self,
        hops + 1,
      );
    }
    const imported = module.imports.get(node.text);
    if (imported?.from === "@cellar-assistant/contracts") {
      const value = contractValue(imported.name);
      return typeof value === "string" ? value : undefined;
    }
    return undefined;
  }
  if (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === "actorType" &&
    ts.isIdentifier(node.expression)
  ) {
    const imported = module.imports.get(node.expression.text);
    const value =
      imported?.from === "@cellar-assistant/contracts"
        ? (contractValue(imported.name) as { actorType?: unknown } | undefined)
            ?.actorType
        : undefined;
    return typeof value === "string" ? value : undefined;
  }
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
    node.expression.name.text === "getActorType"
  ) {
    return self;
  }
  return undefined;
};

/** Is this identifier a reference to a value, rather than a name being declared or a property? */
const isValueReference = (node: ts.Identifier): boolean => {
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
    return false;
  }
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent) ||
      ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isFunctionExpression(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isBindingElement(parent) ||
      ts.isImportSpecifier(parent) ||
      ts.isExportSpecifier(parent) ||
      ts.isImportClause(parent) ||
      ts.isNamespaceImport(parent) ||
      ts.isLabeledStatement(parent) ||
      ts.isEnumMember(parent)) &&
    (parent as { name?: ts.Node }).name === node
  ) {
    return false;
  }
  if (ts.isQualifiedName(parent)) return false;
  return true;
};

const isFunctionLike = (node: ts.Node): boolean =>
  ts.isFunctionDeclaration(node) ||
  (ts.isVariableDeclaration(node) && node.initializer !== undefined);

/* -------------------------------------------------------------------------- */
/* Actors: which methods reach a model                                         */
/* -------------------------------------------------------------------------- */

/**
 * Invoke and enqueue sites whose target is not a constant, and why each is
 * out of reach of a request. A new one fails "has no unexplained dynamic
 * sites" rather than being silently skipped.
 */
const DYNAMIC_SITES: Readonly<Record<string, string>> = {
  "services/actors/src/lib/internal-client.ts":
    "The typed actor client's own transport: `invokeActorMethod` with " +
    "whatever descriptor and method its call site named. Those call sites " +
    "are what this pass follows — `internal(ctx)(Descriptor, id).method(…)`, " +
    "where both are constants — so following the transport too would add " +
    "nothing but noise.",
  "services/actors/src/actors/outbox-actor.ts":
    "`OutboxActor.deliver` invokes whatever `targetActor`/`method` a row " +
    "names. The rows are the enqueue sites this pass already follows at " +
    "their source, so following `deliver` too would add nothing but noise.",
  "services/actors/src/actors/maintenance-actor.ts":
    "`armCycle(tx, method, …)` enqueues `MaintenanceActor.<method>` for its " +
    "own self-arming pair (`reapOrphanFiles`, `reportDeadLetters`). Neither " +
    "calls a model, and `MaintenanceActor` has no GraphQL surface.",
};

type ClassInfo = {
  readonly name: string;
  readonly module: Module;
  readonly declaration: ts.ClassDeclaration;
  readonly base: ClassInfo | undefined;
  readonly members: ReadonlyMap<string, ts.ClassElement>;
  /** Each field's initializers: a property initializer, or the default of the constructor parameter assigned to it. */
  readonly fieldBodies: ReadonlyMap<string, readonly ts.Expression[]>;
};

const memberName = (element: ts.ClassElement): string | undefined =>
  element.name !== undefined &&
  (ts.isIdentifier(element.name) || ts.isPrivateIdentifier(element.name))
    ? element.name.text
    : undefined;

const classes = new Map<ts.ClassDeclaration, ClassInfo>();

const classInfo = (
  module: Module,
  declaration: ts.ClassDeclaration,
): ClassInfo => {
  const cached = classes.get(declaration);
  if (cached !== undefined) return cached;

  const members = new Map<string, ts.ClassElement>();
  const fieldBodies = new Map<string, ts.Expression[]>();
  const addBody = (name: string, body: ts.Expression): void => {
    const bodies = fieldBodies.get(name) ?? [];
    bodies.push(body);
    fieldBodies.set(name, bodies);
  };

  for (const element of declaration.members) {
    if (ts.isConstructorDeclaration(element)) {
      const defaults = new Map<string, ts.Expression>();
      for (const parameter of element.parameters) {
        if (ts.isIdentifier(parameter.name) && parameter.initializer) {
          defaults.set(parameter.name.text, parameter.initializer);
        }
      }
      const visit = (node: ts.Node): void => {
        if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isPropertyAccessExpression(node.left) &&
          node.left.expression.kind === ts.SyntaxKind.ThisKeyword
        ) {
          const right = unwrap(node.right);
          const fromDefault = ts.isIdentifier(right)
            ? defaults.get(right.text)
            : undefined;
          addBody(node.left.name.text, fromDefault ?? node.right);
        }
        ts.forEachChild(node, visit);
      };
      if (element.body) visit(element.body);
      continue;
    }
    const name = memberName(element);
    if (name === undefined) continue;
    members.set(name, element);
    if (ts.isPropertyDeclaration(element) && element.initializer) {
      addBody(name, element.initializer);
    }
  }

  let base: ClassInfo | undefined;
  const heritage = declaration.heritageClauses?.find(
    (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword,
  );
  const baseExpression = heritage?.types[0]?.expression;
  if (baseExpression !== undefined && ts.isIdentifier(baseExpression)) {
    const found = lookup(module, baseExpression.text);
    if (found !== undefined && ts.isClassDeclaration(found.node)) {
      base = classInfo(found.module, found.node);
    }
  }

  const info: ClassInfo = {
    name: declaration.name?.text ?? "(anonymous)",
    module,
    declaration,
    base,
    members,
    fieldBodies,
  };
  classes.set(declaration, info);
  return info;
};

/** The class in `start`'s chain (from `start` up) that defines `name`. */
const definingClass = (
  start: ClassInfo | undefined,
  name: string,
): ClassInfo | undefined => {
  for (let current = start; current !== undefined; current = current.base) {
    if (current.members.has(name) || current.fieldBodies.has(name)) {
      return current;
    }
  }
  return undefined;
};

type ActorAnalysis = {
  /** `Actor.method` → the path from it to a seam. */
  readonly reaching: ReadonlyMap<string, readonly string[]>;
  /** Every public method of every registered actor, reaching or not. */
  readonly publicMethods: ReadonlySet<string>;
  /** Seam → its getter, as the `SEAMS` table wires it. */
  readonly seams: ReadonlyMap<string, string>;
  /** `MODEL_SPENDERS`' keys, the budget's own list of seams. */
  readonly budgetedSeams: readonly string[];
  /** Seams no public actor method reaches. */
  readonly unreachedSeams: readonly string[];
  readonly dynamicSites: readonly string[];
  /** `invokeActorMethod`/outbox targets naming a method the actor does not have. */
  readonly danglingTargets: readonly string[];
};

/** The class of every `entry(X, XDescriptor)` in the actors' registry. */
const registeredActorClasses = (): ClassInfo[] => {
  const index = load(join(ACTORS_SRC, "actors/registry.ts"));
  if (index === undefined) {
    throw new Error("no services/actors/src/actors/registry.ts");
  }
  const found: ClassInfo[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "entry"
    ) {
      const [argument] = node.arguments;
      if (argument !== undefined && ts.isIdentifier(argument)) {
        const declaration = lookup(index, argument.text);
        if (
          declaration !== undefined &&
          ts.isClassDeclaration(declaration.node)
        ) {
          found.push(classInfo(declaration.module, declaration.node));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(index.source);
  return found;
};

/**
 * The seams, read off the `SEAMS` table `installSeams` installs from: each
 * property names a seam, and the `setX(…)` call in its `install` names the
 * setter; the getter is the export beside the setter that returns the
 * variable the setter assigns.
 */
const seamGetters = (): Map<string, Found> => {
  const install = load(join(ACTORS_SRC, "lib/ai/install.ts"));
  if (install === undefined) throw new Error("no lib/ai/install.ts");
  const table = install.declarations.get("SEAMS");
  if (
    table === undefined ||
    !ts.isVariableDeclaration(table) ||
    table.initializer === undefined
  ) {
    throw new Error("no SEAMS table in lib/ai/install.ts");
  }
  const literal = unwrap(table.initializer);
  if (!ts.isObjectLiteralExpression(literal)) {
    throw new Error("SEAMS is not an object literal");
  }

  const getters = new Map<string, Found>();
  for (const property of literal.properties) {
    if (
      !ts.isPropertyAssignment(property) ||
      !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
    ) {
      continue;
    }
    const seam = property.name.text;
    let setter: Found | undefined;
    const findSetter = (node: ts.Node): void => {
      if (
        setter === undefined &&
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        /^set[A-Z]/.test(node.expression.text)
      ) {
        setter = lookup(install, node.expression.text);
      }
      ts.forEachChild(node, findSetter);
    };
    findSetter(property.initializer);
    const getter = setter === undefined ? undefined : getterBeside(setter);
    if (getter !== undefined) getters.set(seam, getter);
  }
  return getters;
};

const getterBeside = (setter: Found): Found | undefined => {
  let assigned: string | undefined;
  const findAssignment = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      assigned = node.left.text;
    }
    ts.forEachChild(node, findAssignment);
  };
  findAssignment(setter.node);
  if (assigned === undefined) return undefined;
  for (const [name, node] of setter.module.declarations) {
    if (!ts.isVariableDeclaration(node) || node.initializer === undefined) {
      continue;
    }
    const initializer = unwrap(node.initializer);
    if (!ts.isArrowFunction(initializer)) continue;
    const body = initializer.body;
    const returned = ts.isBlock(body)
      ? body.statements.find(ts.isReturnStatement)?.expression
      : body;
    if (
      returned !== undefined &&
      ts.isIdentifier(unwrap(returned)) &&
      (unwrap(returned) as ts.Identifier).text === assigned
    ) {
      return { module: setter.module, name, node };
    }
  }
  return undefined;
};

const budgetedSeams = (): string[] => {
  const budget = load(join(ACTORS_SRC, "actors/budget-actor.ts"));
  const spenders = budget?.declarations.get("MODEL_SPENDERS");
  if (
    spenders === undefined ||
    !ts.isVariableDeclaration(spenders) ||
    spenders.initializer === undefined
  ) {
    throw new Error("no MODEL_SPENDERS in budget-actor.ts");
  }
  const literal = unwrap(spenders.initializer);
  if (!ts.isObjectLiteralExpression(literal)) return [];
  return literal.properties.flatMap((property) =>
    property.name !== undefined && ts.isIdentifier(property.name)
      ? [property.name.text]
      : [],
  );
};

/**
 * `internal(ctx)(Descriptor, id)` — the actor host's typed client
 * (`services/actors/src/lib/internal-client.ts`), the shape every
 * actor-to-actor call now takes.
 */
const isInternalProxy = (node: ts.Node): node is ts.CallExpression =>
  ts.isCallExpression(node) &&
  ts.isCallExpression(node.expression) &&
  ts.isIdentifier(node.expression.expression) &&
  node.expression.expression.text === "internal";

/** The descriptor's actor type, when the descriptor is a contracts export. */
const internalProxyActorType = (
  module: Module,
  proxy: ts.CallExpression,
): string | undefined => {
  const [descriptor] = proxy.arguments;
  if (descriptor === undefined || !ts.isIdentifier(unwrap(descriptor))) {
    return undefined;
  }
  const name = (unwrap(descriptor) as ts.Identifier).text;
  const imported = module.imports.get(name);
  if (imported?.from !== "@cellar-assistant/contracts") return undefined;
  const value = contractValue(imported.name) as
    | { actorType?: unknown }
    | undefined;
  return typeof value?.actorType === "string" ? value.actorType : undefined;
};

/**
 * The methods called on a proxy: `internal(…)(…).m()` directly, or — for
 * `const file = internal(…)(…)` — every `file.m()` in the enclosing function.
 * `undefined` when the proxy escapes in some other way.
 */
const proxyMethods = (proxy: ts.CallExpression): string[] | undefined => {
  const direct = calledMethod(proxy);
  if (direct !== undefined) return [direct];
  const parent = proxy.parent;
  if (!ts.isVariableDeclaration(parent) || !ts.isIdentifier(parent.name)) {
    return undefined;
  }
  const name = parent.name.text;
  let scope: ts.Node = parent;
  while (
    scope.parent !== undefined &&
    !ts.isFunctionLike(scope) &&
    !ts.isSourceFile(scope)
  ) {
    scope = scope.parent;
  }
  const methods: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === name && node !== parent.name) {
      const method = calledMethod(node);
      if (method !== undefined) methods.push(method);
    }
    ts.forEachChild(node, visit);
  };
  visit(scope);
  return methods.length === 0 ? undefined : methods;
};

const analyseActors = (): ActorAnalysis => {
  const registered = registeredActorClasses();
  const byActorType = new Map(registered.map((info) => [info.name, info]));
  const getters = seamGetters();
  const sinkOf = new Map<ts.Node, string>();
  for (const [seam, getter] of getters) sinkOf.set(getter.node, seam);

  const dynamicSites = new Set<string>();
  const danglingTargets = new Set<string>();

  /**
   * Graph nodes. `m:` and `f:` carry the concrete class, because `this.x`
   * inside a base-class method means the concrete class's `x` — that is how
   * `JobActor.runBatch` reaches each job's own `processBatch`.
   */
  type Node = {
    readonly id: string;
    readonly bodies: readonly ts.Node[];
    readonly module: Module;
    readonly self?: { concrete: ClassInfo; defining: ClassInfo };
    readonly sink?: string;
  };
  const nodes = new Map<string, Node>();

  const memberNode = (
    concrete: ClassInfo,
    name: string,
    start: ClassInfo = concrete,
  ): Node | undefined => {
    const defining = definingClass(start, name);
    if (defining === undefined) return undefined;
    const id = `${concrete.name}:${defining.name}.${name}`;
    const cached = nodes.get(id);
    if (cached !== undefined) return cached;
    const element = defining.members.get(name);
    const bodies: ts.Node[] = [...(defining.fieldBodies.get(name) ?? [])];
    if (
      element !== undefined &&
      (ts.isMethodDeclaration(element) ||
        ts.isGetAccessorDeclaration(element)) &&
      element.body
    ) {
      bodies.push(element.body);
    }
    const node: Node = {
      id,
      bodies,
      module: defining.module,
      self: { concrete, defining },
    };
    nodes.set(id, node);
    return node;
  };

  const functionNode = (found: Found): Node => {
    const id = `${relative(REPO, found.module.path)}#${found.name}`;
    const cached = nodes.get(id);
    if (cached !== undefined) return cached;
    const seam = sinkOf.get(found.node);
    const node: Node = {
      id,
      bodies: seam === undefined ? [found.node] : [],
      module: found.module,
      ...(seam === undefined ? {} : { sink: seam }),
    };
    nodes.set(id, node);
    return node;
  };

  const actorMethodNode = (
    actorType: string,
    method: string,
    at: string,
  ): Node | undefined => {
    const info = byActorType.get(actorType);
    const node = info === undefined ? undefined : memberNode(info, method);
    if (node === undefined)
      danglingTargets.add(`${actorType}.${method} (${at})`);
    return node;
  };

  const edges = new Map<string, readonly Node[]>();
  const edgesOf = (node: Node): readonly Node[] => {
    const cached = edges.get(node.id);
    if (cached !== undefined) return cached;
    const out: Node[] = [];
    const add = (target: Node | undefined): void => {
      if (target !== undefined && target.id !== node.id) out.push(target);
    };
    const self = node.self?.concrete.name;
    const visit = (child: ts.Node): void => {
      if (ts.isTypeNode(child)) return;
      if (isInternalProxy(child)) {
        const actor = internalProxyActorType(node.module, child);
        const methods = proxyMethods(child);
        if (actor === undefined || methods === undefined) {
          dynamicSites.add(line(node.module, child));
        } else {
          for (const method of methods) {
            add(actorMethodNode(actor, method, line(node.module, child)));
          }
        }
      }
      if (ts.isCallExpression(child) && ts.isIdentifier(child.expression)) {
        const callee = child.expression.text;
        if (callee === "invokeActorMethod") {
          const [actorArgument, , methodArgument] = child.arguments;
          const actor =
            actorArgument && constantString(node.module, actorArgument, self);
          const method =
            methodArgument && constantString(node.module, methodArgument, self);
          if (actor && method) {
            add(actorMethodNode(actor, method, line(node.module, child)));
          } else {
            dynamicSites.add(line(node.module, child));
          }
        } else if (
          callee === "enqueueOutbox" ||
          callee === "enqueueOutboxOnce"
        ) {
          // A typed handle — `OUTBOX_TARGETS["Actor.method"]`, or a binding
          // typed as a union of them — names its pairs in its type.
          const handle = child.arguments[1];
          const keys =
            handle === undefined
              ? null
              : propertyLiterals(
                  PROGRAM.checker,
                  PROGRAM.checker.getTypeAtLocation(handle),
                  "key",
                );
          if (
            keys !== null &&
            keys.length > 0 &&
            keys.every((key) => typeof key === "string" && key.includes("."))
          ) {
            for (const key of keys as string[]) {
              const dot = key.indexOf(".");
              add(
                actorMethodNode(
                  key.slice(0, dot),
                  key.slice(dot + 1),
                  line(node.module, child),
                ),
              );
            }
            ts.forEachChild(child, visit);
            return;
          }
          const spec = child.arguments.find(ts.isObjectLiteralExpression);
          const property = (key: string): ts.Expression | undefined => {
            const found = spec?.properties.find(
              (candidate) =>
                candidate.name !== undefined &&
                ts.isIdentifier(candidate.name) &&
                candidate.name.text === key,
            );
            if (found === undefined) return undefined;
            if (ts.isPropertyAssignment(found)) return found.initializer;
            if (ts.isShorthandPropertyAssignment(found)) return found.name;
            return undefined;
          };
          const actorExpression = property("targetActor");
          const methodExpression = property("method");
          const actor =
            actorExpression &&
            constantString(node.module, actorExpression, self);
          const method =
            methodExpression &&
            constantString(node.module, methodExpression, self);
          if (actor && method) {
            add(actorMethodNode(actor, method, line(node.module, child)));
          } else {
            dynamicSites.add(line(node.module, child));
          }
        }
      }
      if (
        ts.isPropertyAccessExpression(child) &&
        node.self !== undefined &&
        (child.expression.kind === ts.SyntaxKind.ThisKeyword ||
          child.expression.kind === ts.SyntaxKind.SuperKeyword)
      ) {
        const start =
          child.expression.kind === ts.SyntaxKind.SuperKeyword
            ? node.self.defining.base
            : node.self.concrete;
        add(memberNode(node.self.concrete, child.name.text, start));
      }
      if (ts.isIdentifier(child) && isValueReference(child)) {
        const found = lookup(node.module, child.text);
        if (found !== undefined && isFunctionLike(found.node)) {
          add(functionNode(found));
        }
      }
      ts.forEachChild(child, visit);
    };
    for (const body of node.bodies) visit(body);
    edges.set(node.id, out);
    return out;
  };

  // Forward: discover every node reachable from a public actor method.
  const publicMethods = new Map<string, Node>();
  for (const info of registered) {
    for (
      let current: ClassInfo | undefined = info;
      current;
      current = current.base
    ) {
      for (const [name, element] of current.members) {
        if (
          !ts.isMethodDeclaration(element) ||
          name.startsWith("#") ||
          element.modifiers?.some(
            (modifier) =>
              modifier.kind === ts.SyntaxKind.PrivateKeyword ||
              modifier.kind === ts.SyntaxKind.ProtectedKeyword ||
              modifier.kind === ts.SyntaxKind.StaticKeyword ||
              modifier.kind === ts.SyntaxKind.AbstractKeyword,
          )
        ) {
          continue;
        }
        const key = `${info.name}.${name}`;
        if (publicMethods.has(key)) continue;
        const node = memberNode(info, name);
        if (node !== undefined) publicMethods.set(key, node);
      }
    }
  }
  const reverse = new Map<string, Node[]>();
  const seen = new Set<string>();
  const pending = [...publicMethods.values()];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined || seen.has(node.id)) continue;
    seen.add(node.id);
    for (const target of edgesOf(node)) {
      const back = reverse.get(target.id) ?? [];
      back.push(node);
      reverse.set(target.id, back);
      if (!seen.has(target.id)) pending.push(target);
    }
  }

  // Backward: every node that reaches a seam, with the next hop towards it.
  const towardSeam = new Map<string, string | null>();
  const queue: Node[] = [];
  const reachedSeams = new Set<string>();
  for (const id of seen) {
    const node = nodes.get(id);
    if (node?.sink !== undefined) {
      towardSeam.set(id, null);
      queue.push(node);
    }
  }
  while (queue.length > 0) {
    const node = queue.shift();
    if (node === undefined) continue;
    for (const caller of reverse.get(node.id) ?? []) {
      if (towardSeam.has(caller.id)) continue;
      towardSeam.set(caller.id, node.id);
      queue.push(caller);
    }
  }

  const reaching = new Map<string, string[]>();
  for (const [key, node] of publicMethods) {
    if (!towardSeam.has(node.id)) continue;
    const path: string[] = [];
    let id: string | null | undefined = node.id;
    while (id !== null && id !== undefined && path.length < 50) {
      const current = nodes.get(id);
      path.push(
        current?.sink === undefined ? id : `${id} (seam: ${current.sink})`,
      );
      if (current?.sink !== undefined) reachedSeams.add(current.sink);
      id = towardSeam.get(id);
    }
    reaching.set(key, path);
  }

  return {
    reaching,
    publicMethods: new Set(publicMethods.keys()),
    seams: new Map([...getters].map(([seam, found]) => [seam, found.name])),
    budgetedSeams: budgetedSeams(),
    unreachedSeams: [...getters.keys()].filter(
      (seam) => !reachedSeams.has(seam),
    ),
    dynamicSites: [...dynamicSites].sort(),
    danglingTargets: [...danglingTargets].sort(),
  };
};

/* -------------------------------------------------------------------------- */
/* API: which actor methods each field's resolver calls                        */
/* -------------------------------------------------------------------------- */

type Attribution =
  | { readonly kind: "field"; readonly coordinate: string }
  | { readonly kind: "helper"; readonly found: Found }
  | { readonly kind: "none"; readonly why: string };

const TYPE_DEFINING = new Set([
  "objectRef",
  "interfaceRef",
  "objectType",
  "interfaceType",
  "loadableObject",
  "loadableInterface",
  "loadableObjectRef",
  "node",
  "loadableNode",
]);

/** The GraphQL type name a Pothos ref or type-defining call denotes. */
const typeName = (
  module: Module,
  expression: ts.Expression,
  hops = 0,
): string | undefined => {
  if (hops > 20) return undefined;
  const node = unwrap(expression);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isIdentifier(node)) {
    const found = lookup(module, node.text);
    return found !== undefined &&
      ts.isVariableDeclaration(found.node) &&
      found.node.initializer !== undefined
      ? typeName(found.module, found.node.initializer, hops + 1)
      : undefined;
  }
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression)
  ) {
    const method = node.expression.name.text;
    if (method === "implement") {
      return typeName(module, node.expression.expression, hops + 1);
    }
    if (method === "queryType") return "Query";
    if (method === "mutationType") return "Mutation";
    const [first] = node.arguments;
    if (first === undefined) return undefined;
    if (method === "connectionObject" || TYPE_DEFINING.has(method)) {
      const argument = unwrap(first);
      if (ts.isObjectLiteralExpression(argument)) {
        const name = argument.properties.find(
          (property) =>
            ts.isPropertyAssignment(property) &&
            ts.isIdentifier(property.name) &&
            property.name.text === "name",
        );
        return name !== undefined && ts.isPropertyAssignment(name)
          ? typeName(module, name.initializer, hops + 1)
          : undefined;
      }
      return typeName(module, argument, hops + 1);
    }
  }
  return undefined;
};

/**
 * Which field a node sits in, found by walking up to the Pothos call that
 * defines it: `builder.queryField("x", …)`, or a `x: t.field(…)` property
 * inside a type's `fields`. Reaching the top level first means the node is
 * inside a module-level helper, attributed later through whatever calls it.
 */
const attribute = (module: Module, start: ts.Node): Attribution => {
  let fieldName: string | undefined;
  for (
    let node: ts.Node = start;
    node.parent !== undefined;
    node = node.parent
  ) {
    const parent = node.parent;
    if (
      fieldName === undefined &&
      ts.isPropertyAssignment(parent) &&
      parent.initializer === node &&
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      (ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name))
    ) {
      fieldName = parent.name.text;
    }
    if (
      ts.isCallExpression(parent) &&
      ts.isPropertyAccessExpression(parent.expression)
    ) {
      const method = parent.expression.name.text;
      const [first, second] = parent.arguments;
      const literal = (
        argument: ts.Expression | undefined,
      ): string | undefined =>
        argument !== undefined && ts.isStringLiteral(argument)
          ? argument.text
          : undefined;
      const rootOf: Record<string, string> = {
        queryField: "Query",
        mutationField: "Mutation",
        subscriptionField: "Subscription",
        queryFields: "Query",
        mutationFields: "Mutation",
        subscriptionFields: "Subscription",
      };
      const root = rootOf[method];
      if (root !== undefined && method.endsWith("Field")) {
        const name = literal(first);
        if (name !== undefined) {
          return { kind: "field", coordinate: `${root}.${name}` };
        }
      }
      if (root !== undefined && method.endsWith("Fields")) {
        return fieldName === undefined
          ? { kind: "none", why: `inside ${method} but not a field` }
          : { kind: "field", coordinate: `${root}.${fieldName}` };
      }
      if (method === "objectField" || method === "interfaceField") {
        const type = first === undefined ? undefined : typeName(module, first);
        const name = literal(second);
        if (type !== undefined && name !== undefined) {
          return { kind: "field", coordinate: `${type}.${name}` };
        }
        return { kind: "none", why: `${method} with an unresolvable ref` };
      }
      if (method === "objectFields" || method === "interfaceFields") {
        const type = first === undefined ? undefined : typeName(module, first);
        return type !== undefined && fieldName !== undefined
          ? { kind: "field", coordinate: `${type}.${fieldName}` }
          : {
              kind: "none",
              why: `${method} with an unresolvable ref or field`,
            };
      }
      if (
        method === "implement" ||
        method === "connectionObject" ||
        method === "queryType" ||
        method === "mutationType" ||
        TYPE_DEFINING.has(method)
      ) {
        const type = typeName(module, parent);
        if (type === undefined) {
          return { kind: "none", why: `${method} of an unresolvable type` };
        }
        return fieldName === undefined
          ? { kind: "none", why: `type-level code of ${type} (not a field)` }
          : { kind: "field", coordinate: `${type}.${fieldName}` };
      }
    }
    if (ts.isSourceFile(parent)) {
      const declared = ts.isVariableStatement(node)
        ? node.declarationList.declarations.find(
            (declaration) =>
              declaration.getStart() <= start.getStart() &&
              start.getEnd() <= declaration.getEnd(),
          )
        : ts.isFunctionDeclaration(node)
          ? node
          : undefined;
      const name =
        declared !== undefined &&
        declared.name !== undefined &&
        ts.isIdentifier(declared.name)
          ? declared.name.text
          : undefined;
      return name === undefined || declared === undefined
        ? { kind: "none", why: "top-level statement that declares nothing" }
        : { kind: "helper", found: { module, name, node: declared } };
    }
  }
  return { kind: "none", why: "no enclosing field" };
};

type ActorCall = {
  readonly target: string;
  readonly at: string;
};

type ApiAnalysis = {
  /** Field coordinate → `Actor.method` its resolver calls, `Actor.*` where the method is not static. */
  readonly calls: ReadonlyMap<string, ReadonlySet<string>>;
  /** Calls attributed to no field, with the reason. */
  readonly unattributed: readonly (ActorCall & { readonly why: string })[];
};

const schemaModules = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return schemaModules(path);
    if (!path.endsWith(".ts") || path.endsWith(".test.ts")) return [];
    return [path];
  });

/** `context.actor(Descriptor, …)` → the descriptor's actor type. */
const descriptorType = (
  module: Module,
  call: ts.CallExpression,
): string | undefined => {
  const [descriptor] = call.arguments;
  if (descriptor === undefined || !ts.isIdentifier(unwrap(descriptor))) {
    return undefined;
  }
  const name = (unwrap(descriptor) as ts.Identifier).text;
  const imported = module.imports.get(name);
  if (imported?.from !== "@cellar-assistant/contracts") return undefined;
  const value = contractValue(imported.name) as
    | { actorType?: unknown }
    | undefined;
  return typeof value?.actorType === "string" ? value.actorType : undefined;
};

const isActorCall = (node: ts.Node): node is ts.CallExpression =>
  ts.isCallExpression(node) &&
  ts.isPropertyAccessExpression(node.expression) &&
  node.expression.name.text === "actor" &&
  node.arguments.length >= 1;

/** `receiver.method(…)` where `receiver` is `node` — the method name, or none. */
const calledMethod = (node: ts.Node): string | undefined => {
  const parent = node.parent;
  return ts.isPropertyAccessExpression(parent) &&
    parent.expression === node &&
    ts.isCallExpression(parent.parent) &&
    parent.parent.expression === parent
    ? parent.name.text
    : undefined;
};

const analyseApi = (): ApiAnalysis => {
  const files = schemaModules(SCHEMA_SRC)
    .map((path) => load(path))
    .filter((module): module is Module => module !== undefined);

  // Pass 1: helpers that return an actor proxy (`const userActor = (…) =>
  // context.actor(UserActorDescriptor, …)`), so `userActor(…).m()` is `m`.
  const proxyHelpers = new Map<ts.Node, string>();
  for (const module of files) {
    const visit = (node: ts.Node): void => {
      if (isActorCall(node) && calledMethod(node) === undefined) {
        const actorType = descriptorType(module, node);
        const returned =
          ts.isReturnStatement(node.parent) ||
          (ts.isArrowFunction(node.parent) && node.parent.body === node);
        if (actorType !== undefined && returned) {
          const where = attribute(module, node);
          if (where.kind === "helper") {
            proxyHelpers.set(where.found.node, actorType);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(module.source);
  }

  // Pass 2: every call, and where it sits.
  const direct: { module: Module; node: ts.Node; call: ActorCall }[] = [];
  for (const module of files) {
    const visit = (node: ts.Node): void => {
      if (isActorCall(node)) {
        const actorType = descriptorType(module, node) ?? "(unresolved)";
        const method = calledMethod(node);
        const returnedFromHelper =
          method === undefined &&
          [...proxyHelpers.keys()].some(
            (helper) =>
              helper.getSourceFile() === node.getSourceFile() &&
              helper.getStart() <= node.getStart() &&
              node.getEnd() <= helper.getEnd(),
          );
        if (!returnedFromHelper) {
          direct.push({
            module,
            node,
            call: {
              target: `${actorType}.${method ?? "*"}`,
              at: line(module, node),
            },
          });
        }
      } else if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        calledMethod(node) !== undefined
      ) {
        const found = lookup(module, node.expression.text);
        const actorType =
          found === undefined ? undefined : proxyHelpers.get(found.node);
        if (actorType !== undefined) {
          direct.push({
            module,
            node,
            call: {
              target: `${actorType}.${calledMethod(node)}`,
              at: line(module, node),
            },
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(module.source);
  }

  // Pass 3: attribute each call to fields, through helpers transitively.
  const calls = new Map<string, Set<string>>();
  const unattributed: (ActorCall & { why: string })[] = [];
  const referencesTo = (helper: Found): { module: Module; node: ts.Node }[] => {
    const sites: { module: Module; node: ts.Node }[] = [];
    for (const module of files) {
      const visit = (node: ts.Node): void => {
        if (
          ts.isIdentifier(node) &&
          isValueReference(node) &&
          lookup(module, node.text)?.node === helper.node
        ) {
          sites.push({ module, node });
        }
        ts.forEachChild(node, visit);
      };
      visit(module.source);
    }
    return sites;
  };
  const place = (
    module: Module,
    node: ts.Node,
    call: ActorCall,
    via: ReadonlySet<ts.Node>,
  ): void => {
    const where = attribute(module, node);
    if (where.kind === "field") {
      const set = calls.get(where.coordinate) ?? new Set<string>();
      set.add(call.target);
      calls.set(where.coordinate, set);
      return;
    }
    if (where.kind === "none") {
      unattributed.push({ ...call, why: where.why });
      return;
    }
    if (via.has(where.found.node)) return;
    const sites = referencesTo(where.found);
    if (sites.length === 0) {
      unattributed.push({
        ...call,
        why: `helper ${where.found.name} is never referenced`,
      });
    }
    const next = new Set(via).add(where.found.node);
    for (const site of sites) place(site.module, site.node, call, next);
  };
  for (const { module, node, call } of direct) {
    place(module, node, call, new Set());
  }
  return { calls, unattributed };
};

/* -------------------------------------------------------------------------- */
/* The guards                                                                  */
/* -------------------------------------------------------------------------- */

const actors = analyseActors();
const api = analyseApi();

/** Fields the source says are model-backed, and through which actor methods. */
const derived = (): Map<string, string[]> => {
  const out = new Map<string, string[]>();
  for (const [coordinate, targets] of api.calls) {
    const via = [...targets].filter((target) => actors.reaching.has(target));
    if (via.length > 0) out.set(coordinate, via.sort());
  }
  return out;
};

const declared = (): Map<string, string[]> =>
  new Map(
    [...MODEL_BACKED_FIELDS].map(([coordinate, entry]) => [
      coordinate,
      [...entry.via].sort(),
    ]),
  );

describe("the actor pass", () => {
  it("finds the seams the SEAMS table wires, and they are the budget's seams", () => {
    expect([...actors.seams.keys()].sort()).toEqual(
      [...actors.budgetedSeams].sort(),
    );
    expect(actors.seams.size).toBeGreaterThanOrEqual(7);
  });

  it("reaches every seam from some public actor method", () => {
    // A seam nobody reaches means its consumers stopped matching the shapes
    // this pass follows — which is the analysis going blind, not the seam
    // going unused.
    expect(actors.unreachedSeams).toEqual([]);
  });

  it("finds the paths the findings named, so a green run is not a blind one", () => {
    for (const method of [
      "EmbeddingActor.embed",
      "ItemSearchActor.results",
      "PlaceSearchActor.results",
      "RecipeSearchActor.results",
      "RecipeActor.create",
      "ItemActor.create",
      "ItemOnboardingActor.start",
      "PlaceCreationActor.createPlace",
      "RecipePhotoJobActor.start",
      "TierListActor.generateInsights",
      "MenuScanActor.create",
    ]) {
      expect(actors.reaching.has(method), method).toBe(true);
    }
  });

  it("does not call everything model-backed", () => {
    // The other way to go blind: an over-eager edge that makes every method
    // reach a seam would pass every check above.
    for (const method of [
      "BrandSearchActor.results",
      "UserSearchActor.results",
      "ItemActor.get",
      "CellarActor.get",
      "RecipeActor.get",
      "FileActor.get",
    ]) {
      expect(actors.publicMethods.has(method), `${method} exists`).toBe(true);
      expect(actors.reaching.get(method), method).toBeUndefined();
    }
  });

  it("has no unexplained dynamic sites", () => {
    const unexplained = actors.dynamicSites.filter(
      (site) => !Object.hasOwn(DYNAMIC_SITES, site.replace(/:\d+$/, "")),
    );
    expect(unexplained).toEqual([]);
  });

  it("finds no invoke or outbox target naming a method its actor lacks", () => {
    expect(actors.danglingTargets).toEqual([]);
  });
});

describe("the API pass", () => {
  it("finds the resolvers", () => {
    expect(api.calls.size).toBeGreaterThan(100);
  });

  it("attributes every call to a field that exists", () => {
    const missing = [...api.calls.keys()].filter((coordinate) => {
      const [typeName, fieldName] = coordinate.split(".");
      const type = schema.getType(typeName ?? "");
      return !(
        type !== undefined &&
        (isObjectType(type) || isInterfaceType(type)) &&
        Object.hasOwn(type.getFields(), fieldName ?? "")
      );
    });
    expect(missing).toEqual([]);
  });

  it("leaves no model-reaching call unattributed", () => {
    // A call this pass cannot place could be anywhere — a loader, a helper
    // nothing calls. That is fine for a read; for a model call it is a field
    // this test cannot vouch for.
    const reaching = api.unattributed.filter(
      (call) =>
        actors.reaching.has(call.target) ||
        (call.target.endsWith(".*") &&
          [...actors.reaching.keys()].some((method) =>
            method.startsWith(call.target.slice(0, -1)),
          )),
    );
    expect(reaching).toEqual([]);
  });

  it("knows which method every call to a model-reaching actor makes", () => {
    const vague = [...api.calls].flatMap(([coordinate, targets]) =>
      [...targets]
        .filter(
          (target) =>
            target.endsWith(".*") &&
            [...actors.reaching.keys()].some((method) =>
              method.startsWith(target.slice(0, -1)),
            ),
        )
        .map((target) => `${coordinate} → ${target}`),
    );
    expect(vague).toEqual([]);
  });
});

describe("MODEL_BACKED_FIELDS matches the source", () => {
  it("lists every field whose resolver reaches a model", () => {
    const want = derived();
    const have = declared();
    const missing = [...want]
      .filter(([coordinate]) => !have.has(coordinate))
      .map(([coordinate, via]) => ({
        coordinate,
        via,
        path: actors.reaching.get(via[0] ?? ""),
      }));
    expect(
      missing,
      "these fields reach a model but MODEL_BACKED_FIELDS does not count them",
    ).toEqual([]);
  });

  it("lists nothing that does not", () => {
    const want = derived();
    const stale = [...declared().keys()].filter(
      (coordinate) => !want.has(coordinate),
    );
    expect(
      stale,
      "these MODEL_BACKED_FIELDS entries no longer reach a model through their resolver",
    ).toEqual([]);
  });

  it("names the actor methods each field reaches a model through", () => {
    const want = derived();
    const wrong = [...declared()].flatMap(([coordinate, via]) => {
      const actual = want.get(coordinate);
      return actual === undefined ||
        JSON.stringify(actual) === JSON.stringify(via)
        ? []
        : [{ coordinate, declared: via, derived: actual }];
    });
    expect(wrong).toEqual([]);
  });

  it("names an argument that exists on every conditional entry", () => {
    const wrong = [...MODEL_BACKED_FIELDS].flatMap(([coordinate, entry]) => {
      if (entry.onlyWithArgument === undefined) return [];
      const [typeName, fieldName] = coordinate.split(".");
      const type = schema.getType(typeName ?? "");
      const field =
        type !== undefined && (isObjectType(type) || isInterfaceType(type))
          ? type.getFields()[fieldName ?? ""]
          : undefined;
      return field?.args.some((arg) => arg.name === entry.onlyWithArgument)
        ? []
        : [coordinate];
    });
    expect(wrong).toEqual([]);
  });
});

/**
 * The same fact, stated on the contract.
 *
 * Each method a resolver calls that can reach a model carries
 * `modelBacked: true` on its descriptor's method table
 * (`@cellar-assistant/contracts`), so a reader of the contract — or the actor
 * host, which reads the same table for timeouts — sees it without this file.
 * A flag is a claim, so it is held to the derivation: the flagged set must be
 * exactly the `via` methods derived above, both directions. A method that
 * stops reaching a model keeps its flag only until this runs, and a newly
 * model-backed method fails here until its descriptor says so.
 */
describe("descriptors flag exactly the model-backed methods", () => {
  const flagged = (): string[] =>
    Object.entries(contracts)
      .filter(([name]) => name.endsWith("ActorDescriptor"))
      .flatMap(([, value]) => {
        const descriptor = value as AnyActorDescriptor;
        return Object.entries(descriptor.methods ?? {})
          .filter(([, meta]) => meta?.modelBacked === true)
          .map(([method]) => `${descriptor.actorType}.${method}`);
      })
      .sort();

  const derivedVia = (): string[] =>
    [...new Set([...derived().values()].flat())].sort();

  it("finds flags at all", () => {
    expect(flagged().length).toBeGreaterThan(10);
  });

  it("flags every method a model-backed field is derived to reach through", () => {
    const missing = derivedVia().filter(
      (method) => !flagged().includes(method),
    );
    expect(
      missing,
      "add `modelBacked: true` to these methods on their descriptors",
    ).toEqual([]);
  });

  it("flags nothing the derivation does not find", () => {
    const stale = flagged().filter((method) => !derivedVia().includes(method));
    expect(
      stale,
      "these descriptors claim a model the code no longer reaches",
    ).toEqual([]);
  });
});
