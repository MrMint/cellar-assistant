/**
 * F-42: the desktop results' order for J/K (and ↑/↓), and which rows open
 * in the quick-look pane (Recipes-Search desktop: Move, Enter Quick look,
 * Esc Close, O Open the page).
 */
import { describe, expect, test } from "vitest";
import { lookOrder, stepKey } from "./search-quick-look";
import type { SearchRow, SectionModel } from "./universal-search";

const row = (key: string, extra: Partial<SearchRow> = {}): SearchRow => ({
  key,
  title: key,
  href: `/x/${key}`,
  thumb: { kind: "icon", icon: "brand" },
  ...extra,
});

const section = (
  name: SectionModel["section"],
  rows: SearchRow[],
): SectionModel =>
  ({
    section: name,
    label: name,
    rows,
    total: rows.length,
    totalIsLowerBound: false,
  }) as SectionModel;

describe("lookOrder: the rows J and K move through", () => {
  const item = row("i1", {
    look: { kind: "item", itemId: "i1", itemType: "WINE" },
  });
  const sections = [
    section("items", [
      item,
      ...Array.from({ length: 7 }, (_, n) => row(`i${n + 2}`)),
    ]),
    section("people", [row("u1", { href: undefined }), row("u2")]),
  ];

  test("every section's desktop preview (six), in order, linked rows only", () => {
    expect(lookOrder(sections, null).map((r) => r.key)).toEqual([
      "i1",
      "i2",
      "i3",
      "i4",
      "i5",
      "i6",
      "u2",
    ]);
  });

  test("an opened section: every row it holds", () => {
    expect(lookOrder(sections, "items")).toHaveLength(8);
  });

  test("a row keeps what the pane needs", () => {
    expect(lookOrder(sections, null)[0]).toEqual({
      key: "i1",
      title: "i1",
      href: "/x/i1",
      thumb: { kind: "icon", icon: "brand" },
      look: { kind: "item", itemId: "i1", itemType: "WINE" },
    });
  });
});

describe("stepKey: next and previous, stopping at the ends", () => {
  const keys = ["a", "b", "c"];
  test("nothing selected: J takes the first, K the last", () => {
    expect(stepKey(keys, null, 1)).toBe("a");
    expect(stepKey(keys, null, -1)).toBe("c");
  });
  test("moves one, and holds at either end", () => {
    expect(stepKey(keys, "a", 1)).toBe("b");
    expect(stepKey(keys, "b", -1)).toBe("a");
    expect(stepKey(keys, "c", 1)).toBe("c");
    expect(stepKey(keys, "a", -1)).toBe("a");
  });
  test("a key no longer listed starts again; no rows, nothing", () => {
    expect(stepKey(keys, "gone", 1)).toBe("a");
    expect(stepKey([], null, 1)).toBeNull();
  });
});
