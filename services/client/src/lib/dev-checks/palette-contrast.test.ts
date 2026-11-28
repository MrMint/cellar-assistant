/**
 * WCAG contrast for the kit's palette (LIGHT § 1, its rulings and additions),
 * measured on the values the app ships: `lib/tokens.ts` (which `globals.css`
 * mirrors: `tokens-parity.test.ts`) and the tint `TypeChip` puts behind a
 * type's text.
 *
 * Text needs 4.5:1 (AA, normal size). The surfaces text sits on are bg, card
 * (surface-1) and raised (surface-2); sel (surface-3) is the pressed and
 * selected state. Non-text marks (glyphs, act fills, input boundaries, gold
 * stars, hearts) need 3:1. The light figures LIGHT § 1 quotes are asserted to
 * the hundredth, so a value change that moves one shows up here.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { itemTypeTokens } from "@/components/app/TypeChip";
import {
  bandColor,
  color,
  ITEM_TYPE_ORDER,
  itemTypeColor,
  itemTypeColorLight,
  light,
  type Palette,
} from "../tokens";

const AA = 4.5;
const NON_TEXT = 3;

function channels(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  assert.ok(m, `${hex} is not a #rrggbb colour`);
  const n = m[1] ?? "";
  return [0, 2, 4].map((i) => Number.parseInt(n.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG 2 contrast ratio of two opaque colours. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/** `fg` at `alpha` composited over the opaque `bg` (sRGB, as browsers do). */
