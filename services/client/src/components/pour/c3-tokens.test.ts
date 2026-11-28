/**
 * C3's files draw with the kit's tokens (L23, H-1 / F-161): no retired
 * `brass` (a shim onto gold in `globals.css`, dropped once nothing uses it).
 * Reads the sources by path, so a moved file must be renamed here too.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const components = fileURLToPath(new URL("..", import.meta.url));
const sourcesIn = (dir: string) =>
  readdirSync(join(components, dir))
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .map((name) => join(dir, name));

const FILES = [
  ...sourcesIn("pour"),
  ...sourcesIn("drink-log"),
  "item/BottleFreshnessFields.tsx",
  "item/ItemRemainingSlider.tsx",
  "item/freshness.ts",
];

describe("C3 tokens", () => {
  test("no retired brass colour", () => {
    const users = FILES.filter((file) =>
      /\b(?:bg|text|border|ring|fill|stroke)-(?:on-)?brass\b/.test(
        readFileSync(join(components, file), "utf8"),
      ),
    );
    assert.deepEqual(users, []);
  });
});
