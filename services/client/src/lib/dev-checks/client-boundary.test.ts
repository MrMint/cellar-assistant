/**
 * X7 · the server/client boundary check, in the cheapest place that runs it.
 *
 * This started life as a Playwright spec under `packages/e2e/`, which was the most
 * expensive home in the repo for a check that needs no browser, no dev server,
 * no Docker and no database: there it only ran behind `bun run stack:up` and ~90s
 * of setup, and `packages/e2e/artifacts/` is gitignored because it holds live session
 * tokens, so the scan could never have been committed from there.
 *
 * Here it runs beside the other unit tests in a few hundred milliseconds.
 * `src/lib/dev-checks/client-boundary.ts` carries the reasoning for both rules
 * and, more importantly, for what rule 2 cannot see.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  formatFindings,
  hasUseClientDirective,
  scanClientBoundary,
} from "./client-boundary.ts";

const scan = scanClientBoundary();

test("no server module imports a non-component value from a client module", () => {
  assert.deepEqual(
    scan.valueImports,
    [],
    `Server modules reading values across the client boundary. Each is either a
500 (the client-reference stub is called) or a silently dropped GraphQL
variable (the stub is JSON.stringify'd away). Move the value into a module
with no "use client" directive and import it from both sides.

${formatFindings(scan.valueImports)}
`,
  );
});

test("no server module passes a function as a prop to a component", () => {
  assert.deepEqual(
    scan.functionProps,
    [],
    `Server modules passing a function across the client boundary — React
answers "Functions cannot be passed directly to Client Components". Bind the
two together inside a "use client" wrapper instead; @/components/common/Link
is that wrapper for next/link.

${formatFindings(scan.functionProps)}
`,
  );
});

test("the directive is found past a leading doc comment", () => {
  assert.equal(
    hasUseClientDirective('"use client";\nexport const a = 1;'),
    true,
  );
  assert.equal(
    hasUseClientDirective(`/**\n * ${"x".repeat(400)}\n */\n"use client";\n`),
    true,
    "a module whose doc comment runs past 200 characters is still a client module",
  );
  assert.equal(
    hasUseClientDirective('// a note\n"use client";\n'),
    true,
    "a line comment does not hide the directive",
  );
  assert.equal(
    hasUseClientDirective('import x from "y";\n"use client";\n'),
    false,
    "a directive after a statement is a no-op string and not a directive",
  );
});

/**
 * The two rules above only ever assert an empty list, so on their own they
 * cannot tell "nothing is broken" from "the scan is broken". These fixtures are
 * the real bugs, reduced: E2b's `CELLARS_PAGE_SIZE` read out of a `"use client"`
 * module, and E2e's `<Typography component={NextLink}>`. Both must be found, and
 * the legal shapes beside them must not be.
 */
const fixture = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), "boundary-scan-"));
  for (const [path, source] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, source);
  }
  return root;
};

test("rule 1 catches a value read out of a client module", () => {
  const root = fixture({
    "src/components/pagination.ts":
      '"use client";\nexport const PAGE_SIZE = 20;\nexport const Grid = () => null;\n',
    "src/app/page.tsx":
      'import { PAGE_SIZE, Grid } from "@/components/pagination";\n' +
      "export default function Page() {\n" +
      "  return <Grid first={PAGE_SIZE} />;\n" +
      "}\n",
  });
  const { valueImports } = scanClientBoundary(root);
  assert.equal(valueImports.length, 1, formatFindings(valueImports));
  assert.match(valueImports[0].message, /^PAGE_SIZE from/);
  assert.equal(
    valueImports[0].message.includes("Grid"),
    false,
    "Grid is rendered as <Grid />, which is the one legal way to consume it",
  );
});

test("rule 2 catches a component passed as a prop", () => {
  const root = fixture({
    "src/app/page.tsx":
      'import { Typography } from "@mui/joy";\n' +
      'import NextLink from "next/link";\n' +
      "export default function Page() {\n" +
      '  return <Typography component={NextLink} href="/x">x</Typography>;\n' +
      "}\n",
    "src/app/client/page.tsx":
      '"use client";\n' +
      'import { Typography } from "@mui/joy";\n' +
      'import NextLink from "next/link";\n' +
      "export default function Page() {\n" +
      '  return <Typography component={NextLink} href="/x">x</Typography>;\n' +
      "}\n",
  });
  const { functionProps } = scanClientBoundary(root);
  assert.equal(functionProps.length, 1, formatFindings(functionProps));
  assert.equal(functionProps[0].file, "src/app/page.tsx:4");
  assert.match(functionProps[0].message, /component=\{NextLink\}/);
});

test("rule 2 sees the prop on its own line, which is how it was written", () => {
  // Every one of the ten real sites was formatted this way by biome.
  const root = fixture({
    "src/app/page.tsx": [
      'import { Typography } from "@mui/joy";',
      'import NextLink from "next/link";',
      "export default function Page() {",
      "  return (",
      "    <Typography",
      "      component={NextLink}",
      '      href="/x"',
      '      sx={{ textDecoration: "underline" }}',
      "    >",
      "      x",
      "    </Typography>",
      "  );",
      "}",
    ].join("\n"),
  });
  const { functionProps } = scanClientBoundary(root);
  assert.equal(functionProps.length, 1, formatFindings(functionProps));
  assert.equal(functionProps[0].file, "src/app/page.tsx:6");
});

test("rule 2 catches a locally declared handler, and leaves data props alone", () => {
  const root = fixture({
    "src/app/page.tsx":
      'import { Chip } from "@mui/joy";\n' +
      "const onSave = () => {};\n" +
      "export default function Page() {\n" +
      "  const size = 3;\n" +
      "  return <Chip onSave={onSave} count={size} label={name} />;\n" +
      "}\n",
  });
  const { functionProps } = scanClientBoundary(root);
  assert.equal(functionProps.length, 1, formatFindings(functionProps));
  assert.match(functionProps[0].message, /onSave=\{onSave\}/);
});

test("the scan walked a real tree", () => {
  // Both rules above pass vacuously if the walk found nothing — a renamed
  // directory or a bad root would turn this file into a green no-op.
  //
  // The floors are a self-check on the walk, not an invariant about the app, so
  // they are set well below the real counts rather than at them. D9 deleted the
  // whole Hasura lane — 278 modules — which took `src/` from 520 files to 231
  // and the `"use client"` count from ~180 to 82; floors pinned just under the
  // old numbers turned that into a false failure.
  const { files, clientModules, serverModulesJudged } = scan.counts;
  assert.ok(files > 150, `only ${files} source files under src/`);
  assert.ok(
    clientModules > 50,
    `only ${clientModules} "use client" modules found — the directive check is broken`,
  );
  assert.ok(
    serverModulesJudged > 50,
    `only ${serverModulesJudged} server modules under src/app were judged`,
  );
});