function over(fg: string, alpha: number, bg: string): string {
  const f = channels(fg);
  const b = channels(bg);
  return `#${f
    .map((v, i) =>
      Math.round(v * alpha + (b[i] ?? 0) * (1 - alpha))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function surfaces(p: Palette) {
  return { bg: p.bg, card: p.surface1, raised: p.surface2 } as const;
}

function assertMin(
  fgName: string,
  fg: string,
  on: Readonly<Record<string, string>>,
  min = AA,
) {
  for (const [name, bg] of Object.entries(on)) {
    const ratio = contrast(fg, bg);
    assert.ok(
      ratio >= min,
      `${fgName} ${fg} on ${name} ${bg} is ${ratio.toFixed(2)}:1, under ${min}:1`,
    );
  }
}

function typeChips(
  p: Palette,
  hues: typeof itemTypeColor,
  theme: string,
): void {
  for (const type of ITEM_TYPE_ORDER) {
    const { text, deep } = hues[type];
    assertMin(`${theme} ${type} text`, text, surfaces(p));
    const alpha = /\/(\d+)$/.exec(itemTypeTokens[type].tintClass);
    assert.ok(alpha, `${type}: tintClass carries an alpha`);
    const a = Number(alpha[1]) / 100;
    for (const [name, bg] of Object.entries(surfaces(p))) {
      const ratio = contrast(text, over(deep, a, bg));
      assert.ok(
        ratio >= AA,
        `${theme} ${type} chip on ${name}: ${ratio.toFixed(2)}:1 (tint ${a})`,
      );
    }
  }
}

describe("palette contrast: light (LIGHT § 1)", () => {
  const on = [light.bg, light.surface1, light.surface2, light.surface3];
  // [token, value, ratio on bg, card, raised, sel] — LIGHT § 1's column.
  const quoted: [keyof Palette, number[]][] = [
    ["ink1", [16.5, 18.1, 15.0, 13.3]],
    ["ink2", [8.3, 9.1, 7.6, 6.7]],
    ["ink3", [6.3, 6.9, 5.8, 5.1]],
    ["glyph", [3.9, 4.3, 3.6, 3.1]],
    ["actInk", [5.6, 6.2, 5.1, 4.5]],
    ["gold", [4.0, 4.3, 3.6, 3.2]],
    ["heart", [4.6, 5.0, 4.2, 3.7]],
    ["danger", [6.0, 6.5, 5.4, 4.8]],
    ["edge2", [3.48, 3.81, 3.17]],
    ["dash", [3.06, 3.35]],
    ["accent", [3.1, 3.39]],
  ];

  test("every figure LIGHT § 1 quotes, on bg / card / raised / sel", () => {
    for (const [key, figures] of quoted) {
      figures.forEach((figure, i) => {
        const ratio = contrast(light[key], on[i] ?? "");
        // Quoted to one or two decimals (the kit rounds loosely: glyph on raised is 3.546, quoted 3.6).
        const places = String(figure).split(".")[1]?.length ?? 0;
        const tolerance = places >= 2 ? 0.006 : 0.06;
        assert.ok(
          Math.abs(ratio - figure) <= tolerance,
          `light ${key} on surface ${i}: ${ratio.toFixed(3)}, LIGHT says ${figure}`,
        );
      });
    }
  });

  test("text tiers read at AA on bg, card and raised; ink-3 and act-ink on sel too", () => {
    for (const key of ["ink1", "ink2", "ink3", "actInk", "danger"] as const)
      assertMin(`light ${key}`, light[key], surfaces(light));
    assertMin("light ink3", light.ink3, { sel: light.surface3 });
    assertMin("light actInk", light.actInk, { sel: light.surface3 });
  });

  test("non-text marks reach 3:1 where they are used", () => {
    assertMin(
      "light glyph",
      light.glyph,
      { bg: light.bg, card: light.surface1, raised: light.surface2 },
      NON_TEXT,
    );
    // Input boundaries (ruling 1) on the three surfaces fields sit on.
    assertMin("light edge-2", light.edge2, surfaces(light), NON_TEXT);
    // Gold is accepted at 3:1 on raised and below on sel (ruling 2).
    assertMin("light gold", light.gold, surfaces(light), NON_TEXT);
    assertMin(
      "light act fill",
      light.accent,
      { bg: light.bg, card: light.surface1 },
      NON_TEXT,
    );
    assertMin(
      "light dash",
      light.dash,
      { bg: light.bg, card: light.surface1 },
      NON_TEXT,
    );
  });

  test("on-act on act, and the action ink on its fill", () => {
    const ratio = contrast(light.onAccent, light.accent);
    assert.ok(Math.abs(ratio - 5.71) <= 0.006, `on-act on act ${ratio}`);
  });

  test("the toast stays dark: its ink and action read on its fill", () => {
    assertMin("toast ink", light.toastInk, { toast: light.toast });
    assertMin("toast act", light.toastAct, { toast: light.toast });
  });

  test("ink on every band reads (5.7 to 11.5:1), both themes", () => {
    for (const band of [5, 4, 3, 2, 1] as const) {
      assertMin(`on-band on k${band}`, light.onBand, { band: bandColor[band] });
      assertMin(`on-band on k${band}`, color.onBand, { band: bandColor[band] });
    }
  });

  test("legacy roles kept for existing screens: brand ink, success, types", () => {
    assertMin("light brand-ink", light.brandInk, surfaces(light));
    assertMin("light success", light.success, surfaces(light));
    assertMin("light ink on brand", light.onGlass, { brand: light.brand });
    typeChips(light, itemTypeColorLight, "light");
  });
});

describe("palette contrast: dark", () => {
  test("the text tiers read on bg, card and raised; ink-1 and ink-2 on sel", () => {
    for (const key of [
      "ink1",
      "ink2",
      "ink3",
      "actInk",
      "danger",
      "gold",
    ] as const)
      assertMin(`dark ${key}`, color[key], surfaces(color));
    assertMin("dark ink1", color.ink1, { sel: color.surface3 });
    assertMin("dark ink2", color.ink2, { sel: color.surface3 });
  });

  test("the ruling-3 fixes: dash lightened, glyph at 3:1 off sel", () => {
    assert.ok(Math.abs(contrast(color.dash, color.bg) - 3.86) <= 0.006);
    assert.ok(Math.abs(contrast(color.dash, color.surface1) - 3.3) <= 0.006);
    assertMin("dark glyph", color.glyph, surfaces(color), NON_TEXT);
    assertMin(
      "dark edge-2",
      color.edge2,
      { bg: color.bg, card: color.surface1 },
      NON_TEXT,
    );
  });

  test("act is a fill with dark ink, never white", () => {
    assertMin("on-act on act", color.onAccent, { act: color.accent });
    assert.ok(
      contrast("#ffffff", color.accent) < AA,
      "white on act fails, which is why the ink is --ca-on-accent",
    );
    assertMin("dark act fill", color.accent, surfaces(color), NON_TEXT);
  });

  test("teal on glass reads", () => {
    // Glass is 86 % of #111015 over a photo; on its own colour it is the floor.
    assertMin("act-on-glass", color.actOnGlass, { glass: color.bg });
    assertMin("on-glass", color.onGlass, { glass: color.bg });
  });

  test("legacy roles kept for existing screens: brand ink, success, types", () => {
    assertMin("dark brand-ink", color.brandInk, surfaces(color));
    assertMin("dark success", color.success, surfaces(color));
    assertMin("dark ink on brand", color.ink1, { brand: color.brand });
    assertMin("bg on solid danger", color.bg, { danger: color.danger });
    typeChips(color, itemTypeColor, "dark");
  });
});
