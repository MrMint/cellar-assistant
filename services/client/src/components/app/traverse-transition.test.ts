/**
 * A history traversal's transition type (E-6, W-9). Next starts browser
 * Back as `startTransition(() => dispatchTraverseAction(…))` and calls
 * `onRouterTransitionStart(url, "traverse")` inside that scope. The type must
 * be added right there, on Next's own transition: a type added from a
 * separate `popstate` listener commits on its own and never reaches the
 * page swap. This test asserts that it is added synchronously while Next's
 * transition is current.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (typeof window === "undefined") {
  GlobalRegistrator.register({ url: "http://localhost/" });
}

/** Each `addTransitionType` call, and whether a transition was current. */
const added: { type: string; inTransition: boolean }[] = [];
let inTransition = false;
let recording = false;
const realReact = await import("react");
const realAdd = realReact.addTransitionType;
// Spread the real module and pass through outside this file's calls: bun's
// module mocks outlive this file.
mock.module("react", () => ({
  ...realReact,
  addTransitionType: (type: string) => {
    if (recording) added.push({ type, inTransition });
    else realAdd(type);
  },
}));

const { expectPop, onRouterTransitionStart, setTraverseReducedMotion } =
  await import("./traverse-transition");
const instrumentation = await import("../../instrumentation-client");

/** What Next's onPopState does: the hook runs inside its startTransition. */
const traverse = (path: string): string[] => {
  added.length = 0;
  window.history.pushState(null, "", path);
  inTransition = true;
  recording = true;
  try {
    instrumentation.onRouterTransitionStart(
      `http://localhost${path}`,
      "traverse",
    );
  } finally {
    inTransition = false;
    recording = false;
  }
  assert.ok(added.every((call) => call.inTransition));
  return added.map((call) => call.type);
};

const withApi = () => {
  (document as { startViewTransition?: unknown }).startViewTransition =
    () => {};
};

afterEach(() => {
  Reflect.deleteProperty(document, "startViewTransition");
  window.sessionStorage.removeItem("ca:nav-stack");
  setTraverseReducedMotion(false);
});

describe("onRouterTransitionStart", () => {
  test("instrumentation-client re-exports the hook Next calls", () => {
    assert.equal(
      instrumentation.onRouterTransitionStart,
      onRouterTransitionStart,
    );
  });

  test("browser Back from an item page carries nav-back", () => {
    withApi();
    window.sessionStorage.setItem(
      "ca:nav-stack",
      JSON.stringify(["/", "/cellars", "/cellars/1"]),
    );
    assert.deepEqual(traverse("/cellars"), ["nav-back"]);
  });

  test("Back between two tabs' roots is a tab switch", () => {
    withApi();
    window.sessionStorage.setItem(
      "ca:nav-stack",
      JSON.stringify(["/cellars", "/me"]),
    );
    assert.deepEqual(traverse("/cellars"), ["nav-tab"]);
  });

  test("navigate.back() says the kind; it is used once", () => {
    withApi();
    expectPop("tab");
    assert.deepEqual(traverse("/cellars"), ["nav-tab"]);
    assert.deepEqual(traverse("/cellars"), []);
  });

  test("push and replace are left alone: they carry their own types", () => {
    withApi();
    expectPop("back");
    added.length = 0;
    recording = true;
    try {
      onRouterTransitionStart("http://localhost/wines/1", "push");
      onRouterTransitionStart("http://localhost/wines/1", "replace");
    } finally {
      recording = false;
    }
    assert.deepEqual(added, []);
  });

  test("reduced motion or no View Transition API: no type", () => {
    window.sessionStorage.setItem(
      "ca:nav-stack",
      JSON.stringify(["/cellars", "/cellars/1"]),
    );
    assert.deepEqual(traverse("/cellars"), []);
    withApi();
    setTraverseReducedMotion(true);
    window.sessionStorage.setItem(
      "ca:nav-stack",
      JSON.stringify(["/cellars", "/cellars/1"]),
    );
    assert.deepEqual(traverse("/cellars"), []);
  });
});
