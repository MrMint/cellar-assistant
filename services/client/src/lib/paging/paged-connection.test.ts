/**
 * The paging rules, without React — every race below is one a component in
 * this repo either had or was one slow request away from having.
 *
 *   bun run --filter @cellar-assistant/client test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ApiFailure, ApiResult } from "@/lib/api/result";
import {
  createPagedConnection,
  type Page,
  pageOf,
  toPage,
} from "./paged-connection";

type Args = { filter: string };

/** A fetch whose answers the test releases by hand, in any order. */
const controllable = () => {
  const calls: {
    args: Args;
    after: string | null;
    fresh: boolean;
    resolve: (result: ApiResult<Page<string>>) => void;
  }[] = [];
  const fetchPage = (
    args: Args,
    after: string | null,
    { fresh }: { fresh: boolean },
  ) =>
    new Promise<ApiResult<Page<string>>>((resolve) => {
      calls.push({ args, after, fresh, resolve });
    });
  return { calls, fetchPage };
};

const page = (
  rows: string[],
  endCursor: string | null,
  hasNextPage: boolean,
  totalCount?: number | null,
): ApiResult<Page<string>> => ({
  ok: true,
  data: {
    rows,
    endCursor,
    hasNextPage,
    ...(totalCount === undefined ? {} : { totalCount }),
  },
});

const FAILURE: ApiFailure = {
  __typename: "ValidationError",
  code: "VALIDATION",
  reason: null,
  message: "no",
};

const start = (initialHasNextPage = true) => {
  const fetcher = controllable();
  const connection = createPagedConnection<string, Args>({
    fetchPage: fetcher.fetchPage,
    initial: {
      rows: ["a1", "a2"],
      endCursor: "a2",
      hasNextPage: initialHasNextPage,
      totalCount: 5,
    },
    initialArgs: { filter: "a" },
  });
  return { ...fetcher, connection };
};

