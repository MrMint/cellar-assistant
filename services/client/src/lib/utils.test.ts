/**
 * `cn()` must know the app's tokens, or a caller's override silently loses
 * to the stylesheet's order (tailwind-merge drops neither class it does not
 * recognise as conflicting).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cn, TYPE_RAMP } from "./utils";

describe("cn", () => {
  test("joins and drops falsy values", () => {
    assert.equal(cn("a", false, undefined, null, "b"), "a b");
  });

  test("a later type-* replaces an earlier one", () => {
    assert.equal(cn("type-callout", "type-body"), "type-body");
    assert.equal(cn("type-footnote", "type-title-1"), "type-title-1");
  });

  test("a type-* replaces earlier size, leading, weight and family", () => {
    assert.equal(
      cn("text-sm leading-5 font-bold font-sans", "type-headline"),
      "type-headline",
    );
  });

  test("a type-* does not swallow a colour", () => {
    assert.equal(cn("type-callout", "text-ink-3"), "type-callout text-ink-3");
    assert.equal(cn("text-ink-3", "type-callout"), "text-ink-3 type-callout");
  });

  test("app colour roles merge like built-in colours", () => {
    assert.equal(cn("bg-surface-2", "bg-brass"), "bg-brass");
    assert.equal(cn("text-ink-1", "text-ink-3"), "text-ink-3");
    assert.equal(cn("bg-type-wine/20", "bg-type-tea/20"), "bg-type-tea/20");
    assert.equal(cn("text-type-sake-text", "text-ai"), "text-ai");
  });

  test("a colour is not mistaken for a font size", () => {
    assert.equal(cn("text-sm", "text-ink-2"), "text-sm text-ink-2");
  });

  test("the ramp lists the nine design styles", () => {
    assert.equal(TYPE_RAMP.length, 9);
  });
});
