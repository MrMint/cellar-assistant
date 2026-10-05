/**
 * No raw `toLocale*` in rendered client source — the React #418 guard.
 *
 * ## Why this rule is not pedantic
 *
 * `new Date(iso).toLocaleString()` inside a client component that a server
 * component seeded is a **production-only crash**, and the reason it survives
 * review is that the two environments disagree about how bad it is. `next dev`
 * treats a hydration text mismatch as a *recoverable* error: it logs a warning
 * and patches the DOM, so the page looks right and nobody investigates. A
 * `next build` throws **React error #418** instead, which surfaces as an
 * uncaught error and fails any spec watching `pageerror`.
 *
 * So the defect is invisible in exactly the environment developers work in.
 * `/map/scans` carried it for a long time and was only caught the first time
 * the Playwright suite ran against a production build: the container sets no
 * `TZ`, so Node resolved UTC and the server wrote
 *
 *     <span class="…MuiTypography-body-xs…">9/11/2026, 4:46:36 AM</span>
 *
 * for `2026-09-11T04:46:36.348Z`, while a viewer in `America/Chicago` rendered
 * `9/10/2026, 11:46:36 PM` — a different calendar *day*, in a text node React
 * compares during hydration. Two specs failed on that one string. A sweep then
 * found the same call on `/cellars/[cellarId]` and `/brands/[brandId]`, both
 * dynamic routes the static-route spec never visits, so nothing was reporting
 * them at all.
 *
 * `@/components/common/Timestamp` is the one place allowed to format a date for
 * a human, because it is the one place built not to break: its first render is
 * assembled from UTC parts by hand — deliberately never through `Intl`, whose
 * server and browser copies are versioned separately — and the viewer's own
 * locale and zone are applied in an effect, after hydration has committed.
 *
 * ## Why a test rather than a lint rule
 *
 * Biome 2.5.3 offers `noRestrictedGlobals`, `noRestrictedImports`,
 * `noRestrictedTypes` and `noRestrictedElements`. A `.toLocaleString()` is a
 * method call on an arbitrary expression — not a global, an import, a type or a
 * JSX element — so none of them can express it, and Biome has no general
 * syntax-restriction rule. This runs with the other `dev-checks` in a few
 * hundred milliseconds and needs no browser, server, Docker or database.
 *
 * ## Why prose is judged per line rather than by stripping comments
 *
 * A mention of the pattern must not trip the rule, or documenting the trap
 * becomes a lint failure. The obvious way to arrange that — blank out every
 * `/* … *\/` and `// …` span, then match — was written first and was **wrong**,
 * for a reason this very tree supplies: `MenuScansList.tsx:212` contains
 * `accept="image/*"`, and a scanner that looks for comment delimiters without
 * tracking string literals reads that `/*` as the start of a comment and blanks
 * the remainder of the file. The guard then passed while the defect it exists
 * to catch sat twelve lines below, which is the worst failure mode available to
 * a guard. Judging each match by whether *its own line* opens as a comment
 * needs no string tracking and cannot be defeated that way.
 *
 *   bun run --filter @cellar-assistant/client test
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/** `services/client/src`, derived from this file rather than `process.cwd()`. */
const CLIENT_SRC = fileURLToPath(new URL("../../", import.meta.url));

/**
 * The only module allowed to call `toLocale*`, as a repo-relative path.
 *
 * A set rather than a string so that a genuine second exemption is a one-line,
 * reviewable change rather than a reason to delete the rule.
 */
const ALLOWED = new Set(["components/common/Timestamp.tsx"]);

const LOCALE_CALL = /\.toLocale(?:String|DateString|TimeString)\s*\(/;

/**
 * True when this line is prose rather than code.
 *
 * Covers the two comment shapes this repo actually writes: a `//` line, and a
 * JSDoc body line, whose continuation marker is `*`. A real call sharing a line
 * with a trailing comment is still judged code, which is the safe direction.
 */
export const isCommentLine = (line: string): boolean =>
  /^\s*(?:\/\/|\/\*|\*)/.test(line);

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    // Test files are excluded: the rule is about what gets rendered, and a
    // fixture asserting on locale output is not a hydration hazard.
    else if (/\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
      out.push(path);
  }
  return out;
};

type Finding = { readonly file: string; readonly line: number };

const scan = (): { findings: Finding[]; files: number; allowed: number } => {
  const findings: Finding[] = [];
  let allowed = 0;
  const files = walk(CLIENT_SRC);

  for (const path of files) {
    const rel = relative(CLIENT_SRC, path).split(sep).join("/");
    const lines = readFileSync(path, "utf8").split("\n");

    lines.forEach((line, index) => {
      if (!LOCALE_CALL.test(line) || isCommentLine(line)) return;
      if (ALLOWED.has(rel)) {
        allowed += 1;
        return;
      }
      findings.push({ file: rel, line: index + 1 });
    });
  }
  return { findings, files: files.length, allowed };
};

const result = scan();

test("no rendered client module formats a date with toLocale*", () => {
  assert.deepEqual(
    result.findings.map((f) => `${f.file}:${f.line}`),
    [],
    `A raw \`toLocale*\` call reached rendered client source. In a server-rendered
component this is **React error #418 in production** — the server formats in the
container's zone (no \`TZ\`, so UTC) and the browser formats in the viewer's, so
the two disagree on a text node React compares. \`next dev\` hides it as a
recoverable warning, which is why it will look fine to you locally.

Render the value with \`<Timestamp iso={…} />\` from
\`@/components/common/Timestamp\` instead — it takes \`precision="date"\` as well
as the default date-and-time. If you genuinely need a second exemption, add the
file to ALLOWED in this test and say why.
`,
  );
});

test("the scan walked the tree and found the one legitimate call", () => {
  // Guards against a vacuous pass: a rule that silently walks nothing asserts
  // nothing, which is how the first draft of this file hid a live defect.
  assert.ok(
    result.files > 100,
    `only walked ${result.files} files under ${CLIENT_SRC} — the rule is not looking at the tree`,
  );
  assert.equal(
    result.allowed,
    1,
    `expected exactly one allowed toLocale* call (Timestamp's own, applied after hydration), found ${result.allowed}`,
  );
});

test("prose is not a violation, but code on a comment-free line is", () => {
  assert.equal(isCommentLine(" * `d.toLocaleString()` is the trap"), true);
  assert.equal(isCommentLine("  // d.toLocaleString() would break"), true);
  assert.equal(isCommentLine("/** d.toLocaleString() */"), true);
  assert.equal(isCommentLine("  const s = d.toLocaleString();"), false);
});

test("a string literal holding /* cannot blind the scan", () => {
  // The regression that motivated the per-line design: `accept="image/*"` sits
  // above the call site in MenuScansList.tsx, and a comment-stripping scanner
  // treated everything after it as a comment.
  const source = ['const accept = "image/*";', "const s = d.toLocaleString();"];
  const hits = source.filter(
    (line) => LOCALE_CALL.test(line) && !isCommentLine(line),
  );
  assert.deepEqual(hits, ["const s = d.toLocaleString();"]);
});
