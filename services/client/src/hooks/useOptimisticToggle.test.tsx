/**
 * `useOptimisticToggle` (X24): the tapped state is drawn before the write
 * answers, the server's answer is kept without a flicker back, a refusal
 * falls back and reports, a later tap's answer is the one that counts, and a
 * new value from the page replaces the confirmed state. Driven through
 * happy-dom with a write whose answer each test releases by hand.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { useOptimisticToggle } = await import("./useOptimisticToggle");
type ToggleCommitResult = import("./useOptimisticToggle").ToggleCommitResult;

/** A write the test answers: `calls[i].resolve(result)` releases call i. */
type Call = {
  next: boolean;
  resolve: (result: ToggleCommitResult) => void;
  reject: (error: unknown) => void;
};
let calls: Call[];
let errors: string[];

const commit = (next: boolean) =>
  new Promise<ToggleCommitResult>((resolve, reject) => {
    calls.push({ next, resolve, reject });
  });

function Harness({ value }: { value: boolean }) {
  const toggle = useOptimisticToggle({
    value,
    commit,
    onError: (message) => errors.push(message),
  });
  return (
    <button
      type="button"
      aria-pressed={toggle.on}
      aria-busy={toggle.pending || undefined}
      onClick={toggle.toggle}
    >
      toggle
    </button>
  );
}

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  calls = [];
  errors = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  // Answer anything left open: React entangles async transitions, so one a
  // test never settles would hold the next test's pending forever.
  await act(async () => {
    for (const call of calls) call.resolve({ ok: true });
    await new Promise((r) => setTimeout(r, 0));
  });
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const button = () => {
  const b = container.querySelector("button");
  assert.ok(b, "the harness rendered its button");
  return b;
};
const pressed = () => button().getAttribute("aria-pressed");
const busy = () => button().getAttribute("aria-busy") === "true";
const mount = async (value: boolean) => {
  await act(async () => root.render(<Harness value={value} />));
};
const tap = async () => {
  await act(async () => button().click());
};
const answer = async (i: number, result: ToggleCommitResult) => {
  await act(async () => {
    calls[i]?.resolve(result);
    await new Promise((r) => setTimeout(r, 0));
  });
};

describe("useOptimisticToggle", () => {
  test("the tapped state is drawn before the write answers", async () => {
    await mount(false);
    assert.equal(pressed(), "false");
    await tap();
    assert.equal(pressed(), "true", "on in the tap's own commit");
    assert.equal(busy(), true, "the write is in flight");
    assert.deepEqual(
      calls.map((c) => c.next),
      [true],
    );
  });

  test("a confirmed write keeps the state, with no flicker back", async () => {
    await mount(false);
    await tap();
    await answer(0, { ok: true });
    assert.equal(pressed(), "true");
    assert.equal(busy(), false);
    assert.deepEqual(errors, []);
  });

  test("the server's reported value wins over the guess", async () => {
    await mount(false);
    await tap();
    await answer(0, { ok: true, value: false });
    assert.equal(pressed(), "false");
  });

  test("a refused write falls back and reports why", async () => {
    await mount(true);
    await tap();
    assert.equal(pressed(), "false");
    await answer(0, { ok: false, message: "Forbidden" });
    assert.equal(pressed(), "true", "back to what the server holds");
    assert.deepEqual(errors, ["Forbidden"]);
  });

  test("a write that throws is a refusal too", async () => {
    await mount(false);
    await tap();
    await act(async () => {
      calls[0]?.reject(new Error("offline"));
      await new Promise((r) => setTimeout(r, 0));
    });
    assert.equal(pressed(), "false");
    assert.deepEqual(errors, ["offline"]);
  });

  test("a second tap during the write is taken, and its answer is the one kept", async () => {
    await mount(false);
    await tap();
    await tap();
    assert.equal(pressed(), "false", "the second tap flipped it back");
    assert.deepEqual(
      calls.map((c) => c.next),
      [true, false],
    );
    // The later write answers first; the earlier one's late answer must not
    // undo it.
    await answer(1, { ok: true });
    await answer(0, { ok: true });
    assert.equal(pressed(), "false");
  });

  test("a new value from the page replaces the confirmed state", async () => {
    await mount(false);
    await mount(true);
    assert.equal(pressed(), "true");
    await tap();
    assert.equal(pressed(), "false");
    assert.deepEqual(
      calls.map((c) => c.next),
      [false],
    );
  });
});
