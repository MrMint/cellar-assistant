/**
 * The UI-platform guard (D20): what the client may still use while the Joy →
 * shadcn migration is in flight, and — after the removal step — not at all.
 *
 * A static scan, like `client-boundary.ts`: it reads source and nothing else.
 * Unlike that scan it parses with the TypeScript compiler, because the rules
 * are about *code* (an import, a JSX `sx` prop, a colour in a string) and a
 * regex cannot tell code from a comment or a test fixture's string.
 *
 * ## The rules
 *
 * | rule            | what it flags                                                        |
 * |-----------------|----------------------------------------------------------------------|
 * | `joy-import`    | an import of `@mui/*` or `@emotion/*`                                 |
 * | `framer-motion` | an import of `framer-motion` (use `motion/react`)                     |
 * | `legacy-dep`    | an import of `react-icons` or `react-simple-star-rating`              |
 * | `sx-prop`       | a JSX `sx=` attribute                                                 |
 * | `raw-colour`    | a hex colour or `rgb(`/`rgba(`/`hsl(` in a string (non-test source)   |
 * | `arbitrary-colour` | a Tailwind arbitrary colour class, `bg-[#…]` / `text-[rgb(…)]`     |
 * | `palette-colour` | a Tailwind default-palette class, `text-red-500` / `bg-zinc-900/50` (bypasses the tokens) |
 * | `motion-literal`| a `stiffness`/`damping`/`bounce`/`mass`/`visualDuration` number, a numeric `duration`/`delay` or a numeric `ease` curve in a `transition`, or a `duration-[…]`/`ease-[…]` class |
 * | `reduced-motion-query` | a hand-rolled `prefers-reduced-motion` media query (use `useReducedMotion`) |
 *
 * ## Phase 1 (now → the removal step)
 *
 * Files in `ui-platform.legacy.json` — frozen when the foundation landed, the
 * files that still used the old platform then — are exempt from every rule
 * but `framer-motion`, `arbitrary-colour` and `palette-colour`, which nothing
 * may break. A
 * converted file simply stops matching; nobody edits the list (so it never
 * conflicts), and it can only go stale in the safe direction.
 * `raw-colour` also exempts `COLOUR_ALLOWLIST`: code that cannot read a CSS
 * variable (MapLibre paint, canvas, the offline page, the manifest).
 * `motion-literal` exempts `src/lib/motion.ts`, where the tokens live.
 *
 * ## Final (the removal step)
 *
 * The legacy list is deleted and every rule applies everywhere, colour
 * allowlist and `lib/motion.ts` aside.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/** `services/client`, derived from this file. */
export const CLIENT_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SRC = join(CLIENT_ROOT, "src");

export type Rule =
  | "joy-import"
  | "framer-motion"
  | "legacy-dep"
  | "sx-prop"
  | "raw-colour"
  | "arbitrary-colour"
  | "palette-colour"
  | "motion-literal"
  | "reduced-motion-query";

export type Finding = {
  /** Relative to `services/client`, forward-slashed: `src/components/…`. */
  readonly file: string;
  readonly line: number;
  readonly rule: Rule;
  readonly detail: string;
};

/** Rules a legacy file is still held to. */
export const ALWAYS_ENFORCED: ReadonlySet<Rule> = new Set<Rule>([
  "framer-motion",
  "arbitrary-colour",
  "palette-colour",
]);

/**
 * Where a raw colour is allowed, because the code cannot read a CSS variable
 * (or must render without the app's CSS). Read the values from `lib/tokens.ts`
 * where possible even here.
 */
export const COLOUR_ALLOWLIST: readonly RegExp[] = [
  /^src\/lib\/tokens\.ts$/,
  /^src\/components\/map\/constants\/colors\.ts$/,
  /^src\/components\/map\/maplibre\//, // MapLibre paint
  /^src\/components\/tier-list\/insights\/CountryHeatmap\.tsx$/, // MapLibre paint
  /^src\/app\/~offline\/page\.tsx$/, // renders without the app's CSS
  /^src\/app\/manifest\.ts$/,
  /^src\/components\/common\/AnimationShowcase\.tsx$/, // canvas
  /^src\/components\/auth\/LiquidBackground\.tsx$/, // canvas
];

/** Where motion literals are the point. */
export const MOTION_ALLOWLIST: readonly RegExp[] = [/^src\/lib\/motion\.ts$/];

const JOY_IMPORT = /^@(mui|emotion)\//;
const LEGACY_DEP = /^(react-icons|react-simple-star-rating)(\/|$)/;
const HEX =
  /(^|[^\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/;
const FUNC_COLOUR = /\b(rgba?|hsla?)\(/;
const ARBITRARY_COLOUR = /-\[(?:#|(?:rgba?|hsla?|oklch|oklab|color-mix)\()/;
const ARBITRARY_MOTION = /\b(duration|ease|delay)-\[/;
/**
 * Tailwind's built-in palette (`text-red-500`, `hover:bg-zinc-900/50`): a raw
 * colour by another name. The app's colours are the `globals.css` roles.
 * `black`/`white` stay legal (scrims, shadows).
 */
const PALETTE_COLOUR =
  /(?<![\w-])-?(?:bg|text|border(?:-[xytrblse])?|ring(?:-offset)?|inset-ring|outline|fill|stroke|from|via|to|decoration|divide|placeholder|caret|accent|shadow|inset-shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|[1-9]00|950)(?![\w-])/;
/** Spring parameters that only ever mean a literal spring. */
const SPRING_KEYS = new Set([
  "stiffness",
  "damping",
  "bounce",
  "mass",
  "visualDuration",
]);
/** Timing keys that are a literal only inside a `transition`. */
const TRANSITION_TIME_KEYS = new Set(["duration", "delay"]);
const REDUCED_MOTION_QUERY = /prefers-reduced-motion/;

const isTest = (file: string) => /\.test\.tsx?$/.test(file);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx|mts)$/.test(name) && !name.endsWith(".d.ts"))
      out.push(path);
  }
  return out;
}

/** The text of a string-ish literal, or undefined. */
function literalText(node: ts.Node): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return node.text;
  if (
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
  )
    return node.text;
  if (ts.isJsxText(node)) return undefined; // prose, not styling
  return undefined;
}

function propName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return undefined;
}

