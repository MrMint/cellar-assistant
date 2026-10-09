/**
 * "When" (X03's backdating) in a DOM: a log is now unless you say otherwise;
 * "Earlier…" opens the device's date-and-time picker; a time the server
 * would refuse — the future — is said under it, and the caller hears it so
 * its button can wait.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/wines/w1" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { act, useState } = React;
const { createRoot } = await import("react-dom/client");
const { WhenPicker } = await import("./WhenPicker");
const { toLocalInputValue } = await import("./log-draft");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
let value: string | null = null;
let problem: string | null = null;

function Harness() {
  const [when, setWhen] = useState<string | null>(null);
  value = when;
  return (
    <WhenPicker
      value={when}
      onChange={setWhen}
      onProblem={(next) => {
        problem = next;
      }}
    />
  );
}

beforeEach(async () => {
  value = null;
  problem = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const chip = (name: RegExp) =>
  [...container.querySelectorAll("button")].find((b) =>
    name.test(b.textContent ?? ""),
  );

/** React's controlled input listens for `input` after the native setter. */
const type = async (input: HTMLInputElement, next: string) => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setter?.call(input, next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("WhenPicker", () => {
  test("Now by default; Earlier opens the picker on now", async () => {
    assert.equal(chip(/^Now$/)?.getAttribute("aria-pressed"), "true");
    assert.equal(container.querySelector('input[type="datetime-local"]'), null);
    await act(async () => chip(/Earlier/)?.click());
    const input = container.querySelector<HTMLInputElement>(
      'input[type="datetime-local"]',
    );
    assert.ok(input, "the device's own picker");
    assert.notEqual(value, null, "a time is chosen");
    assert.equal(problem, null);

    await act(async () => chip(/^Now$/)?.click());
    assert.equal(value, null);
  });

  test("a time in the future is refused here, before the tap", async () => {
    await act(async () => chip(/Earlier/)?.click());
    const input = container.querySelector<HTMLInputElement>(
      'input[type="datetime-local"]',
    );
    assert.ok(input);
    const tomorrow = new Date(Date.now() + 86_400_000);
    await type(input, toLocalInputValue(tomorrow));
    assert.match(
      container.querySelector('[role="alert"]')?.textContent ?? "",
      /future/,
    );
    assert.match(problem ?? "", /future/);

    const lastWeek = new Date(Date.now() - 7 * 86_400_000);
    await type(input, toLocalInputValue(lastWeek));
    assert.equal(container.querySelector('[role="alert"]'), null);
    assert.equal(problem, null);
  });
});
