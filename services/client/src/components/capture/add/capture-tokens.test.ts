/**
 * Every colour utility the capture surface uses names a token globals.css
 * defines. Tailwind drops an unknown one silently — `bg-bg` once left the
 * camera chrome unpainted, so the light page showed through (L23, L26).
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const here = join(import.meta.dir, "..");
const css = readFileSync(join(here, "../../app/globals.css"), "utf8");
const defined = new Set(
  Array.from(css.matchAll(/--color-([a-z0-9-]+)\s*:/g), (m) => m[1]),
);
// Tailwind's own colour keywords, which need no token.
const BUILT_IN = new Set([
  "transparent",
  "current",
  "inherit",
  "black",
  "white",
]);

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return name === "place" ? [] : sources(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });

test("the capture surface's bg-* colours are all defined tokens", () => {
  const files = [
    ...sources(here),
    ...sources(join(here, "../common/OnboardingWizard")),
  ];
  const unknown: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(
      /(?<![\w-])bg-([a-z][a-z0-9-]*?)(?:\/\d+)?(?=["'\s`])/g,
    )) {
      const name = m[1] ?? "";
      if (BUILT_IN.has(name) || defined.has(name)) continue;
      if (
        /^(gradient|linear|radial|clip|cover|contain|center|no-repeat|fixed|none)/.test(
          name,
        )
      )
        continue;
      unknown.push(`${file.slice(here.length - 7)}: bg-${name}`);
    }
  }
  assert.deepEqual(unknown, []);
});
