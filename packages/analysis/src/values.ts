/**
 * What an expression *is*, as far as the checker can say: its literal value,
 * the literal values of one of its properties, the name of the function it
 * sits in.
 *
 * The syntactic scans each kept a table of `const NAME = "…"` declarations,
 * keyed by *name*, so two modules exporting the same name made both
 * ambiguous, and a value imported under another name was invisible. Here a
 * value is resolved through its binding — imports, re-exports and all.
 */
import ts from "typescript";

export type Literal = string | number | boolean;

/** Strips parentheses, `as`, `satisfies`, `<T>` assertions and `!`. */
export const unwrapExpression = (node: ts.Expression): ts.Expression => {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
};

/** The literal a single type stands for, if it is one. */
const literalOfType = (
  checker: ts.TypeChecker,
  type: ts.Type,
): Literal | undefined => {
  if (type.isStringLiteral()) return type.value;
  if (type.isNumberLiteral()) return type.value;
  if (type.flags & ts.TypeFlags.BooleanLiteral) {
    return checker.typeToString(type) === "true";
  }
  return undefined;
};

/**
 * Every literal a type can be — `"a" | "b"` → `["a", "b"]` — or `null` if any
 * constituent is not a literal (`string`, an object, `any`).
 */
export const literalsOfType = (
  checker: ts.TypeChecker,
  type: ts.Type,
): Literal[] | null => {
  const members = type.isUnion() ? type.types : [type];
  const out: Literal[] = [];
  for (const member of members) {
    const literal = literalOfType(checker, member);
    if (literal === undefined) return null;
    out.push(literal);
  }
  // `boolean` is `true | false`; keep the order stable either way.
  return [...new Set(out)];
};

/** The symbol behind an alias (an import, a re-export), or the symbol itself. */
export const resolveAlias = (
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
): ts.Symbol =>
  symbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;

/**
 * The value `node` is fixed to by its declaration, followed through
 * identifiers and property reads: a `const` with a literal initializer, or a
 * property of a `const` object literal. `undefined` for anything else.
 *
 * This is what makes `const C = { k: "v" }` then `C.k` a constant even though
 * its *type* is widened to `string`.
 */
const declaredLiteral = (
  checker: ts.TypeChecker,
  node: ts.Expression,
  depth: number,
): Literal | undefined => {
  if (depth > 8) return undefined;
  const expression = unwrapExpression(node);
  const direct = literalOfExpressionSyntax(expression);
  if (direct !== undefined) return direct;
  if (
    !ts.isIdentifier(expression) &&
    !ts.isPropertyAccessExpression(expression)
  ) {
    return undefined;
  }
  const at = ts.isPropertyAccessExpression(expression)
    ? expression.name
    : expression;
  const symbol = checker.getSymbolAtLocation(at);
  if (symbol === undefined) return undefined;
  const declaration = resolveAlias(checker, symbol).valueDeclaration;
  if (declaration === undefined) return undefined;
  if (
    ts.isVariableDeclaration(declaration) &&
    declaration.initializer !== undefined &&
    ts.isVariableDeclarationList(declaration.parent) &&
    declaration.parent.flags & ts.NodeFlags.Const
  ) {
    return declaredLiteral(checker, declaration.initializer, depth + 1);
  }
  if (
    ts.isPropertyAssignment(declaration) &&
    ts.isObjectLiteralExpression(declaration.parent)
  ) {
    // Only a property of an object bound to a `const`: the binding cannot
    // be reassigned, and a literal-keyed property of it is what the old
    // syntactic tables treated as constant too.
    let holder: ts.Node = declaration.parent.parent;
    while (
      ts.isAsExpression(holder) ||
      ts.isSatisfiesExpression(holder) ||
      ts.isParenthesizedExpression(holder)
    ) {
      holder = holder.parent;
    }
    if (
      ts.isVariableDeclaration(holder) &&
      ts.isVariableDeclarationList(holder.parent) &&
      holder.parent.flags & ts.NodeFlags.Const
    ) {
      return declaredLiteral(checker, declaration.initializer, depth + 1);
    }
  }
  return undefined;
};

