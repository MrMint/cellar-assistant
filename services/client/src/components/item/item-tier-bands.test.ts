/**
 * The "On Lists" band chips print the band word on the band's own fill: the
 * ink each fill carries must read at AA (4.5:1 — the chip is 12 px text).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { bandColor, color } from "@/lib/tokens";
import { BAND_CLASS, BAND_INK } from "./ItemTierLists";

function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = Number.parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
};

const INK_CLASS = { ink1: "text-ink-1", bg: "text-background" } as const;

describe("ItemTierLists band chips", () => {
  for (const band of [5, 4, 3, 2, 1] as const) {
    test(`band ${band}: its word reads on its fill`, () => {
      const ink = BAND_INK[band];
      const ratio = contrast(color[ink], bandColor[band]);
      assert.ok(
        ratio >= 4.5,
        `${ink} on band ${band} is ${ratio.toFixed(2)}:1`,
      );
      assert.match(BAND_CLASS[band] ?? "", new RegExp(INK_CLASS[ink]));
    });
  }
});
