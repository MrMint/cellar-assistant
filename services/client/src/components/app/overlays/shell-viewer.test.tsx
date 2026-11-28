/**
 * `ShellViewerProvider` sits above every page (AppShell). Its friend-request
 * read answers after mount, often while React is still hydrating the page's
 * streamed `loading.tsx` boundary. A context change at that moment makes React
 * client-render the pending boundary instead of hydrating it, so the server's
 * copy (in a hidden `S:n` div) and the client's copy are both in the DOM
 * (m10-make: two "Make it" links; the F-24 strict duplicates). So the
 * provider's context value must not change when the read answers, while the
 * Me badge still gets the count.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/recipes/r1" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { act, useContext, useState } = React;

/** The MeHub read, answered by hand: `answer()` is the network reply. */
let answer: (data: unknown) => void = () => {};
mock.module("urql", () => ({
  useQuery: () => {
    const [result, setResult] = useState<{ data?: unknown }>({});
    answer = (data) => setResult({ data });
    return [result];
  },
}));

const { createRoot } = await import("react-dom/client");
const { ShellViewerContext, ShellViewerProvider, useShellViewer } =
  await import("./ShellViewer");

const twoPending = {
  myFriendRequests: {
    __typename: "FriendRequestConnection",
    edges: [
      { node: { id: "r1", status: "PENDING" } },
      { node: { id: "r2", status: "PENDING" } },
    ],
  },
};

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("ShellViewerProvider", () => {
  test("the read answering changes no context the page sits under", async () => {
    const seen: unknown[] = [];
    /** Stands in for the page: it re-renders only if the context changes. */
    function Page() {
      seen.push(useContext(ShellViewerContext));
      return null;
    }
    let badge: number | undefined;
    function MeTab() {
      badge = useShellViewer().requests;
      return null;
    }
    await act(async () =>
      root.render(
        <ShellViewerProvider displayName="Test User">
          <Page />
          <MeTab />
        </ShellViewerProvider>,
      ),
    );
    await act(async () => answer(twoPending));

    assert.equal(badge, 2, "the Me badge still gets the count");
    assert.equal(
      new Set(seen).size,
      1,
      "the context value is the same object before and after the read",
    );
    assert.equal(useShellViewerName(seen[0]), "Test User");
  });

  test("tests and the gallery can still pass requests through the context", async () => {
    let viewer: ReturnType<typeof useShellViewer> | undefined;
    function MeTab() {
      viewer = useShellViewer();
      return null;
    }
    await act(async () =>
      root.render(
        <ShellViewerContext.Provider value={{ displayName: "A", requests: 3 }}>
          <MeTab />
        </ShellViewerContext.Provider>,
      ),
    );
    assert.deepEqual(viewer, { displayName: "A", requests: 3 });
  });
});

function useShellViewerName(value: unknown): unknown {
  return (value as { displayName?: string }).displayName;
}
