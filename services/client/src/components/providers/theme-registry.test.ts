/**
 * The brass flip (D21) on every page still on Joy: Joy's dark palette is
 * built from `lib/tokens.ts`, so unconverted and converted screens share one
 * palette mid-migration (D20). Deleted with Joy in the removal step.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { color, joyRamps } from "@/lib/tokens";
import { theme } from "./ThemeRegistry";

describe("Joy theme reads the tokens (brass flip)", () => {
  const dark = theme.colorSchemes.dark.palette;

  test("primary is the brass ramp with dark ink on solid fills", () => {
    assert.equal(dark.primary.solidBg, color.accent);
    assert.equal(dark.primary.solidColor, color.onAccent);
    assert.equal(dark.primary[500], color.accent);
    assert.ok(
      !Object.values(dark.primary).some(
        (v) => typeof v === "string" && /#70a3a9/i.test(v),
      ),
      "no teal left in primary",
    );
  });

  test("surfaces and inks are the tokens", () => {
    assert.equal(dark.background.body, color.bg);
    assert.equal(dark.background.surface, color.surface1);
    assert.equal(dark.text.primary, color.ink1);
    assert.equal(dark.text.secondary, color.ink2);
    assert.equal(dark.text.tertiary, color.ink3);
    assert.equal(dark.neutral[900], joyRamps.neutral[900]);
  });

  test("the font stacks are the next/font variables", () => {
    assert.match(String(theme.fontFamily.body), /var\(--font-inter\)/);
    assert.match(String(theme.fontFamily.display), /var\(--font-fraunces\)/);
  });
});
