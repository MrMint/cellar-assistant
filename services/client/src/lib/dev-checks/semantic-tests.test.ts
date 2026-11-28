/**
 * Tests assert on what people and assistive tech observe, never on a UI
 * library's class names (migration plan §1.6).
 *
 * A markup test that matches `MuiCard-root` or `MuiTypography-title-lg`, or an
 * e2e spec that clicks `.MuiAccordionSummary-button`, breaks the moment its
 * component moves from Joy to shadcn — even when the page is unchanged for
 * everyone using it — and then the conversion that broke it gets the blame.
 * So every such anchor was rewritten to copy, order, `href`, a role, an
 * `aria-*` attribute or a `data-slot`, and this keeps it that way.
 *
 * If this fails on your test: anchor it on something a person can observe.
 * `src/test-support/markup.ts` has the common ones (a loading indicator by
 * role, `isDisabled` for `disabled`/`aria-disabled`, `openTag`, `textOf`);
 * Playwright has `getByRole`, `getByLabel` and `getByText`. When the
 * component offers no such anchor, give it one — an `aria-label` on a
 * landmark, `aria-current`, `aria-invalid`, or a `data-slot` — rather than
 * reaching for its class.
 *
 * `lib/dev-checks/` is exempt: the UI-platform guard's own tests quote Joy
 * imports as fixtures.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test } from "node:test";
import { CLIENT_ROOT } from "./ui-platform";

const REPO = join(CLIENT_ROOT, "..", "..");
const ROOTS = [
  join(CLIENT_ROOT, "src"),
  join(REPO, "packages", "e2e", "specs"),
  join(REPO, "packages", "e2e", "fixtures"),
  join(REPO, "packages", "e2e", "visual"),
];
const EXEMPT = /^services\/client\/src\/lib\/dev-checks\//;

/**
 * What couples a test to Joy: a class name (`MuiCard-root`, `Mui-disabled`),
 * including one spelled through a regex group or an attribute selector
 * (`Mui(Card|Divider)-root`, `[class*=MuiChip]`); Emotion's labelled class
 * (`css-1cgyvsv-JoyCard-root`); a Joy CSS variable (`--Icon-color`,
 * `--joy-palette-…`; the app's own are lower-case, `--ca-…`); and a Joy
 * import or mock.
 */
const COUPLED = [
  /\bMui(?:[A-Z][A-Za-z]*)?-[A-Za-z][\w-]*/g,
  /\bMui(?:[A-Z][A-Za-z]*(?![\w-])|\(|\[)/g,
  /\bJoy[A-Z][A-Za-z]*-[A-Za-z][\w-]*/g,
  /--(?:joy-[\w-]+|[A-Z][A-Za-z]*-[A-Za-z][\w-]*)/g,
  /\b(?:import|mock\.module)\(\s*["']@mui\/[^"']+["']/g,
  /\bfrom\s+["']@mui\/[^"']+["']/g,
];

/** Test files, plus the helpers they share (`src/test-support/`). */
const isTestFile = (path: string): boolean =>
  /\.test\.tsx?$/.test(path) ||
  (path.includes(join("src", "test-support")) && /\.tsx?$/.test(path)) ||
  (path.includes(`${join("packages", "e2e")}`) && /\.tsx?$/.test(path));

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (isTestFile(path)) yield path;
  }
}

const scanCoupling = (source: string): string[] =>
  COUPLED.flatMap((re) => [...source.matchAll(re)].map((m) => m[0]));

describe("tests are anchored on semantics, not Joy markup", () => {
  const files = ROOTS.flatMap((root) => [...walk(root)]);

  test("the walk saw the client's tests and the e2e specs", () => {
    const rel = files.map((f) => relative(REPO, f));
    assert.ok(rel.some((f) => f.startsWith("services/client/src/components")));
    assert.ok(
      rel.some((f) => f.startsWith("services/client/src/test-support/")),
    );
    assert.ok(rel.some((f) => f.startsWith("packages/e2e/specs/")));
  });

  test("no test or spec names a Joy class or imports Joy", () => {
    const found = files
      .map((file) => ({
        file: relative(REPO, file),
        hits: scanCoupling(readFileSync(file, "utf8")),
      }))
      .filter(({ file, hits }) => hits.length > 0 && !EXEMPT.test(file))
      .map(({ file, hits }) => `${file}: ${[...new Set(hits)].join(", ")}`);
    assert.deepEqual(found, [], "see the header of this test");
  });

  test("the scanner itself", () => {
    assert.deepEqual(scanCoupling("assert.match(html, /MuiCard-root/);"), [
      "MuiCard-root",
    ]);
    assert.deepEqual(
      scanCoupling('page.locator(".MuiAccordionSummary-button")'),
      ["MuiAccordionSummary-button"],
    );
    assert.deepEqual(scanCoupling("/Mui-disabled/"), ["Mui-disabled"]);
    // The spellings that slipped past the first version of this scanner.
    assert.ok(
      scanCoupling("/Mui(Card|CardOverflow|Divider)-root/g").length > 0,
      "a class name built from a regex group",
    );
    assert.ok(
      scanCoupling('page.locator("[class*=MuiChip]")').length > 0,
      "a class named without its -root suffix",
    );
    assert.deepEqual(scanCoupling("/color:var\\(--Icon-color\\)/"), [
      "--Icon-color",
    ]);
    assert.deepEqual(scanCoupling("var(--joy-palette-primary-500)"), [
      "--joy-palette-primary-500",
    ]);
    assert.deepEqual(scanCoupling('class="css-1cgyvsv-JoyCard-root"'), [
      "JoyCard-root",
    ]);
    // The app's own variables are lower-case and are fair game.
    assert.deepEqual(scanCoupling("min-width:var(--ca-rating-target)"), []);
    assert.deepEqual(scanCoupling('mock.module("@mui/joy", () => ({}))'), [
      'mock.module("@mui/joy"',
    ]);
    // Prose about the library, and the console-noise filter, are not anchors.
    assert.deepEqual(scanCoupling("// Joy's Select is a listbox"), []);
    assert.deepEqual(scanCoupling("/MUI: The `sx` prop/"), []);
  });
});
