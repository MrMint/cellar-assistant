/**
 * One set of design tokens, three readers (D20 foundation):
 *
 * - `src/app/globals.css` — what Tailwind and every converted component use;
 * - `src/lib/tokens.ts` — the same values for code that cannot read a CSS
 *   variable (the Joy theme, MapLibre, canvas);
 * - the Joy theme (`providers/theme-registry.test.ts` checks that one).
 *
 * Any drift between them is a visible seam mid-migration, so it fails here.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { dur, ease } from "../motion";
import { color, cssVars, durationMs, easing } from "../tokens";

const css = readFileSync(
  fileURLToPath(new URL("../../app/globals.css", import.meta.url)),
  "utf8",
);

/** The custom properties declared in the first `:root…{}` block. */
function rootVars(source: string): Map<string, string> {
  const start = source.search(/:root\s*,?[^{]*\{/);
  assert.ok(start >= 0, "globals.css declares a :root block");
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  const body = source.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, "");
  const vars = new Map<string, string>();
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    vars.set(m[1] ?? "", (m[2] ?? "").trim());
  }
  return vars;
}

/** Case and whitespace are formatting, not value. */
const norm = (v: string) => v.toLowerCase().replace(/\s+/g, " ").trim();

describe("tokens: globals.css ⇄ lib/tokens.ts", () => {
  const declared = rootVars(css);
  const caDeclared = [...declared.keys()].filter((k) => k.startsWith("--ca-"));

  test("every token in tokens.ts is declared in :root with the same value", () => {
    for (const [name, value] of Object.entries(cssVars)) {
      const actual = declared.get(name);
      assert.ok(actual !== undefined, `${name} missing from globals.css`);
      assert.equal(norm(actual), norm(value), `${name} differs`);
    }
  });

  test("globals.css declares no --ca-* token that tokens.ts lacks", () => {
    const extra = caDeclared.filter((k) => !(k in cssVars));
    assert.deepEqual(extra, []);
  });

  test("the canonical palette (design §3.1) is what the tokens hold", () => {
    assert.equal(color.bg, "#0E0C0F");
    assert.equal(color.accent, "#C9A15B");
    assert.equal(color.onAccent, "#1A1408");
    assert.equal(color.ai, "#7FB3B9");
    assert.equal(color.ink3, "#9C9287");
  });

  test("motion.ts mirrors the --ca-dur-* / --ca-ease-* values", () => {
    for (const key of ["micro", "short", "medium", "long"] as const) {
      assert.equal(dur[key] * 1000, durationMs[key]);
      assert.equal(declared.get(`--ca-dur-${key}`), `${durationMs[key]}ms`);
    }
    for (const key of ["standard", "enter", "exit"] as const) {
      assert.deepEqual(ease[key], [...easing[key]]);
    }
  });

  test("Tailwind's breakpoints are Joy's (600 / 900 / 1200 / 1536)", () => {
    for (const [bp, px] of [
      ["sm", 600],
      ["md", 900],
      ["lg", 1200],
      ["xl", 1536],
    ] as const) {
      assert.match(css, new RegExp(`--breakpoint-${bp}:\\s*${px}px;`));
    }
  });

  test("shadcn's `accent` is a surface, and `primary` is brass", () => {
    assert.match(css, /--color-accent:\s*var\(--ca-surface-3\)/);
    assert.match(css, /--color-primary:\s*var\(--ca-accent\)/);
    assert.match(css, /--color-primary-foreground:\s*var\(--ca-on-accent\)/);
  });
});
