/**
 * Fettle M-8, ported: the overlay switch draws only where a press is felt
 * through it (an iPhone: touch, no `vibrate`) and only with Haptics on, so an
 * overlay never ticks for someone who turned haptics off; `force` draws it
 * anyway for the one press that turns them ON. `FeedbackProvider` mounts the
 * one hidden switch and changes nothing else on the page.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!GlobalRegistrator.isRegistered) {
  GlobalRegistrator.register({ url: "http://localhost/" });
}
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { renderToString } = await import("react-dom/server");
const { HapticOverlay } = await import("./HapticSwitch");
const { HAPTICS_KEY } = await import("./settings");
const { setFeedbackSettings } = await import("./settings");
const { FeedbackProvider } = await import(
  "@/components/providers/FeedbackProvider"
);

const proto = Object.getPrototypeOf(navigator) as object;
const vibrate = Object.getOwnPropertyDescriptor(proto, "vibrate");
const touch = Object.getOwnPropertyDescriptor(proto, "maxTouchPoints");

function iPhone(): void {
  Object.defineProperty(proto, "vibrate", {
    value: undefined,
    configurable: true,
  });
  Object.defineProperty(proto, "maxTouchPoints", {
    get: () => 5,
    configurable: true,
  });
}

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

async function render(node: React.ReactNode): Promise<void> {
  await act(async () => {
    root.render(node);
  });
}

const overlays = (): number =>
  document.querySelectorAll("[data-slot=haptic-overlay]").length;

beforeEach(() => {
  iPhone();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  document.body.replaceChildren();
  window.localStorage.removeItem(HAPTICS_KEY);
  if (vibrate) Object.defineProperty(proto, "vibrate", vibrate);
  else Reflect.deleteProperty(proto, "vibrate");
  if (touch) Object.defineProperty(proto, "maxTouchPoints", touch);
});

describe("the overlay switch", () => {
  test("draws on an iPhone with haptics on, as an aria-hidden switch out of the tab order", async () => {
    await render(
      <button type="button" className="relative">
        Go
        <HapticOverlay />
      </button>,
    );
    assert.equal(overlays(), 1);
    const input = document.querySelector("[data-slot=haptic-overlay]");
    assert.equal(input?.getAttribute("aria-hidden"), "true");
    assert.equal(input?.getAttribute("tabindex"), "-1");
    assert.equal(input?.hasAttribute("switch"), true);
    assert.equal(document.querySelector("button")?.textContent, "Go");
  });

  test("draws nothing with haptics off, and goes when they are switched off", async () => {
    await render(
      <button type="button">
        Go
        <HapticOverlay />
      </button>,
    );
    assert.equal(overlays(), 1);
    await act(async () => {
      setFeedbackSettings({ haptics: false });
    });
    assert.equal(overlays(), 0);
  });

  test("draws with haptics off when forced: the press that turns them on is felt", async () => {
    window.localStorage.setItem(HAPTICS_KEY, "off");
    await render(
      <button type="button">
        On
        <HapticOverlay force />
      </button>,
    );
    assert.equal(overlays(), 1);
  });

  test("draws nothing, forced or not, where the device buzzes for itself", async () => {
    Object.defineProperty(proto, "vibrate", {
      value: () => true,
      configurable: true,
    });
    await render(
      <button type="button">
        On
        <HapticOverlay force />
      </button>,
    );
    assert.equal(overlays(), 0);
  });

  test("draws nothing on the server", () => {
    const html = renderToString(
      <button type="button">
        Go
        <HapticOverlay force />
      </button>,
    );
    assert.equal(html.includes("haptic-overlay"), false);
  });
});

describe("FeedbackProvider", () => {
  test("mounts one hidden switch beside its children", async () => {
    await render(
      <FeedbackProvider>
        <p>child</p>
      </FeedbackProvider>,
    );
    assert.equal(
      document.querySelectorAll("[data-slot=haptic-switch]").length,
      1,
    );
    assert.equal(document.querySelector("p")?.textContent, "child");
  });
});
