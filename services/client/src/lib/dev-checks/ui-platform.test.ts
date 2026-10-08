/**
 * The UI-platform ratchet (D20, migration plan §2.8). `ui-platform.ts` has
 * the rules and why; this runs them against the tree.
 *
 * If this fails on a file you converted: the file is no longer in the
 * legacy list's shadow the moment it stops importing Joy — but it is still in
 * the list, so it is exempt. If it fails on a NEW file: that file used the old
 * platform (an `@mui/joy` import, an `sx` prop, a react-icon, a hex colour, a
 * literal spring). Use the app primitives (`src/components/app/README.md`),
 * a token from `globals.css`, or `@/lib/motion` instead. Do not add the file
 * to `ui-platform.legacy.json` — that list is frozen.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  formatFindings,
  scanSource,
  scanUiPlatform,
  violations,
} from "./ui-platform";

const legacyJson = JSON.parse(
  readFileSync(new URL("./ui-platform.legacy.json", import.meta.url), "utf8"),
) as { files: string[] };
const legacy = new Set(legacyJson.files);
const findings = scanUiPlatform();

describe("ui-platform guard (phase 1: ratchet)", () => {
  test("no file outside the frozen legacy list uses the old platform", () => {
    const bad = violations(findings, legacy);
    assert.deepEqual(
      bad,
      [],
      `New code on the legacy UI platform (see the header of this test):

${formatFindings(bad)}
`,
    );
  });

  test("the scan saw the tree (not an empty walk)", () => {
    assert.ok(
      findings.some((f) => f.rule === "joy-import"),
      "a tree mid-migration still has Joy imports; zero means the walk broke",
    );
  });

  test("the legacy list is frozen: sorted, unique, and holds no new code", () => {
    const files = legacyJson.files;
    assert.deepEqual(files, [...new Set(files)].sort());
    for (const file of files) {
      assert.doesNotMatch(
        file,
        /^src\/(components\/(app|ui)\/|lib\/(tokens|motion|utils)\.ts)/,
        `${file} is new-platform code and can never be legacy`,
      );
    }
  });

  test("the legacy list never grows past the 193 files frozen at F", () => {
    // Entries may go stale (a converted file deleted, renamed) — the safe
    // direction. They may never be added: that would pre-exempt new code.
    assert.ok(legacyJson.files.length <= 193, "the list only shrinks");
    for (const file of legacyJson.files) assert.match(file, /^src\//);
  });
});

describe("ui-platform rules (the scanner itself)", () => {
  const rules = (file: string, source: string) =>
    scanSource(file, source).map((f) => f.rule);

  test("imports: Joy, Emotion, react-icons, the star widget, framer-motion", () => {
    assert.deepEqual(
      rules(
        "src/x.tsx",
        `import { Box } from "@mui/joy";
         import { css } from "@emotion/react";
         import { MdAdd } from "react-icons/md";
         import { Rating } from "react-simple-star-rating";
         import { motion } from "framer-motion";
         import { motion as m } from "motion/react";`,
      ),
      ["joy-import", "joy-import", "legacy-dep", "legacy-dep", "framer-motion"],
    );
  });

  test("an sx prop, but not the letters sx in prose or a string", () => {
    assert.deepEqual(
      rules("src/x.tsx", `const a = <Box sx={{ p: 1 }}>sx= here</Box>;`),
      ["sx-prop"],
    );
  });

  test("raw colours in code, not in comments", () => {
    assert.deepEqual(
      rules(
        "src/x.ts",
        `// #C9A15B in a comment is fine
         const a = "#C9A15B";
         const b = "rgb(0 0 0 / .5)";
         const c = \`0 1px \${"x"} rgba(0,0,0,.2)\`;`,
      ),
      ["raw-colour", "raw-colour", "raw-colour"],
    );
  });

  test("not colours: issue refs, ranks, fragments with non-hex letters", () => {
    assert.deepEqual(
      rules(
        "src/x.ts",
        `const a = ["#1", "#12", "#top", "Rank #42", "a&#123;"];`,
      ),
      [],
    );
  });

  test("arbitrary Tailwind colours are banned outright", () => {
    assert.deepEqual(
      rules("src/x.tsx", `const a = <div className="bg-[#fff] text-ink-1" />;`),
      ["arbitrary-colour"],
    );
    assert.deepEqual(
      violations(
        scanSource("src/legacy.tsx", `const a = "text-[rgb(1,2,3)]";`),
        new Set(["src/legacy.tsx"]),
      ).map((f) => f.rule),
      ["arbitrary-colour"],
      "even in a legacy file",
    );
  });

  test("motion literals: springs, transition durations, arbitrary classes", () => {
    assert.deepEqual(
      rules(
        "src/x.tsx",
        `const s = { type: "spring", stiffness: 400, damping: 30 };
         const v = { show: { opacity: 1, transition: { duration: 0.2 } } };
         const e = <motion.div transition={{ duration: 0.3 }} />;
         const c = "duration-[250ms] ease-[cubic-bezier(0,0,0,1)]";
         const ok = { duration: 3 }; // not a transition: a toast's life, say
         const tok = "duration-(--ca-dur-short) ease-standard";`,
      ),
      [
        "motion-literal",
        "motion-literal",
        "motion-literal",
        "motion-literal",
        "motion-literal",
      ],
    );
  });

  test("motion literals: the other spring shapes and timing keys", () => {
    assert.deepEqual(
      rules(
        "src/x.tsx",
        `const a = <motion.div transition={{ type: "spring", bounce: 0.3, visualDuration: 0.4 }} />;
         const b = { transition: { mass: 2, delay: 0.1, ease: [0.4, 0, 0.2, 1] } };
         const ok1 = { delay: 2 }; // not a transition
         const ok2 = { transition: { ease: ease.standard, delay: dur.short } };`,
      ),
      [
        "motion-literal",
        "motion-literal",
        "motion-literal",
        "motion-literal",
        "motion-literal",
      ],
    );
  });

  test("Tailwind's default palette is banned outright; black/white scrims are not", () => {
    assert.deepEqual(
      rules(
        "src/x.tsx",
        `const a = <p className="text-red-500 hover:bg-zinc-900/50 border-t-gray-200" />;
         const ok = <div className="bg-black/50 text-ink-3 bg-type-wine/15 shadow-black/40" />;
         const joy = "var(--joy-palette-neutral-500)";`,
      ),
      ["palette-colour"],
    );
    assert.deepEqual(
      violations(
        scanSource("src/legacy.tsx", `const a = "text-emerald-400";`),
        new Set(["src/legacy.tsx"]),
      ).map((f) => f.rule),
      ["palette-colour"],
      "even in a legacy file",
    );
  });

  test("motion literals are allowed where the tokens live", () => {
    const f = scanSource(
      "src/lib/motion.ts",
      `export const spring = { snappy: { type: "spring", stiffness: 520, damping: 42 } };`,
    );
    assert.equal(f.length, 2);
    assert.deepEqual(violations(f, new Set()), []);
  });

  test("a hand-rolled reduced-motion query", () => {
    assert.deepEqual(
      rules(
        "src/x.ts",
        `const q = window.matchMedia("(prefers-reduced-motion: reduce)");`,
      ),
      ["reduced-motion-query"],
    );
  });

  test("tests may hold colours and literals (fixtures), not Joy imports", () => {
    assert.deepEqual(
      rules(
        "src/x.test.tsx",
        `import { Box } from "@mui/joy";
         const hex = "#C9A15B";
         mock.module("react-icons/md", () => ({}));`,
      ),
      ["joy-import", "legacy-dep"],
    );
  });

  test("colour allowlist: MapLibre paint and the tokens file", () => {
    for (const file of [
      "src/lib/tokens.ts",
      "src/components/map/maplibre/POISymbolLayer.tsx",
      "src/app/manifest.ts",
    ]) {
      assert.deepEqual(
        violations(scanSource(file, `const a = "#123456";`), new Set()),
        [],
        file,
      );
    }
  });
});