/** Let the awaiting continuation in the connection run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createPagedConnection", () => {
  test("seeds from the server page", () => {
    const { connection } = start();
    assert.deepEqual(connection.getState(), {
      rows: ["a1", "a2"],
      endCursor: "a2",
      hasNextPage: true,
      totalCount: 5,
      meta: undefined,
      args: { filter: "a" },
      status: "idle",
      failure: null,
      canLoadMore: true,
    });
  });

  test("loadMore asks after the held cursor and appends", async () => {
    const { connection, calls } = start();
    const loaded = connection.loadMore();
    assert.equal(connection.getState().status, "loadingMore");
    assert.deepEqual(
      { args: calls[0]?.args, after: calls[0]?.after },
      { args: { filter: "a" }, after: "a2" },
    );
    calls[0]?.resolve(page(["a3"], "a3", false));
    assert.equal(await loaded, true);
    const state = connection.getState();
    assert.deepEqual(state.rows, ["a1", "a2", "a3"]);
    assert.equal(state.endCursor, "a3");
    assert.equal(state.canLoadMore, false);
    // The page said nothing about the count, so the held one stands.
    assert.equal(state.totalCount, 5);
  });

  test("a second loadMore while one is in flight does nothing (double click)", async () => {
    const { connection, calls } = start();
    void connection.loadMore();
    assert.equal(await connection.loadMore(), false);
    assert.equal(calls.length, 1, "the same page was requested twice");
  });

  test("loadMore does nothing during a reset", async () => {
    const { connection, calls } = start();
    void connection.reset({ filter: "b" });
    assert.equal(connection.getState().canLoadMore, false);
    assert.equal(await connection.loadMore(), false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.after, null);
  });

  test("a load-more still in flight when the filter changes is dropped (RankingsBoard)", async () => {
    const { connection, calls } = start();
    const stale = connection.loadMore();
    const fresh = connection.reset({ filter: "b" });
    // The reset's answer first, then the old filter's page arrives late.
    calls[1]?.resolve(page(["b1"], "b1", true));
    assert.equal(await fresh, true);
    calls[0]?.resolve(page(["a3"], "a3", false));
    assert.equal(await stale, false);
    const state = connection.getState();
    assert.deepEqual(state.rows, ["b1"], "the old filter's rows were appended");
    assert.equal(state.endCursor, "b1", "the old filter's cursor landed");
    assert.deepEqual(state.args, { filter: "b" });
  });

  test("only the newest of two resets lands, whichever answers last", async () => {
    const { connection, calls } = start();
    const first = connection.reset({ filter: "b" });
    const second = connection.reset({ filter: "c" });
    calls[1]?.resolve(page(["c1"], null, false));
    calls[0]?.resolve(page(["b1"], "b1", true));
    assert.deepEqual([await first, await second], [false, true]);
    assert.deepEqual(connection.getState().rows, ["c1"]);
  });

  test("only a reset asked to be fresh bypasses the cache", () => {
    const { connection, calls } = start();
    void connection.reset(undefined, { fresh: true });
    void connection.reset();
    assert.deepEqual(
      calls.map((call) => call.fresh),
      [true, false],
    );
    assert.deepEqual(
      calls[1]?.args,
      { filter: "a" },
      "default is current args",
    );
  });

  test("a reset keeps rows on screen unless told to clear them", async () => {
    const { connection, calls } = start();
    void connection.reset({ filter: "b" });
    assert.deepEqual(connection.getState().rows, ["a1", "a2"]);
    void connection.reset({ filter: "c" }, { clear: true });
    const cleared = connection.getState();
    assert.deepEqual(cleared.rows, []);
    assert.equal(cleared.totalCount, null);
    assert.equal(calls.length, 2);
  });

  test("a failed reset leaves nothing to load more from", async () => {
    const { connection, calls } = start();
    const reset = connection.reset({ filter: "b" });
    calls[0]?.resolve({ ok: false, error: FAILURE });
    assert.equal(await reset, false);
    const state = connection.getState();
    assert.equal(state.failure, FAILURE);
    assert.equal(state.status, "idle");
    assert.equal(
      state.canLoadMore,
      false,
      "paging on from the old filter's cursor would splice two lists",
    );
  });

  test("a failed load-more keeps the list and can be retried", async () => {
    const { connection, calls } = start();
    const first = connection.loadMore();
    calls[0]?.resolve({ ok: false, error: FAILURE });
    assert.equal(await first, false);
    assert.equal(connection.getState().canLoadMore, true);
    assert.deepEqual(connection.getState().rows, ["a1", "a2"]);
    void connection.loadMore();
    assert.equal(calls[1]?.after, "a2");
    assert.equal(connection.getState().failure, null);
  });

  test("a fetch that throws is a transport failure, not an unhandled rejection", async () => {
    const connection = createPagedConnection<string, Args>({
      fetchPage: async () => {
        throw new Error("socket hang up");
      },
      initial: { rows: [], endCursor: "x", hasNextPage: true },
      initialArgs: { filter: "a" },
    });
    assert.equal(await connection.loadMore(), false);
    assert.equal(connection.getState().failure?.code, "TRANSPORT");
    assert.equal(connection.getState().failure?.message, "socket hang up");
  });

  test("a list with no server page starts out resetting, not empty-and-done", async () => {
    const fetcher = controllable();
    const connection = createPagedConnection<string, Args>({
      fetchPage: fetcher.fetchPage,
      initial: null,
      initialArgs: { filter: "a" },
    });
    assert.equal(connection.getState().status, "resetting");
    assert.equal(connection.getState().canLoadMore, false);
    const reset = connection.reset();
    fetcher.calls[0]?.resolve(page(["a1"], "a1", true));
    assert.equal(await reset, true);
    assert.equal(connection.getState().canLoadMore, true);
  });

  test("meta lands with its page, and only with its page", async () => {
    const calls: ((result: ApiResult<Page<string, number>>) => void)[] = [];
    const connection = createPagedConnection<string, Args, number>({
      fetchPage: () =>
        new Promise((resolve) => {
          calls.push(resolve);
        }),
      initial: { rows: [], endCursor: "x", hasNextPage: true, meta: 1 },
      initialArgs: { filter: "a" },
    });
    const stale = connection.reset();
    const fresh = connection.reset();
    calls[1]?.({
      ok: true,
      data: { rows: [], endCursor: null, hasNextPage: false, meta: 3 },
    });
    calls[0]?.({
      ok: true,
      data: { rows: [], endCursor: null, hasNextPage: false, meta: 2 },
    });
    await Promise.all([stale, fresh]);
    assert.equal(
      connection.getState().meta,
      3,
      "a superseded page's meta landed",
    );
    connection.replace({ rows: [], endCursor: null, hasNextPage: false });
    assert.equal(
      connection.getState().meta,
      3,
      "a page with no meta cleared it",
    );
  });

  test("hasNextPage without a cursor is not loadable", () => {
    const connection = createPagedConnection<string, Args>({
      fetchPage: controllable().fetchPage,
      initial: { rows: ["a"], endCursor: null, hasNextPage: true },
      initialArgs: { filter: "a" },
    });
    assert.equal(connection.getState().canLoadMore, false);
  });

  test("replace adopts a newer page and retires what is in flight", async () => {
    const { connection, calls } = start();
    const stale = connection.loadMore();
    connection.replace({ rows: ["s1"], endCursor: "s1", hasNextPage: true });
    calls[0]?.resolve(page(["a3"], "a3", false));
    assert.equal(await stale, false);
    assert.deepEqual(connection.getState().rows, ["s1"]);
    assert.equal(connection.getState().status, "idle");
  });

  test("updateRows edits in place and notifies", () => {
    const { connection } = start();
    let notified = 0;
    const unsubscribe = connection.subscribe(() => {
      notified += 1;
    });
    connection.updateRows((rows) => rows.map((row) => row.toUpperCase()));
    unsubscribe();
    connection.updateRows((rows) => rows);
    assert.deepEqual(connection.getState().rows, ["A1", "A2"]);
    assert.equal(notified, 1);
  });

  test("the state object changes identity on every change (useSyncExternalStore)", async () => {
    const { connection, calls } = start();
    const before = connection.getState();
    const loaded = connection.loadMore();
    const during = connection.getState();
    calls[0]?.resolve(page(["a3"], "a3", false));
    await loaded;
    await settle();
    assert.notEqual(before, during);
    assert.notEqual(during, connection.getState());
    assert.equal(connection.getState(), connection.getState());
  });
});

describe("toPage / pageOf", () => {
  const connection = {
    edges: [{ cursor: "c1", node: 1 }],
    pageInfo: { endCursor: "c1", hasNextPage: true },
  };

  test("uses the edges as rows, or maps them", () => {
    assert.deepEqual(toPage(connection).rows, connection.edges);
    assert.deepEqual(toPage(connection, (edge) => edge.node * 2).rows, [2]);
  });

  test("an unselected totalCount says nothing; a null one says null", () => {
    assert.equal("totalCount" in toPage(connection), false);
    assert.equal(toPage({ ...connection, totalCount: null }).totalCount, null);
  });

  test("pageOf passes a failure through untouched", () => {
    const failed = { ok: false as const, error: FAILURE };
    assert.equal(pageOf(failed), failed);
    assert.deepEqual(pageOf({ ok: true, data: connection }), {
      ok: true,
      data: toPage(connection),
    });
  });
});