const literalOfExpressionSyntax = (
  expression: ts.Expression,
): Literal | undefined => {
  if (ts.isStringLiteralLike(expression)) return expression.text;
  if (ts.isNumericLiteral(expression)) return Number(expression.text);
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  return undefined;
};

/**
 * The values `node` can be, if the checker can pin them to literals: its
 * literal type (`"a"`, `"a" | "b"`), or failing that the literal its `const`
 * declaration fixes it to. `null` when neither says.
 */
export const literalValues = (
  checker: ts.TypeChecker,
  node: ts.Expression,
): Literal[] | null => {
  const expression = unwrapExpression(node);
  const fromType = literalsOfType(
    checker,
    checker.getTypeAtLocation(expression),
  );
  if (fromType !== null && fromType.length > 0) return fromType;
  const declared = declaredLiteral(checker, expression, 0);
  return declared === undefined ? null : [declared];
};

/** The one value `node` is, or `undefined` if it is not exactly one literal. */
export const literalValue = (
  checker: ts.TypeChecker,
  node: ts.Expression,
): Literal | undefined => {
  const values = literalValues(checker, node);
  return values?.length === 1 ? values[0] : undefined;
};

/**
 * The literals property `name` has across every constituent of `type` —
 * `{ key: "A.m" } | { key: "B.n" }` and `"key"` → `["A.m", "B.n"]` — or
 * `null` if any constituent lacks it or has a non-literal type there.
 */
export const propertyLiterals = (
  checker: ts.TypeChecker,
  type: ts.Type,
  name: string,
): Literal[] | null => {
  const members = type.isUnion() ? type.types : [type];
  const out: Literal[] = [];
  for (const member of members) {
    const property = member.getProperty(name);
    if (property === undefined) return null;
    const literals = literalsOfType(checker, checker.getTypeOfSymbol(property));
    if (literals === null) return null;
    out.push(...literals);
  }
  return [...new Set(out)];
};

/** A property name as written (`foo`, `"foo"`, `#foo`, `[k]`). */
const memberName = (name: ts.PropertyName): string =>
  ts.isIdentifier(name) ||
  ts.isPrivateIdentifier(name) ||
  ts.isStringLiteral(name)
    ? name.text
    : name.getText();

/**
 * The nearest *named* function around `node`: `Class.method`, a function's
 * own name, or the variable/property an arrow is assigned to. Anonymous
 * callbacks are walked through — `this.tx(async (tx) => write(tx))` belongs to
 * the method that opened the transaction. `"<module>"` at top level.
 */
export const enclosingName = (node: ts.Node): string => {
  const owner = (member: ts.Node, name: string): string => {
    const container = member.parent;
    if (container !== undefined && ts.isClassLike(container)) {
      return `${container.name?.text ?? "<anonymous class>"}.${name}`;
    }
    return name;
  };
  for (let current = node.parent; current !== undefined; ) {
    if (
      ts.isMethodDeclaration(current) ||
      ts.isGetAccessorDeclaration(current) ||
      ts.isSetAccessorDeclaration(current)
    ) {
      return owner(current, memberName(current.name));
    }
    if (ts.isConstructorDeclaration(current)) {
      return owner(current, "constructor");
    }
    if (ts.isFunctionDeclaration(current) && current.name !== undefined) {
      return current.name.text;
    }
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const holder = current.parent;
      if (ts.isVariableDeclaration(holder) && ts.isIdentifier(holder.name)) {
        return holder.name.text;
      }
      if (ts.isPropertyDeclaration(holder)) {
        return owner(holder, memberName(holder.name));
      }
      if (ts.isPropertyAssignment(holder)) return memberName(holder.name);
    }
    current = current.parent;
  }
  return "<module>";
};

/**
 * True where a type is expected (`typeof f`, an annotation): a reference
 * there executes nothing. `extends Foo` is an `ExpressionWithTypeArguments` —
 * a type node that holds a *value* — and is not a type position.
 */
export const inTypePosition = (node: ts.Node): boolean => {
  for (let current = node.parent; current !== undefined; ) {
    if (ts.isTypeNode(current) && !ts.isExpressionWithTypeArguments(current)) {
      return true;
    }
    if (ts.isStatement(current) || ts.isSourceFile(current)) return false;
    current = current.parent;
  }
  return false;
};