/** Scan one file's source. Exported for the guard's own tests. */
export function scanSource(file: string, source: string): Finding[] {
  const findings: Finding[] = [];
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const test = isTest(file);
  const add = (node: ts.Node, rule: Rule, detail: string) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    findings.push({ file, line: line + 1, rule, detail });
  };
  const importRule = (node: ts.Node, spec: string) => {
    if (spec === "framer-motion" || spec.startsWith("framer-motion/"))
      add(node, "framer-motion", spec);
    else if (JOY_IMPORT.test(spec)) add(node, "joy-import", spec);
    else if (LEGACY_DEP.test(spec)) add(node, "legacy-dep", spec);
  };

  const visit = (node: ts.Node, inTransition: boolean) => {
    // Imports, static and dynamic, and re-exports.
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      importRule(node, node.moduleSpecifier.text);
      return;
    }
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require")) &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      importRule(node, node.arguments[0].text);
    }
    // bun's `mock.module("@mui/joy", …)` in a test is still a dependency on it.
    if (
      test &&
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "module" &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      importRule(node, node.arguments[0].text);
    }

    if (ts.isJsxAttribute(node) && node.name.getText(sf) === "sx") {
      add(node, "sx-prop", "sx=");
    }

    let childInTransition = inTransition;
    if (!test) {
      if (ts.isJsxAttribute(node) && node.name.getText(sf) === "transition")
        childInTransition = true;
      if (ts.isPropertyAssignment(node) && propName(node.name) === "transition")
        childInTransition = true;

      if (ts.isPropertyAssignment(node)) {
        const key = propName(node.name);
        const numeric =
          ts.isNumericLiteral(node.initializer) ||
          (ts.isPrefixUnaryExpression(node.initializer) &&
            ts.isNumericLiteral(node.initializer.operand));
        if (numeric && key !== undefined && SPRING_KEYS.has(key))
          add(
            node,
            "motion-literal",
            `${key}: ${node.initializer.getText(sf)}`,
          );
        if (
          numeric &&
          key !== undefined &&
          TRANSITION_TIME_KEYS.has(key) &&
          inTransition
        )
          add(
            node,
            "motion-literal",
            `${key}: ${node.initializer.getText(sf)}`,
          );
        // A hand-written cubic-bézier: `ease: [0.4, 0, 0.2, 1]`.
        if (
          key === "ease" &&
          inTransition &&
          ts.isArrayLiteralExpression(node.initializer) &&
          node.initializer.elements.length > 0 &&
          node.initializer.elements.every(ts.isNumericLiteral)
        )
          add(node, "motion-literal", `ease: ${node.initializer.getText(sf)}`);
      }

      const text = literalText(node);
      if (text !== undefined) {
        if (ARBITRARY_COLOUR.test(text))
          add(node, "arbitrary-colour", text.slice(0, 80));
        else if (HEX.test(text) || FUNC_COLOUR.test(text))
          add(node, "raw-colour", text.slice(0, 80));
        if (PALETTE_COLOUR.test(text))
          add(node, "palette-colour", text.slice(0, 80));
        if (ARBITRARY_MOTION.test(text))
          add(node, "motion-literal", text.slice(0, 80));
        if (REDUCED_MOTION_QUERY.test(text))
          add(node, "reduced-motion-query", text.slice(0, 80));
      }
    }
    ts.forEachChild(node, (child) => visit(child, childInTransition));
  };
  visit(sf, false);
  return findings;
}

/** Scan every `.ts`/`.tsx` under `services/client/src`. */
export function scanUiPlatform(): Finding[] {
  return walk(SRC).flatMap((path) =>
    scanSource(
      relative(CLIENT_ROOT, path).split(sep).join("/"),
      readFileSync(path, "utf8"),
    ),
  );
}

/** Findings that break the phase-1 rules, given the frozen legacy list. */
export function violations(
  findings: readonly Finding[],
  legacy: ReadonlySet<string>,
): Finding[] {
  return findings.filter((f) => {
    if (legacy.has(f.file) && !ALWAYS_ENFORCED.has(f.rule)) return false;
    if (f.rule === "raw-colour" && COLOUR_ALLOWLIST.some((r) => r.test(f.file)))
      return false;
    if (
      f.rule === "motion-literal" &&
      MOTION_ALLOWLIST.some((r) => r.test(f.file))
    )
      return false;
    return true;
  });
}

export const formatFindings = (findings: readonly Finding[]): string =>
  findings
    .map((f) => `  ${f.file}:${f.line}  [${f.rule}]  ${f.detail}`)
    .join("\n");
