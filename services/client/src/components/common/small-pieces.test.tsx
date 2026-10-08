/**
 * Render tests for two small shared pieces: `ItemTypeIcon` (now `TypeGlyph`)
 * and `PageLoading`.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ITEM_TYPES } from "@/components/cellar-api/itemTypes";
import { ItemTypeIcon } from "./ItemTypeIcon";
import { PageLoading } from "./PageLoading";

const raw = (node: ReactNode) => renderToStaticMarkup(node);

describe("ItemTypeIcon", () => {
  test("one distinct, decorative glyph per type", () => {
    const glyphs = ITEM_TYPES.map((type) => raw(<ItemTypeIcon type={type} />));
    for (const html of glyphs) {
      assert.match(html, /^<svg[^>]*>.*<\/svg>$/);
      assert.match(html, /\saria-hidden="true"/);
    }
    assert.equal(new Set(glyphs).size, ITEM_TYPES.length);
  });

  test("each type renders its TypeGlyph (one glyph set app-wide)", async () => {
    const { TypeGlyph } = await import("@/components/app/TypeChip");
    for (const type of ITEM_TYPES) {
      const html = raw(<ItemTypeIcon type={type} />);
      assert.equal(html, raw(<TypeGlyph type={type} />), type);
      assert.match(html, new RegExp(`data-type="${type}"`));
    }
  });
});

describe("PageLoading", () => {
  test("a full-size box holding a loading indicator", () => {
    const html = raw(<PageLoading />);
    // Emotion's rule while it is Joy, Tailwind's classes once it is not.
    assert.match(
      html,
      /height:100%;width:100%|\b(?:size-full|h-full w-full)\b/,
    );
    const markup = html.replace(/<style[^>]*>[^<]*<\/style>/g, "");
    assert.match(
      markup,
      /^<div\b[^>]*><[a-z]+\b[^>]*role="(?:progressbar|status)"/,
    );
  });
});
