/**
 * WCAG contrast for the palette (design-direction.md §3.1, D21), measured on
 * the values the app actually ships: `lib/tokens.ts` (which `globals.css`
 * mirrors — `tokens-parity.test.ts`), the Joy theme built from it, and the
 * tint `TypeChip` puts behind a type's text.
 *
 * Text needs 4.5:1 (AA, normal size): every chip, footnote and tab label in
 * this app is small. The surfaces text sits on are bg, surface-1 (sections)
 * and surface-2 (tiles, sheets); surface-3 is the pressed state and inputs,
 * so only the ink tiers are held to it.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { itemTypeTokens } from "@/components/app/TypeChip";
import { theme } from "@/components/providers/ThemeRegistry";
import { color, daylight, ITEM_TYPE_ORDER, itemTypeColor } from "../tokens";

const AA = 4.5;

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

const TEXT_SURFACES = {
  bg: color.bg,
  surface1: color.surface1,
  surface2: color.surface2,
} as const;
const ALL_SURFACES = { ...TEXT_SURFACES, surface3: color.surface3 } as const;

function assertAA(
  fgName: string,
  fg: string,
  surfaces: Readonly<Record<string, string>>,
  min = AA,
) {
  for (const [name, bg] of Object.entries(surfaces)) {
    const ratio = contrast(fg, bg);
    assert.ok(
      ratio >= min,
      `${fgName} ${fg} on ${name} ${bg} is ${ratio.toFixed(2)}:1, under ${min}:1`,
    );
  }
}

describe("palette contrast: dark (the default)", () => {
  test("the three ink tiers read on every surface, surface-3 included", () => {
    assertAA("ink-1", color.ink1, ALL_SURFACES);
    assertAA("ink-2", color.ink2, ALL_SURFACES);
    assertAA("ink-3", color.ink3, ALL_SURFACES);
  });

  test("the design's quoted ratios still hold", () => {
    assert.ok(contrast(color.ink1, color.bg) >= 16.7);
    assert.ok(contrast(color.ink3, color.surface2) >= 5.5);
    assert.ok(contrast(color.accent, color.bg) >= 8.05);
  });

  test("brass is an action fill with dark ink, never white", () => {
    assert.ok(contrast(color.onAccent, color.accent) >= 7.6);
    assert.ok(
      contrast("#FFFFFF", color.accent) < AA,
      "white on brass fails — which is why the ink is --ca-on-accent",
    );
  });

  test("role colours used as text: brass, claret ink, teal, success, danger", () => {
    assertAA("accent", color.accent, TEXT_SURFACES);
    assertAA("brand-ink", color.brandInk, TEXT_SURFACES);
    assertAA("ai", color.ai, TEXT_SURFACES);
    assertAA("success", color.success, TEXT_SURFACES);
    assertAA("danger", color.danger, TEXT_SURFACES);
  });

  test("fills that carry text: parchment on claret, bg on solid danger (ConfirmSheet)", () => {
    assert.ok(contrast(color.ink1, color.brand) >= AA);
    assert.ok(contrast(color.bg, color.danger) >= AA);
    assert.ok(
      contrast(color.bg, color.ai) >= AA,
      "the solid 'From label' mark",
    );
  });

  test("each type's text-safe hue, plain and on its own TypeChip tint", () => {
    for (const type of ITEM_TYPE_ORDER) {
      const { text, deep } = itemTypeColor[type];
      assertAA(`${type} text`, text, TEXT_SURFACES);
      const alpha = /\/(\d+)$/.exec(itemTypeTokens[type].tintClass);
      assert.ok(alpha, `${type}: tintClass carries an alpha`);
      const a = Number(alpha[1]) / 100;
      for (const [name, bg] of Object.entries(TEXT_SURFACES)) {
        const chip = over(deep, a, bg);
        const ratio = contrast(text, chip);
        assert.ok(
          ratio >= AA,
          `${type} chip on ${name}: ${ratio.toFixed(2)}:1 (tint ${a})`,
        );
      }
    }
  });
});

describe("palette contrast: the Joy theme (until the removal step)", () => {
  const p = theme.colorSchemes.dark.palette;
  const joySurfaces = {
    body: String(p.background.body),
    surface: String(p.background.surface),
    popup: String(p.background.popup),
    level1: String(p.background.level1),
  };

  test("text.primary / secondary / tertiary on Joy's surfaces", () => {
    assertAA("text.primary", String(p.text.primary), joySurfaces);
    assertAA("text.secondary", String(p.text.secondary), joySurfaces);
    assertAA("text.tertiary", String(p.text.tertiary), joySurfaces);
  });

  test("neutral.500, which unconverted screens use as text", () => {
    assertAA("neutral.500", String(p.neutral[500]), TEXT_SURFACES);
  });

  test("solid fills and their ink, at rest, hover and press", () => {
    for (const key of ["primary", "danger", "success"] as const) {
      const v = p[key];
      for (const bg of [v.solidBg, v.solidHoverBg, v.solidActiveBg]) {
        assert.ok(
          contrast(String(v.solidColor), String(bg)) >= AA,
          `${key}: ${v.solidColor} on ${bg}`,
        );
      }
    }
    // Neutral's solid ink is Joy's default white.
    for (const bg of [
      p.neutral.solidBg,
      p.neutral.solidHoverBg,
      p.neutral.solidActiveBg,
    ]) {
      assert.ok(
        contrast("#FFFFFF", String(bg)) >= AA,
        `neutral: white on ${bg}`,
      );
    }
  });
});

describe("palette contrast: Daylight (defined, not built — D21)", () => {
  const surfaces = {
    bg: daylight.bg,
    surface1: daylight.surface1,
    surface2: daylight.surface2,
  };

  test("inks, accent text and the accent fill", () => {
    assertAA("ink-1", daylight.ink1, surfaces);
    assertAA("ink-2", daylight.ink2, surfaces);
    assertAA("ink-3", daylight.ink3, surfaces);
    assertAA("accent text", daylight.accentText, { bg: daylight.bg });
    assert.ok(contrast(daylight.onAccent, daylight.accent) >= AA);
    assertAA("ai", daylight.ai, { bg: daylight.bg });
    assertAA("brand", daylight.brand, { bg: daylight.bg });
  });
});
