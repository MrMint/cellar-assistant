/**
 * F-156: the desktop pane reads the item through urql, not the server page,
 * so `router.refresh()` alone never re-reads it. A write in the item's
 * sections refreshes through `useRefreshAfterWrite`, which re-runs the pane's
 * query when there is one.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

let refreshes = 0;
mock.module("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => {
      refreshes += 1;
    },
  }),
}));

const { PaneRefreshProvider, useRefreshAfterWrite } = await import(
  "./pane-refresh"
);

const callWith = (node: (refresh: () => void) => void, pane?: () => void) => {
  function Probe() {
    node(useRefreshAfterWrite());
    return null;
  }
  renderToStaticMarkup(
    pane === undefined ? (
      <Probe />
    ) : (
      <PaneRefreshProvider value={pane}>
        <Probe />
      </PaneRefreshProvider>
    ),
  );
};

describe("useRefreshAfterWrite (F-156)", () => {
  test("on the page: the router's refresh", () => {
    refreshes = 0;
    callWith((refresh) => refresh());
    assert.equal(refreshes, 1);
  });

  test("in the pane: the router's refresh and the pane's query again", () => {
    refreshes = 0;
    let paneReads = 0;
    callWith(
      (refresh) => refresh(),
      () => {
        paneReads += 1;
      },
    );
    assert.equal(refreshes, 1);
    assert.equal(paneReads, 1);
  });
});
