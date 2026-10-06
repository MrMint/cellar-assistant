/**
 * Render tests for the restored `CellarItemsFilter` against the old markup:
 * an outlined `Sheet` around a plain `ToggleButtonGroup` of six icon buttons,
 * in the old order (beer, wine, spirit, coffee, sake, tea), each labelled for
 * assistive tech and showing its count only when one is given.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CellarItemsFilter } from "./CellarItemsFilter";
import { filterCountsFromItemCounts } from "./cellarItemCounts";

const render = (node: ReactNode) =>
  renderToStaticMarkup(node).replace(/<style[^>]*>[^<]*<\/style>/g, "");

const buttons = (html: string) =>
  [
    ...html.matchAll(/<button[^>]*aria-label="([^"]+)"[^>]*>(.*?)<\/button>/g),
  ].map((m) => ({
    label: m[1],
    pressed: /aria-pressed="true"/.test(m[0]),
    count: /<p class="MuiTypography[^>]*>(\d+)<\/p>/.exec(m[2])?.[1],
  }));

describe("CellarItemsFilter (restored)", () => {
  test("six type buttons in the old order inside an outlined sheet", () => {
    const html = render(<CellarItemsFilter onTypesChange={() => {}} />);
    assert.match(html, /^<div class="MuiSheet-root MuiSheet-variantOutlined/);
    assert.match(html, /MuiToggleButtonGroup-root/);
    assert.deepEqual(
      buttons(html).map((b) => b.label),
      ["Beer", "Wine", "Spirit", "Coffee", "Sake", "Tea"],
    );
    assert.equal(
      buttons(html).every((b) => b.count === undefined),
      true,
    );
    assert.equal([...html.matchAll(/<svg/g)].length, 6, "one type icon each");
  });

  test("counts render beside their icons; selected types are pressed", () => {
    const html = render(
      <CellarItemsFilter
        types={["WINE", "TEA"]}
        counts={{ wines: 12, teas: 0, beers: 3 }}
        onTypesChange={() => {}}
      />,
    );
    assert.deepEqual(buttons(html), [
      { label: "Beer", pressed: false, count: "3" },
      { label: "Wine", pressed: true, count: "12" },
      { label: "Spirit", pressed: false, count: undefined },
      { label: "Coffee", pressed: false, count: undefined },
      { label: "Sake", pressed: false, count: undefined },
      { label: "Tea", pressed: true, count: "0" },
    ]);
  });
});

describe("filterCountsFromItemCounts", () => {
  test("maps Cellar.itemCounts to the old plural keys, dropping total", () => {
    assert.deepEqual(
      filterCountsFromItemCounts({
        total: 5,
        wine: 4,
        beer: 0,
        spirit: 0,
        coffee: 0,
        sake: 1,
        tea: 0,
      } as Parameters<typeof filterCountsFromItemCounts>[0]),
      { wines: 4, beers: 0, spirits: 0, coffees: 0, sakes: 1, teas: 0 },
    );
  });

  test("absent or null counts stay absent (no number), not zero", () => {
    assert.deepEqual(filterCountsFromItemCounts({ beer: 2, wine: null }), {
      beers: 2,
    });
  });

  test("no itemCounts selected yields no counts", () => {
    assert.deepEqual(filterCountsFromItemCounts(null), {});
    assert.deepEqual(filterCountsFromItemCounts(undefined), {});
  });
});
