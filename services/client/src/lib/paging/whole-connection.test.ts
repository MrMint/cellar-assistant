/**
 *   bun run --filter @cellar-assistant/client test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ApiFailure } from "@/lib/api/result";
import { nextWalkStep, visibleRows } from "./whole-connection";

const FAILURE: ApiFailure = {
  __typename: "TransportError",
  code: "TRANSPORT",
  reason: null,
  message: "down",
};

const rowsOf = (count: number) =>
  Array.from({ length: count }, (_, index) => `row-${index}`);

const idle = (count: number, hasNextPage: boolean) => ({
  rows: rowsOf(count),
  status: "idle" as const,
  failure: null,
  hasNextPage,
  canLoadMore: hasNextPage,
});

describe("nextWalkStep", () => {
  test("asks for the next page while the server says there is one", () => {
    assert.equal(nextWalkStep(idle(100, true), 100), "load");
    assert.equal(nextWalkStep(idle(300, true), 100), "load");
  });

  test("is done at the last page", () => {
    assert.equal(nextWalkStep(idle(100, false), 100), "done");
    assert.equal(nextWalkStep(idle(0, false), 100), "done");
  });

  test("waits while a first page or a later one is in flight", () => {
    assert.equal(
      nextWalkStep({ ...idle(0, false), status: "resetting" }, 100),
      "wait",
    );
    assert.equal(
      nextWalkStep(
        { ...idle(100, true), status: "loadingMore", canLoadMore: false },
        100,
      ),
      "wait",
    );
  });

  test("stops on a failure instead of retrying in a loop", () => {
    assert.equal(
      nextWalkStep({ ...idle(100, true), failure: FAILURE }, 100),
      "done",
    );
  });

  test("stops at the page guard", () => {
    assert.equal(nextWalkStep(idle(200, true), 100, 2), "done");
    assert.equal(nextWalkStep(idle(100, true), 100, 2), "load");
  });

  test("hasNextPage with nothing to page from is done, not a stuck wait", () => {
    assert.equal(
      nextWalkStep({ ...idle(100, true), canLoadMore: false }, 100),
      "done",
    );
  });
});

describe("visibleRows", () => {
  const all = rowsOf(150);
  const firstPage = rowsOf(100);

  test("the first walk shows what has arrived so far", () => {
    assert.deepEqual(visibleRows(firstPage, "load", null), firstPage);
  });

  test("a refresh keeps the last whole list until its own walk is done", () => {
    assert.deepEqual(visibleRows(firstPage, "load", all), all);
    assert.deepEqual(visibleRows(firstPage, "wait", all), all);
  });

  test("a finished walk shows its own rows, longer or shorter", () => {
    const fewer = rowsOf(120);
    assert.deepEqual(visibleRows(fewer, "done", all), fewer);
  });
});
