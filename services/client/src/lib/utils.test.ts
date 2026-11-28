/**
 * `cn()` must know the app's tokens, or a caller's override silently loses
 * to the stylesheet's order (tailwind-merge drops neither class it does not
 * recognise as conflicting).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cn, T_RAMP, TYPE_RAMP } from "./utils";

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
    assert.equal(cn("bg-surface-2", "bg-brand"), "bg-brand");
    assert.equal(cn("text-ink-1", "text-ink-3"), "text-ink-3");
    assert.equal(cn("bg-type-wine/20", "bg-type-tea/20"), "bg-type-tea/20");
    assert.equal(cn("text-type-sake-text", "text-ai"), "text-ai");
  });

  test("a colour is not mistaken for a font size", () => {
    assert.equal(cn("text-sm", "text-ink-2"), "text-sm text-ink-2");
  });

  test("a later t-* replaces an earlier one (F1 hand-off)", () => {
    assert.equal(cn("t-body", "t-cap"), "t-cap");
    assert.equal(cn("t-head", "type-body"), "type-body");
    assert.equal(cn("text-sm font-bold", "t-head"), "t-head");
    assert.equal(cn("t-cap", "text-ink-2"), "t-cap text-ink-2");
  });

  test("kit colour and radius names merge", () => {
    assert.equal(cn("text-ink-2", "text-act-ink"), "text-act-ink");
    assert.equal(cn("border-edge", "border-edge-2"), "border-edge-2");
    assert.equal(cn("bg-raised", "bg-sel"), "bg-sel");
    assert.equal(cn("rounded-md", "rounded-segment"), "rounded-segment");
  });

  test("the kit ramp lists its eight styles", () => {
    assert.equal(T_RAMP.length, 8);
  });

  test("the ramp lists the nine design styles", () => {
    assert.equal(TYPE_RAMP.length, 9);
  });
});
