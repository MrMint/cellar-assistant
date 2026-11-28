/**
 * W-8 / H-23: a bottle card and the bottle page derive the same morph name —
 * the card from its href, the page from its own pathname.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cellarItemHref } from "@/components/cellar-api/itemTypes";
import { morphName } from "./transition-kind";

const CELLAR = "35dd1611-62fb-43e6-9b47-f07d0cbd942c";
const BOTTLE = "2711c559-8a7d-4af1-8068-29e868b09420";

describe("morphName (W-8)", () => {
  test("a bottle card's href and the bottle page's pathname give one name", () => {
    const href = cellarItemHref(CELLAR, "WINE", BOTTLE);
    const pagePath = `/cellars/${CELLAR}/wines/${BOTTLE}`;
    assert.equal(morphName(href), morphName(pagePath));
    assert.equal(morphName(href), `title_cellars_${CELLAR}_wines_${BOTTLE}`);
  });

  test("a query, a hash or a trailing slash on the href does not change it", () => {
    const pagePath = `/cellars/${CELLAR}/wines/${BOTTLE}`;
    for (const href of [
      `${pagePath}?from=grid`,
      `${pagePath}#log`,
      `${pagePath}/`,
    ]) {
      assert.equal(morphName(href), morphName(pagePath), href);
    }
  });

  test("the catalog page and a bottle of it are different names", () => {
    assert.notEqual(
      morphName(`/wines/${BOTTLE}`),
      morphName(`/cellars/${CELLAR}/wines/${BOTTLE}`),
    );
  });

  test("the name is a CSS ident React keeps as is", () => {
    const name = morphName(`/cellars/${CELLAR}/wines/${BOTTLE}`);
    assert.match(name, /^[A-Za-z_][A-Za-z0-9_-]*$/);
  });
});
