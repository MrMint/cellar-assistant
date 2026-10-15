/**
 * X21 · every control has a name.
 *
 * `app/IconButton` makes `aria-label` a required prop, so the type checker
 * already refuses an unnamed icon button there. Nothing refuses one written
 * any other way: a bare `<button>` around a glyph, a `ui/button` with only an
 * icon in it, an `<a>`/`Link` whose only child is an icon. A screen reader
 * announces each as "button" or "link" and nothing else — design §3.4's
 * "25 of 47 IconButtons are unnamed" was this, counted by hand.
 *
 * This is a static scan, like `ui-platform.ts`: it parses each `.tsx` with the
 * TypeScript compiler and judges each control element by what its JSX gives
 * it. It cannot see a rendered page, so it is deliberately one-sided — it only
 * flags what is **certainly** unnamed from the source alone:
 *
 * - The element is a control: `button`, `Button`, `a`, `Link`, a Radix
 *   `…Trigger` or `…Close`, or anything with `role="button"` / `role="link"`.
 * - It has no `aria-label`, `aria-labelledby` or `title`, no `id` (which a
 *   `<label htmlFor>` may name — a select's trigger), and no spread props
 *   (`{...props}` may carry a name, so it is not judged).
 * - It is not `asChild` (its child is the control, judged with the parent's
 *   attributes — `<IconButton aria-label="Back" asChild><Link …>` is named).
 * - Nothing inside it can produce a name: no text, no `{expression}` (which
 *   may render text), no `sr-only` text, no `<img alt>`, no element carrying
 *   its own `aria-label`. A capitalised element with no children of its own
 *   (`<Close />`, `<Share className="size-5" />`) counts as an icon.
 *
 * The axe gate in `packages/e2e/specs/mobile/m21-axe.spec.ts` is the other
 * half: it sees rendered names, but only on the routes and states it visits.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import { CLIENT_ROOT } from "./ui-platform";

const SRC = join(CLIENT_ROOT, "src");

export type UnnamedControl = {
  /** Relative to `services/client`, forward-slashed. */
  readonly file: string;
  readonly line: number;
  /** The control's tag, as written. */
  readonly tag: string;
};

/** Native and shadcn controls, and Radix's `…Trigger` / `…Close` buttons. */
const CONTROL_TAG = /^(?:button|Button|a|Link|\w+Trigger|\w+Close)$/;
const CONTROL_ROLES = new Set(["button", "link"]);
const NAMING_ATTRIBUTES = ["aria-label", "aria-labelledby", "title"] as const;

type Jsx = ts.JsxElement | ts.JsxSelfClosingElement;

const opening = (node: Jsx) =>
  ts.isJsxElement(node) ? node.openingElement : node;

const tagOf = (node: Jsx) => opening(node).tagName.getText();

const attribute = (node: Jsx, name: string): ts.JsxAttribute | undefined =>
  opening(node).attributes.properties.find(
    (p): p is ts.JsxAttribute =>
      ts.isJsxAttribute(p) && p.name.getText() === name,
  );

const stringAttribute = (node: Jsx, name: string): string | undefined => {
  const init = attribute(node, name)?.initializer;
  if (init === undefined) return undefined;
  if (ts.isStringLiteral(init)) return init.text;
  if (
    ts.isJsxExpression(init) &&
    init.expression !== undefined &&
    (ts.isStringLiteral(init.expression) ||
      ts.isNoSubstitutionTemplateLiteral(init.expression))
  )
    return init.expression.text;
  return undefined;
};

const hasSpread = (node: Jsx) =>
  opening(node).attributes.properties.some(ts.isJsxSpreadAttribute);

/** A name-giving attribute with a value that is not the empty string. */
const namedByAttribute = (node: Jsx): boolean =>
  NAMING_ATTRIBUTES.some((name) => {
    const attr = attribute(node, name);
    if (attr === undefined) return false;
    const text = stringAttribute(node, name);
    return text === undefined || text.trim() !== "";
  });

const isControl = (node: Jsx): boolean => {
  if (CONTROL_TAG.test(tagOf(node))) return true;
  const role = stringAttribute(node, "role");
  return role !== undefined && CONTROL_ROLES.has(role);
};

/** Whether anything among these children can give the control a name. */
function childrenName(children: ts.NodeArray<ts.JsxChild>): boolean {
  return children.some((child) => {
    if (ts.isJsxText(child)) return child.text.trim() !== "";
    // `{label}`, `{count}`, `{cond && "x"}`: may render text; not judged.
    if (ts.isJsxExpression(child)) return child.expression !== undefined;
    if (ts.isJsxFragment(child)) return childrenName(child.children);
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child))
      return elementName(child);
    return false;
  });
}

/** Whether one descendant element can contribute to a name. */
function elementName(node: Jsx): boolean {
  if (namedByAttribute(node)) return true;
  if (hasSpread(node)) return true;
  if (attribute(node, "aria-hidden") !== undefined) return false;
  const tag = tagOf(node);
  if (tag === "img" || tag === "Image")
    return (stringAttribute(node, "alt") ?? "x").trim() !== "";
  // A capitalised element with no children: an icon (or a component whose
  // own text this scan cannot see — a prop like `label` is taken as text).
  if (ts.isJsxSelfClosingElement(node)) {
    return ["label", "children", "text", "alt", "displayName"].some(
      (prop) => attribute(node, prop) !== undefined,
    );
  }
  return childrenName(node.children);
}

/** Scan one file's source. Exported for the guard's own tests. */
export function scanControlNames(
  file: string,
  source: string,
): UnnamedControl[] {
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const found: UnnamedControl[] = [];
  /** `<X asChild aria-label="…">` hands its name to the child it renders. */
  const namedBySlotParent = (node: Jsx): boolean => {
    const parent = node.parent;
    if (!ts.isJsxElement(parent)) return false;
    return (
      attribute(parent, "asChild") !== undefined &&
      (namedByAttribute(parent) || hasSpread(parent))
    );
  };
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) &&
      isControl(node) &&
      attribute(node, "asChild") === undefined &&
      !namedByAttribute(node) &&
      attribute(node, "id") === undefined &&
      !hasSpread(node) &&
      !namedBySlotParent(node) &&
      (ts.isJsxSelfClosingElement(node) || !childrenName(node.children))
    ) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      found.push({ file, line: line + 1, tag: tagOf(node) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (name.endsWith(".tsx") && !/\.test\.tsx$/.test(name))
      out.push(path);
  }
  return out;
}

/** Every certainly-unnamed control in `src/`. */
export function scanAllControlNames(): UnnamedControl[] {
  return walk(SRC).flatMap((path) =>
    scanControlNames(
      relative(CLIENT_ROOT, path).split(sep).join("/"),
      readFileSync(path, "utf8"),
    ),
  );
}
