/**
 * `TogglePop` (X24, design §4.5): the glyph pops when the *user* turns a
 * toggle on — and not when the data does (a drawer whose interaction arrives
 * after it opened, a refetch). Driven through `useOptimisticToggle`, whose
 * `pending` is what callers pass as `pop`, so this also pins that `pending`
 * is already true in the frame the tap turns the toggle on. happy-dom; the
 * pop is read off the glyph's first-frame transform.
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
const { TogglePop } = await import("./TogglePop");
const { useOptimisticToggle } = await import("@/hooks/useOptimisticToggle");
type ToggleCommitResult =
  import("@/hooks/useOptimisticToggle").ToggleCommitResult;

let answers: ((result: ToggleCommitResult) => void)[];

function Harness({ value }: { value: boolean }) {
  const toggle = useOptimisticToggle({
    value,
    commit: () =>
      new Promise<ToggleCommitResult>((resolve) => {
        answers.push(resolve);
      }),
  });
  return (
    <button type="button" onClick={toggle.toggle}>
      <TogglePop on={toggle.on} pop={toggle.pending}>
        <svg />
      </TogglePop>
    </button>
  );
}

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  answers = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    for (const answer of answers) answer({ ok: true });
    await new Promise((r) => setTimeout(r, 0));
  });
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const glyph = () => {
  const span = container.querySelector('[data-slot="toggle-pop"]');
  assert.ok(span, "the pop wrapper rendered");
  return span as HTMLElement;
};
/** Above rest by more than a rounding error: the pop has started (it may
 * already have eased a hair off 1.18 by the time the assertion reads it). */
const popped = () => {
  const scale = /scale\(([\d.]+)\)/.exec(glyph().getAttribute("style") ?? "");
  return scale !== null && Number(scale[1]) > 1.05;
};
const mount = async (value: boolean) => {
  await act(async () => root.render(<Harness value={value} />));
};

describe("TogglePop", () => {
  test("a tap that turns it on pops, in the tap's own frame", async () => {
    await mount(false);
    assert.equal(popped(), false, "at rest before the tap");
    await act(async () => container.querySelector("button")?.click());
    assert.equal(glyph().getAttribute("data-state"), "on");
    assert.equal(popped(), true);
  });

  test("the data turning it on does not pop", async () => {
    await mount(false);
    await mount(true);
    assert.equal(glyph().getAttribute("data-state"), "on");
    assert.equal(popped(), false);
  });

  test("already on at mount does not pop", async () => {
    await mount(true);
    assert.equal(popped(), false);
  });
});
