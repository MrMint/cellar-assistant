/**
 * `useNavigate` (ux-c M2) is a pass-through in seams: every call reaches
 * Next's router as the same method with the same arguments the call site
 * used to pass it directly, so the codemod that routes every `push`,
 * `replace` and `back` through it changes no behaviour. `kind` is ours and
 * never reaches the router.
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

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { useNavigate } = await import("./useNavigate");
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

  test("is stable across renders, so it is safe in dependency arrays", async () => {
    const { navigate, rerender, unmount } = await mountNavigate();
    assert.equal(await rerender(), navigate);
    await unmount();
  });
});
