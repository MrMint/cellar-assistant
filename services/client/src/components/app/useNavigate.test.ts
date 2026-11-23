/**
 * `useNavigate` (ux-c M2, B05). Without the View Transition API (happy-dom
 * has none, like an old browser) every call reaches Next's router as the
 * same method with the same arguments the call site used to pass it
 * directly: navigation works and nothing about it changes. With the API,
 * `kind` — given or inferred — becomes Next's `transitionTypes`, and reduced
 * motion drops them again. `back` tells `RouteTransition` the pop's kind.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (typeof window === "undefined") {
  GlobalRegistrator.register({ url: "http://localhost/" });
}
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Call = readonly [method: string, ...args: unknown[]];
const calls: Call[] = [];
const router = {
  push: (...args: unknown[]) => {
    calls.push(["push", ...args]);
  },
  replace: (...args: unknown[]) => {
    calls.push(["replace", ...args]);
  },
  back: (...args: unknown[]) => {
    calls.push(["back", ...args]);
  },
  forward: () => {},
  refresh: () => {},
  prefetch: () => {},
};
mock.module("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

/** The viewer's reduced-motion preference, as motion's hook reports it. */
let reduced = false;
const realMotion = await import("motion/react");
// Spread the real module: bun's module mocks outlive this file.
mock.module("motion/react", () => ({
  ...realMotion,
  useReducedMotion: () => reduced,
}));

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { useNavigate } = await import("./useNavigate");
const { takePopKind } = await import("./RouteTransition");
type Navigate = import("./useNavigate").Navigate;

/** Mounts a component that hands back the hook's value. */
const mountNavigate = async (): Promise<{
  navigate: Navigate;
  rerender: () => Promise<Navigate>;
  unmount: () => Promise<void>;
}> => {
  let current: Navigate | undefined;
  const Probe = () => {
    current = useNavigate();
    return null;
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(Probe)));
  const read = (): Navigate => {
    if (current === undefined) throw new Error("useNavigate did not render");
    return current;
  };
  return {
    navigate: read(),
    rerender: async () => {
      await act(async () => root.render(React.createElement(Probe)));
      return read();
    },
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
};

const take = (): Call[] => calls.splice(0, calls.length);

describe("useNavigate", () => {
  test("push passes the href alone when no options are given", async () => {
    const { navigate, unmount } = await mountNavigate();
    take();
    navigate.push("/cellars");
    navigate.push("/cellars/1", { kind: "forward" });
    assert.deepEqual(take(), [
      ["push", "/cellars"],
      ["push", "/cellars/1"],
    ]);
    await unmount();
  });

  test("push and replace forward scroll exactly as given", async () => {
    const { navigate, unmount } = await mountNavigate();
    take();
    navigate.push("/a", { scroll: false });
    navigate.replace("/b", { scroll: true, kind: "none" });
    navigate.replace("/c");
    navigate.replace("?q=wine", { kind: "none" });
    assert.deepEqual(take(), [
      ["push", "/a", { scroll: false }],
      ["replace", "/b", { scroll: true }],
      ["replace", "/c"],
      ["replace", "?q=wine"],
    ]);
    await unmount();
  });

  test("back takes no arguments to the router, whatever the kind", async () => {
    const { navigate, unmount } = await mountNavigate();
    take();
    navigate.back();
    navigate.back({ kind: "back" });
    assert.deepEqual(take(), [["back"], ["back"]]);
    await unmount();
  });

  test("no View Transition API: navigation still works, with no types", async () => {
    assert.equal(
      (document as { startViewTransition?: unknown }).startViewTransition,
      undefined,
    );
    const { navigate, unmount } = await mountNavigate();
    take();
    navigate.push("/cellars/1", { kind: "forward" });
    navigate.replace("/cellars", { kind: "back" });
    assert.deepEqual(take(), [
      ["push", "/cellars/1"],
      ["replace", "/cellars"],
    ]);
    await unmount();
  });

  test("is stable across renders, so it is safe in dependency arrays", async () => {
    const { navigate, rerender, unmount } = await mountNavigate();
    assert.equal(await rerender(), navigate);
    await unmount();
  });
});

describe("useNavigate with the View Transition API", () => {
  const doc = document as { startViewTransition?: unknown };
  const withApi = async (body: (navigate: Navigate) => void) => {
    doc.startViewTransition = () => ({});
    window.history.replaceState(null, "", "/cellars/1");
    const { navigate, unmount } = await mountNavigate();
    take();
    try {
      body(navigate);
    } finally {
      await unmount();
      delete doc.startViewTransition;
      window.history.replaceState(null, "", "/");
    }
  };

  test("push: deeper is forward, an ancestor is back, a tab root is a tab", async () => {
    await withApi((navigate) => {
      navigate.push("/wines/9");
      navigate.push("/cellars");
      navigate.push("/map", { scroll: false });
    });
    assert.deepEqual(take(), [
      ["push", "/wines/9", { transitionTypes: ["nav-forward"] }],
      ["push", "/cellars", { transitionTypes: ["nav-back"] }],
      ["push", "/map", { scroll: false, transitionTypes: ["nav-tab"] }],
    ]);
  });

  test("replace: in place on the same path; a given kind wins", async () => {
    await withApi((navigate) => {
      navigate.replace("?sort=name");
      navigate.replace("/cellars/1/wines/2");
      navigate.replace("/wines/9", { kind: "none" });
      navigate.push("/cellars", { kind: "forward" });
    });
    assert.deepEqual(take(), [
      ["replace", "?sort=name"],
      ["replace", "/cellars/1/wines/2", { transitionTypes: ["nav-forward"] }],
      ["replace", "/wines/9"],
      ["push", "/cellars", { transitionTypes: ["nav-forward"] }],
    ]);
  });

  test("back: the router gets no arguments; the pop is told its kind", async () => {
    await withApi((navigate) => {
      navigate.back();
      assert.equal(takePopKind("/cellars"), "back");
      navigate.back({ kind: "tab" });
      assert.equal(takePopKind("/"), "tab");
    });
    assert.deepEqual(take(), [["back"], ["back"]]);
    // Nothing asked: a browser Back falls back to the nav-history stack.
    window.sessionStorage.setItem(
      "ca:nav-stack",
      JSON.stringify(["/cellars", "/cellars/1"]),
    );
    assert.equal(takePopKind("/cellars"), "back");
    window.sessionStorage.removeItem("ca:nav-stack");
  });

  test("reduced motion: no transition types on any call", async () => {
    reduced = true;
    try {
      await withApi((navigate) => {
        navigate.push("/wines/9");
        navigate.push("/map");
      });
    } finally {
      reduced = false;
    }
    assert.deepEqual(take(), [
      ["push", "/wines/9"],
      ["push", "/map"],
    ]);
  });
});
