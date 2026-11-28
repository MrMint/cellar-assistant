import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createDraftStore, DRAFT_TTL_MS, draftIdFrom } from "./draft-store.ts";

const meta = { label: "wine", resumeHref: "/add/wines?draft=a" };

const deferred = <T>() => {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("draft store (X05 background continuation)", () => {
  test("one read per id: a second track adopts the first", async () => {
    const store = createDraftStore<string>();
    let started = 0;
    const read = deferred<string>();
    const start = () => {
      started += 1;
      return read.promise;
    };
    const first = store.track("a", meta, start);
    const second = store.track("a", meta, start);
    assert.equal(started, 1);
    assert.equal(first, second);
    read.resolve("defaults");
    assert.equal(await second, "defaults");
    assert.deepEqual(store.get("a")?.settled, {
      state: "ready",
      value: "defaults",
    });
  });

  test("backgrounded: the callback runs once the read settles", async () => {
    const store = createDraftStore<string>();
    const read = deferred<string>();
    store.track("a", meta, () => read.promise);
    const seen: string[] = [];
    assert.equal(
      store.background("a", (draft) => seen.push(draft.settled.state)),
      true,
    );
    assert.deepEqual(seen, []);
    read.resolve("x");
    await tick();
    assert.deepEqual(seen, ["ready"]);
  });

  test("backgrounded after it settled: the callback runs at once", async () => {
    const store = createDraftStore<string>();
    const read = deferred<string>();
    store.track("a", meta, () => read.promise);
    read.reject(new Error("transport"));
    await tick();
    const seen: string[] = [];
    store.background("a", (draft) => seen.push(draft.settled.state));
    assert.deepEqual(seen, ["failed"]);
  });

  test("a failed read is not adopted: the retry starts again", async () => {
    const store = createDraftStore<string>();
    store.track("a", meta, () => Promise.reject(new Error("transport")));
    await tick();
    let started = 0;
    const retry = store.track("a", meta, () => {
      started += 1;
      return Promise.resolve("second");
    });
    assert.equal(started, 1);
    assert.equal(await retry, "second");
  });

  test("released drafts are gone; unknown ids are refused", () => {
    const store = createDraftStore<string>();
    store.track("a", meta, () => Promise.resolve("x"));
    store.release("a");
    assert.equal(store.get("a"), null);
    assert.equal(
      store.background("nope", () => {}),
      false,
    );
  });

  test("a settled draft nobody came back for is pruned after the TTL", async () => {
    let clock = 0;
    const store = createDraftStore<string>(() => clock);
    store.track("old", meta, () => Promise.resolve("x"));
    await tick();
    clock = DRAFT_TTL_MS + 1;
    store.track("new", meta, () => Promise.resolve("y"));
    assert.equal(store.get("old"), null);
    assert.notEqual(store.get("new"), null);
  });
});

describe("list (F-64: the background pill's own reads)", () => {
  test("every draft still held, newest first, past the TTL pruned", async () => {
    let clock = 0;
    const store = createDraftStore<string>(() => clock);
    const slow = deferred<string>();
    store.track("old", meta, () => Promise.resolve("x"));
    await tick();
    clock = DRAFT_TTL_MS + 1;
    store.track("reading", meta, () => slow.promise);
    clock += 1;
    store.track("ready", { ...meta, label: "beer" }, () =>
      Promise.resolve("y"),
    );
    await tick();
    const listed = store.list();
    assert.deepEqual(
      listed.map((draft) => draft.id),
      ["ready", "reading"],
    );
    assert.equal(listed[0]?.settled.state, "ready");
    assert.equal(listed[0]?.meta.label, "beer");
    assert.equal(listed[1]?.settled.state, "reading");
    store.release("ready");
    assert.deepEqual(
      store.list().map((draft) => draft.id),
      ["reading"],
    );
  });
});

describe("?draft= (X05 resume link)", () => {
  test("only a session id resumes; anything else opens a fresh capture", () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
    assert.equal(draftIdFrom(id), id);
    assert.equal(draftIdFrom(id.toUpperCase()), id);
    assert.equal(draftIdFrom(undefined), undefined);
    assert.equal(draftIdFrom(""), undefined);
    assert.equal(draftIdFrom("abc"), undefined);
    assert.equal(draftIdFrom(`${id}x`), undefined);
  });
});
