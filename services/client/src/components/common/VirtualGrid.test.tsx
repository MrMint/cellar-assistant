/**
 * Render tests for the restored `VirtualGrid`, against the old markup: a
 * zero-height sentinel `div` (how it finds its scroll container), then either
 * the empty message or a relative box of absolutely-positioned rows, each row
 * a Joy `Grid container` of items at the caller's breakpoints, and a spinner
 * while more is loading.
 *
 * A server render has no scroll element, so the real virtualizer yields no
 * rows until hydration (that was true of the old grid too). To assert the row
 * markup without a DOM library, `@tanstack/react-virtual` is replaced by a
 * stand-in that "sees" every row and records the options it was given — which
 * also pins the virtualizer contract the old grid used (row count from
 * `totalCount`, 16px gap, overscan by column count). With no media-query
 * match, layout is at the `xs` column count.
 */

import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type VirtualizerOptions = {
  count: number;
  gap: number;
  overscan: number;
  estimateSize: (index: number) => number;
};
let lastOptions: VirtualizerOptions | null = null;

mock.module("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: VirtualizerOptions) => {
    lastOptions = options;
    const items = Array.from({ length: options.count }, (_, index) => ({
      index,
      key: index,
      start: index * (options.estimateSize(index) + options.gap),
      size: options.estimateSize(index),
    }));
    return {
      getVirtualItems: () => items,
      getTotalSize: () =>
        items.reduce((sum, item) => sum + item.size + options.gap, 0),
      measureElement: () => {},
      scrollToOffset: () => {},
    };
  },
}));

const { VirtualGrid } = await import("./VirtualGrid");

let lastRaw = "";
/** Markup with Emotion's `<style>` tags removed; the raw string is kept in `lastRaw`. */
const render = (node: ReactNode) => {
  lastRaw = renderToStaticMarkup(node);
  return lastRaw.replace(/<style[^>]*>[^<]*<\/style>/g, "");
};

type Row = { id: string; name: string };
const rows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: `Item ${i}` }));

type GridProps = Parameters<typeof VirtualGrid<Row>>[0];
const grid = (props: Partial<GridProps> = {}) =>
  render(
    <VirtualGrid<Row>
      items={rows(6)}
      cacheKey="test"
      getItemKey={(row) => row.id}
      renderItem={(row) => <span data-item={row.id}>{row.name}</span>}
      gridBreakpoints={{ xs: 6, sm: 6, md: 4, lg: 3, xl: 2 }}
      {...props}
    />,
  );

describe("VirtualGrid (restored)", () => {
  test("always renders the zero-height sentinel first", () => {
    assert.match(grid(), /^<div style="height:0;overflow:hidden"><\/div>/);
  });

  test("empty: the empty message, no row box", () => {
    const html = grid({ items: [], emptyMessage: "No wines yet" });
    assert.match(html, /MuiTypography-body-md[^>]*>No wines yet</);
    assert.doesNotMatch(html, /MuiGrid-container/);
  });

  test("default empty message is the old one", () => {
    assert.match(grid({ items: [] }), />No items found</);
  });

  test("items: absolutely-positioned rows of Grid containers at xs columns", () => {
    const html = grid();
    const rowsRendered = [...html.matchAll(/data-index="(\d+)"/g)].map(
      (m) => m[1],
    );
    // xs: 6 of 12 → two per row → six items make three rows.
    assert.deepEqual(rowsRendered, ["0", "1", "2"]);
    assert.equal(lastOptions?.count, 3);
    assert.equal(lastOptions?.gap, 16);
    assert.equal(lastOptions?.overscan, 8, "two columns or fewer overscan 8");
    assert.equal(
      lastOptions?.estimateSize(0),
      340,
      "the old default row estimate",
    );
    // Row 1 starts one estimated row plus one gap down (Emotion's CSS).
    assert.match(
      lastRaw,
      /position:absolute;top:0;left:0;width:100%;[^}]*transform:translateY\(356px\)/,
    );
    assert.match(lastRaw, /height:1068px;width:100%;position:relative;/);
    // xs: 6 of 12 → two items per row.
    const firstRow = html.slice(
      html.indexOf('data-index="0"'),
      html.indexOf('data-index="1"') === -1
        ? undefined
        : html.indexOf('data-index="1"'),
    );
    assert.equal([...firstRow.matchAll(/data-item=/g)].length, 2);
    assert.match(html, /MuiGrid-container/);
    assert.match(html, /MuiGrid-grid-xs-6/);
    assert.match(html, /MuiGrid-grid-md-4/);
  });

  test("unloaded rows (totalCount beyond items) render skeleton cards", () => {
    const html = grid({ items: rows(2), totalCount: 8 });
    assert.equal(lastOptions?.count, 4, "scrollbar sized for the total");
    // One loaded row of two items, three skeleton rows of two cards each.
    assert.equal([...html.matchAll(/data-item=/g)].length, 2);
    assert.equal([...html.matchAll(/MuiCard-root/g)].length, 6);
    assert.match(html, /MuiSkeleton-root/);
  });

  test("estimatedRowHeight overrides the default estimate", () => {
    grid({ estimatedRowHeight: 120 });
    assert.equal(lastOptions?.estimateSize(0), 120);
  });

  test("custom skeletons are used when given", () => {
    const html = grid({
      items: rows(2),
      totalCount: 8,
      renderSkeleton: () => <i data-skeleton="custom" />,
    });
    assert.match(html, /data-skeleton="custom"/);
  });

  test("isLoadingMore shows the spinner", () => {
    assert.match(grid({ isLoadingMore: true }), /MuiCircularProgress-root/);
    assert.doesNotMatch(grid(), /MuiCircularProgress-root/);
  });
});
