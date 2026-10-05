/**
 * Render tests for the three one-screen restorations — `InteractiveCard`,
 * `ItemTypeIcon`, `PageLoading` — against their `82450ad1` markup.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ITEM_TYPES } from "@/components/cellar-api/itemTypes";
import { InteractiveCard } from "./InteractiveCard";
import { ItemTypeIcon } from "./ItemTypeIcon";
import { PageLoading } from "./PageLoading";

const raw = (node: ReactNode) => renderToStaticMarkup(node);

describe("InteractiveCard (restored)", () => {
  test("a Joy Card with the old hover affordance", () => {
    const html = raw(<InteractiveCard>body</InteractiveCard>);
    assert.match(html, /class="MuiCard-root[^"]*"/);
    // The styled() hover rule: pointer plus the theme's medium shadow. (The
    // border colour comes from the app theme's palette, absent here.)
    assert.match(
      html,
      /:hover\{cursor:pointer;box-shadow:[^}]*0px 6px 12px -2px/,
    );
    assert.match(html, />body</);
  });
});

describe("ItemTypeIcon (restored)", () => {
  test("one distinct react-icons glyph per type", () => {
    const glyphs = ITEM_TYPES.map((type) => raw(<ItemTypeIcon type={type} />));
    for (const html of glyphs) assert.match(html, /^<svg[^>]*>.*<\/svg>$/);
    assert.equal(new Set(glyphs).size, ITEM_TYPES.length);
  });

  test("each type renders the same glyph the old switch chose", async () => {
    const fa = await import("react-icons/fa");
    const expected = {
      BEER: fa.FaBeer,
      WINE: fa.FaWineGlass,
      SPIRIT: fa.FaCocktail,
      COFFEE: fa.FaCoffee,
      SAKE: fa.FaGlassWhiskey,
      TEA: fa.FaMugHot,
    } as const;
    for (const type of ITEM_TYPES) {
      const Glyph = expected[type];
      assert.equal(raw(<ItemTypeIcon type={type} />), raw(<Glyph />), type);
    }
  });
});

describe("PageLoading (restored)", () => {
  test("a full-size Box holding a CircularProgress", () => {
    const html = raw(<PageLoading />);
    assert.match(html, /height:100%;width:100%/);
    assert.match(
      html.replace(/<style[^>]*>[^<]*<\/style>/g, ""),
      /^<div class="MuiBox-root[^"]*"><span role="progressbar"[^>]*class="MuiCircularProgress-root/,
    );
  });
});
