/**
 * Every navigation carries its transition (B05, plan L5/L25).
 *
 * The page transition is chosen in two places: `app/Link.tsx` for links and
 * `app/useNavigate.ts` for code. A `next/link` imported anywhere else, or a
 * `push` / `replace` / `back` on `useRouter()`'s router, navigates with no
 * kind, so its page swaps without the slide every other move has — and
 * nothing else would notice. `refresh` and `prefetch` stay on `useRouter()`
 * (L25): they carry no transition.
 *
 * The checker is run on fixtures first, so a checker that finds nothing is
 * a failure here rather than a silent pass over the tree.
 *
 *   bun run --filter @cellar-assistant/client test
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const SRC = fileURLToPath(new URL("../..", import.meta.url));

/** The two files allowed to do what this guard forbids, relative to `src/`. */
const LINK_FILE = "components/app/Link.tsx";
const NAVIGATE_FILE = "components/app/useNavigate.ts";

const MOVES = new Set(["push", "replace", "back"]);

const isUseRouterCall = (node: ts.Node | undefined): boolean =>
  node !== undefined &&
  ts.isCallExpression(node) &&
  ts.isIdentifier(node.expression) &&
  node.expression.text === "useRouter";

/** What a file does that the guard forbids, as `line: what` strings. */
export function navigationViolations(file: string, source: string): string[] {
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found: string[] = [];
  const at = (node: ts.Node, what: string) =>
    found.push(
      `${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}: ${what}`,
    );
  const routers = new Set<string>();

  // Pass 1: which names hold `useRouter()`'s router; destructured moves.
  const collect = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && isUseRouterCall(node.initializer)) {
      if (ts.isIdentifier(node.name)) routers.add(node.name.text);
      else if (ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          const key = element.propertyName ?? element.name;
          if (ts.isIdentifier(key) && MOVES.has(key.text)) {
            at(element, `destructures ${key.text} from useRouter()`);
          }
        }
      }
    }
    ts.forEachChild(node, collect);
  };
  // Pass 2: imports of next/link, and moves on a router.
  const check = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === "next/link" &&
      file !== LINK_FILE
    ) {
      at(node, "imports next/link (use app/Link)");
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      MOVES.has(node.expression.name.text) &&
      file !== NAVIGATE_FILE
    ) {
      const target = node.expression.expression;
      if (
        (ts.isIdentifier(target) && routers.has(target.text)) ||
        isUseRouterCall(target)
      ) {
        at(node, `router.${node.expression.name.text}() outside useNavigate`);
      }
    }
    ts.forEachChild(node, check);
  };
  collect(sf);
  check(sf);
  return found;
}

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "node_modules" && name !== "__generated__") {
        yield* sourceFiles(path);
      }
    } else if (/\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) {
      yield path;
    }
  }
}

describe("navigation guard (fixtures)", () => {
  test("flags a next/link import outside app/Link.tsx", () => {
    const src = `import NextLink from "next/link";\nexport { default } from "next/link";`;
    assert.deepEqual(navigationViolations("components/x/Card.tsx", src), [
      "1: imports next/link (use app/Link)",
      "2: imports next/link (use app/Link)",
    ]);
    assert.deepEqual(navigationViolations(LINK_FILE, src), []);
  });

  test("flags push, replace and back on useRouter()'s router", () => {
    const src = [
      `import { useRouter } from "next/navigation";`,
      `export function A() {`,
      `  const router = useRouter();`,
      `  router.push("/a");`,
      `  router.replace("/b", { scroll: false });`,
      `  router.back();`,
      `  router.refresh();`,
      `  router.prefetch("/c");`,
      `  useRouter().push("/d");`,
      `  const { replace, back: goBack, refresh } = useRouter();`,
      `  [1].push(2);`,
      `}`,
    ].join("\n");
    assert.deepEqual(navigationViolations("components/x/A.tsx", src), [
      "10: destructures replace from useRouter()",
      "10: destructures back from useRouter()",
      "4: router.push() outside useNavigate",
      "5: router.replace() outside useNavigate",
      "6: router.back() outside useNavigate",
      "9: router.push() outside useNavigate",
    ]);
    assert.equal(navigationViolations(NAVIGATE_FILE, src).length, 2);
  });

  test("passes useNavigate, refresh and prefetch", () => {
    const src = [
      `const navigate = useNavigate();`,
      `const router = useRouter();`,
      `navigate.push("/a"); navigate.replace("/b"); navigate.back();`,
      `router.refresh(); router.prefetch("/c");`,
    ].join("\n");
    assert.deepEqual(navigationViolations("components/x/B.tsx", src), []);
  });
});

describe("navigation guard (the tree)", () => {
  test("no file under src/ navigates around Link or useNavigate", () => {
    const failures: string[] = [];
    let files = 0;
    for (const path of sourceFiles(SRC)) {
      files += 1;
      const rel = relative(SRC, path).split(sep).join("/");
      for (const v of navigationViolations(rel, readFileSync(path, "utf8"))) {
        failures.push(`${rel}:${v}`);
      }
    }
    assert.ok(files > 500, `walked only ${files} files`);
    assert.deepEqual(failures, []);
  });
});
