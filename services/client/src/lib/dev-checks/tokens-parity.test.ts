/**
 * One set of design tokens, two readers (the 2026-11 kit, L10):
 *
 * - `src/app/globals.css`: what Tailwind and every component use, dark on
 *   `:root` and light on `[data-theme="light"]`;
 * - `src/lib/tokens.ts`: the same values for code that cannot read a CSS
 *   variable (MapLibre, canvas, images that leave the app, the theme script).
 *
 * Any drift between them is a visible seam between themes, so it fails here.
 * The last block compiles the stylesheet with Tailwind and proves every
 * `type-*`, `font-display`, `*-brass` and `t-*` class the tree uses still
 * produces CSS (L26, L27): Tailwind drops an unknown class silently.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { compile } from "tailwindcss";
import { dur, ease } from "../motion";
import {
  bandColor,
  color,
  cssVars,
  cssVarsLight,
  darkValues,
  durationMs,
  easing,
  light,
} from "../tokens";

const CLIENT = fileURLToPath(new URL("../../../", import.meta.url));
const CSS_PATH = join(CLIENT, "src/app/globals.css");
const css = readFileSync(CSS_PATH, "utf8");

/** The custom properties declared in the block that `selector` opens. */
function blockVars(source: string, selector: RegExp): Map<string, string> {
  const start = source.search(selector);
  assert.ok(start >= 0, `globals.css declares ${selector}`);
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  const body = source.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, "");
  const vars = new Map<string, string>();
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    vars.set(m[1] ?? "", (m[2] ?? "").trim());
  }
  return vars;
}

/** Case, whitespace and a leading zero are formatting (Biome's), not value. */
const norm = (v: string) =>
  v
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/(^|[^\d])\.(\d)/g, "$10.$2");

const dark = blockVars(css, /:root\s*,?[^{]*\{/);
const lightBlock = blockVars(css, /\[data-theme="light"\]\s*\{/);

function assertParity(
  declared: Map<string, string>,
  expected: Readonly<Record<string, string>>,
  where: string,
) {
  for (const [name, value] of Object.entries(expected)) {
    const actual = declared.get(name);
    assert.ok(actual !== undefined, `${name} missing from ${where}`);
    assert.equal(norm(actual), norm(value), `${name} differs in ${where}`);
  }
  const extra = [...declared.keys()].filter(
    (k) => k.startsWith("--ca-") && !(k in expected),
  );
  assert.deepEqual(extra, [], `${where} declares tokens tokens.ts lacks`);
}

describe("tokens: globals.css ⇄ lib/tokens.ts", () => {
  test("dark :root block = cssVars, both ways", () => {
    assertParity(dark, cssVars, ":root");
  });

  test('light [data-theme="light"] block = cssVarsLight, both ways', () => {
    assertParity(lightBlock, cssVarsLight, '[data-theme="light"]');
  });

  test("the light block redeclares every themed dark token", () => {
    const themed = Object.keys(cssVarsLight);
    for (const name of themed) assert.ok(dark.has(name), name);
    // What light may leave out: bands, motion and sizes are theme-free.
    const untouched = [...dark.keys()].filter(
      (k) => k.startsWith("--ca-") && !lightBlock.has(k),
    );
    for (const name of untouched)
      assert.match(name, /^--ca-(band-\d|dur-|ease-|tabbar-h|skeleton-delay)/);
  });

  test("the kit's values (LIGHT § 1, rulings and additions)", () => {
    const kit: [keyof typeof color, string, string][] = [
      ["bg", "#111015", "#f5f4f8"],
      ["surface1", "#221f2a", "#ffffff"],
      ["surface2", "#332f3e", "#ebe9f0"],
      ["surface3", "#443f53", "#dedbe7"],
      ["line", "#433f4d", "#d6d3de"],
      ["edge2", "#71678a", "#867f99"],
      ["hair", "#2c2936", "#e4e2ea"],
      ["rule", "#3c3847", "#e1dee7"],
      ["dash", "#736d89", "#8f89a1"],
      ["ink1", "#ffffff", "#17151c"],
      ["ink2", "#b8b5c0", "#4a4656"],
      ["ink3", "#aea9bd", "#5c576b"],
      ["glyph", "#857e9f", "#7d7791"],
      ["accent", "#70a2a9", "#5f949b"],
      ["onAccent", "#111015", "#0e0d12"],
      ["actInk", "#8cc0c6", "#2d6a71"],
      ["actOnGlass", "#8cc0c6", "#8cc0c6"],
      ["gold", "#d59d24", "#a2700c"],
      ["heart", "#fe0000", "#e0001b"],
      ["danger", "#f0c5c8", "#b3261e"],
      ["onBand", "#111015", "#111015"],
      ["bandEdge", "transparent", "rgba(17,16,21,.4)"],
      ["here", "#3d7ef0", "#3d7ef0"],
      ["scrim", "rgba(8,7,12,.62)", "rgba(23,21,28,.42)"],
      ["scrimPk", "rgba(8,7,12,.78)", "rgba(23,21,28,.62)"],
      ["glass", "rgba(17,16,21,.86)", "rgba(17,16,21,.86)"],
      ["glassHover", "rgba(17,16,21,.96)", "rgba(17,16,21,.96)"],
      ["onGlass", "#ffffff", "#ffffff"],
      ["toast", "#332f3e", "#2a2733"],
      ["toastEdge", "#71678a", "#2a2733"],
      ["toastInk", "#ffffff", "#ffffff"],
      ["toastAct", "#8cc0c6", "#8cc0c6"],
      ["skel", "#3c3847", "#e2dfe8"],
      ["note", "rgba(17,16,21,.94)", "rgba(255,255,255,.96)"],
      ["ring", "#e6e3ee", "#17151c"],
      [
        "shBar",
        "0 10px 12px -10px rgba(4,3,8,.9)",
        "0 10px 12px -10px rgba(40,36,52,.22)",
      ],
      ["shPop", "0 12px 32px rgba(4,3,8,.6)", "0 12px 32px rgba(40,36,52,.18)"],
      ["shDlg", "0 20px 48px rgba(4,3,8,.7)", "0 20px 48px rgba(40,36,52,.24)"],
    ];
    for (const [key, d, l] of kit) {
      assert.equal(norm(color[key]), norm(d), `dark ${key}`);
      assert.equal(norm(light[key]), norm(l), `light ${key}`);
    }
    assert.deepEqual(
      [bandColor[5], bandColor[4], bandColor[3], bandColor[2], bandColor[1]],
      ["#4fb469", "#9cc25a", "#e5c84a", "#ec8f3e", "#e8615a"],
    );
    assert.equal(darkValues, color, "images that leave the app are dark");
  });

  test("action is teal through --ca-accent", () => {
    assert.match(css, /--color-primary:\s*var\(--ca-accent\)/);
    assert.match(css, /--color-primary-foreground:\s*var\(--ca-on-accent\)/);
    assert.doesNotMatch(css, /--color-(on-)?brass/);
    assert.match(css, /--color-ring:\s*var\(--ca-act-ink\)/);
    // shadcn's `accent` is a surface, not the action colour.
    assert.match(css, /--color-accent:\s*var\(--ca-surface-3\)/);
  });

  test("Inter only: no second family in the stylesheet", () => {
    assert.doesNotMatch(css, /fraunces|ui-serif|Georgia/i);
    assert.match(css, /--font-display:\s*var\(--font-inter\)/);
  });

  test(".keep-dark subtrees carry the dark tokens and the dark: variant", () => {
    assert.match(css, /:root,\s*\[data-theme="dark"\],\s*\.keep-dark\s*\{/);
    assert.match(css, /@custom-variant dark[^;]*\.keep-dark \*/);
  });

  test("motion.ts mirrors the --ca-dur-* / --ca-ease-* values", () => {
    for (const key of ["micro", "short", "medium", "long"] as const) {
      assert.equal(dur[key] * 1000, durationMs[key]);
      assert.equal(dark.get(`--ca-dur-${key}`), `${durationMs[key]}ms`);
    }
    for (const key of ["standard", "enter", "exit"] as const) {
      assert.deepEqual(ease[key], [...easing[key]]);
    }
  });

  test("Tailwind's breakpoints (600 / 900 / 1200 / 1536)", () => {
    for (const [bp, px] of [
      ["sm", 600],
      ["md", 900],
      ["lg", 1200],
      ["xl", 1536],
    ] as const) {
      assert.match(css, new RegExp(`--breakpoint-${bp}:\\s*${px}px;`));
    }
  });

  test("every border defaults to the hairline, not currentColor", () => {
    assert.match(
      css,
      /@layer base\s*\{[\s\S]*?\*,[\s\S]*?\{\s*@apply border-border outline-ring\/50;/,
    );
  });

  test("reduced motion reaches what MotionConfig cannot (vaul, tw-animate)", () => {
    const block = css.slice(css.search(/@media \(prefers-reduced-motion/));
    assert.match(block, /--tw-enter-scale:\s*1 !important/);
    assert.match(block, /--tw-enter-translate-y:\s*0 !important/);
    assert.match(
      block,
      /\[data-vaul-drawer\][\s\S]*?transition-duration:\s*0s !important/,
    );
    assert.match(block, /animation-name:\s*ca-fade-in !important/);
  });
});

/** The declarations of `@utility <name> { … }`, normalised. */
function utilityBody(name: string): string {
  const m = new RegExp(`@utility ${name} \\{([^}]*)\\}`).exec(css);
  assert.ok(m, `@utility ${name} is defined`);
  return (m[1] ?? "")
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .sort()
    .join("; ");
}

describe("type: the t-* scale and its type-* aliases (KIT § 1, L26)", () => {
  const scale: Record<string, [string, string, string, string?]> = {
    "t-score": ["40px", "44px", "700", "-0.02em"],
    "t-title": ["24px", "28px", "700", "-0.01em"],
    "t-quote": ["20px", "28px", "400"],
    "t-head": ["16px", "20px", "600"],
    "t-body": ["16px", "22px", "400"],
    "t-cap": ["13px", "17px", "400"],
    "t-micro": ["11px", "14px", "600", "0.01em"],
    "t-pin": ["12px", "15px", "600"],
  };

  test("each t-* style is the kit's size / line / weight / tracking, in Inter", () => {
    for (const [name, [size, line, weight, tracking]] of Object.entries(
      scale,
    )) {
      const body = utilityBody(name);
      assert.match(body, /font-family: var\(--font-sans\)/, name);
      assert.match(body, new RegExp(`font-size: ${size}`), name);
      assert.match(body, new RegExp(`line-height: ${line}`), name);
      assert.match(body, new RegExp(`font-weight: ${weight}`), name);
      if (tracking)
        assert.match(body, new RegExp(`letter-spacing: ${tracking}`), name);
      assert.doesNotMatch(body, /text-transform/, `${name}: sentence case`);
    }
    for (const name of ["t-score", "t-pin"])
      assert.match(utilityBody(name), /tabular-nums/, name);
  });

  test("each type-* alias is its t-* value (KIT 'Today' column)", () => {
    const aliases: [string, string][] = [
      ["type-large-title", "t-title"],
      ["type-title-1", "t-title"],
      ["type-title-2", "t-title"],
      ["type-headline", "t-head"],
      ["type-body", "t-body"],
      ["type-callout", "t-cap"],
      ["type-footnote", "t-cap"],
      ["type-overline", "t-micro"],
      ["type-numeral-xl", "t-score"],
    ];
    for (const [alias, target] of aliases) {
      // footnote keeps the ink-3 colour it always carried.
      const body = utilityBody(alias)
        .split("; ")
        .filter((d) => d !== "color: var(--ca-ink-3)")
        .join("; ");
      assert.equal(body, utilityBody(target), `${alias} → ${target}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Every class the tree uses from the retiring names still resolves.

const require = createRequire(import.meta.url);

async function compileGlobals() {
  return compile(css, {
    base: dirname(CSS_PATH),
    loadStylesheet: async (id: string, base: string) => {
      const path = id.startsWith(".")
        ? resolve(base, id)
        : id === "tailwindcss"
          ? require.resolve("tailwindcss/index.css")
          : id === "tw-animate-css"
            ? join(CLIENT, "node_modules/tw-animate-css/dist/tw-animate.css")
            : require.resolve(id);
      return {
        path,
        base: dirname(path),
        content: readFileSync(path, "utf8"),
      };
    },
    loadModule: async (id: string) => {
      throw new Error(`globals.css loads no JS module (${id})`);
    },
  });
}

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.(tsx?|mts)$/.test(name) && !/\.(test|d)\.tsx?$/.test(name))
      out.push(path);
  }
  return out;
}

/** Class candidates on the retiring names, variants and modifiers included. */
const RETIRING =
  /(?<![\w-])(?:[\w-]+:)*(?:!)?(?:type-[a-z0-9-]+|font-display|t-(?:score|title|quote|head|body|cap|micro|pin)|(?:bg|text|border|ring|fill|stroke|outline|from|via|to|decoration|shadow|caret|accent|divide|placeholder)(?:-[a-z]+)?-(?:on-)?brass(?:\/\d+)?)(?![\w-])/g;

/** A string literal's text (template parts split at `${`). */
const STRING = /"([^"\\\n]*)"|'([^'\\\n]*)'|`([^`]*)`/g;
/** It reads as a class list: tokens only, one of them a common utility. */
const CLASS_LIST = /^[\w:/.![\]#%()&,-]+(?:\s+[\w:/.![\]#%()&,-]+)*$/;
const COMMON_UTILITY =
  /(?:^|[\s:])(?:flex|grid|block|hidden|truncate|relative|absolute|rounded(?:-\w+)?|(?:text|bg|border|font|p[xytrbl]?|m[xytrbl]?|gap|w|h|min-w|max-w|items|justify|shrink|tabular|type|t)-[\w./-]+)(?=\s|$)/;

function* classLists(source: string): Generator<string> {
  for (const m of source.matchAll(STRING)) {
    // Attribute values, import paths and theme keys are not class lists.
    const before = source.slice(Math.max(0, (m.index ?? 0) - 24), m.index);
    const after = source.slice((m.index ?? 0) + m[0].length).trimStart();
    if (
      /(?:data-[\w-]+=|id=|from\s*|import\(\s*|<\s*)$/.test(before) ||
      after.startsWith(":")
    )
      continue;
    for (const part of (m[1] ?? m[2] ?? m[3] ?? "").split(/\$\{[^}]*\}/)) {
      const text = part.trim();
      if (!text || !CLASS_LIST.test(text)) continue;
      const tokens = text.split(/\s+/);
      // A lone token must be a retiring class itself (a `cn()` argument);
      // a list needs one ordinary utility beside it, or it is an id or a word.
      if (tokens.length === 1 || COMMON_UTILITY.test(text)) yield text;
    }
  }
}

/** A class's selector as Tailwind prints it. */
const selector = (candidate: string) =>
  `.${candidate.replace(/[:/!.[\]#%(),]/g, (c) => `\\${c}`)}`;

describe("every type-*, font-display, *-brass and t-* class in use resolves", () => {
  test("the compiled stylesheet has a rule for each one", async () => {
    const used = new Set<string>();
    for (const file of sources(join(CLIENT, "src"))) {
      for (const literal of classLists(readFileSync(file, "utf8")))
        for (const m of literal.matchAll(RETIRING)) used.add(m[0]);
    }
    assert.ok(used.size > 15, `the scan found the classes (${used.size})`);
    const compiler = await compileGlobals();
    const out = compiler.build([...used]);
    const missing = [...used].filter((c) => !out.includes(selector(c)));
    assert.deepEqual(missing, [], "classes Tailwind would drop silently");
  });

  test("an unknown class is reported, so the check can fail", async () => {
    const compiler = await compileGlobals();
    const out = compiler.build(["type-nonexistent", "bg-brand"]);
    assert.ok(!out.includes(selector("type-nonexistent")));
    assert.ok(out.includes(selector("bg-brand")));
  });
});
