/**
 * F-102 (H-45): Home's Scan and Photo open `/search?with=scan|photo`, and the
 * search page opens its scan or photo sheet for them, then drops `with` from
 * the URL so Back or a reload doesn't open it again. The sheet itself is
 * stood in (it needs a camera).
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { after, afterEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/search?with=scan" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

const calls: ["push" | "replace", string][] = [];
const router = {
  push: (href: string) => calls.push(["push", href]),
  replace: (href: string) => calls.push(["replace", href]),
  refresh: () => {},
  prefetch: () => {},
  back: () => {},
  forward: () => {},
};
mock.module("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/search",
  useSearchParams: () => new URLSearchParams(),
}));
mock.module("../common/BarcodeScanner", () => ({
  BarcodeScanner: ({ mode }: { mode: string }) => (
    <div data-test-sheet={mode} />
  ),
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { Client, Provider } = await import("urql");
const { SearchPageLayout } = await import("./SearchPageLayout");
const { scanModeFromParam } = await import("./search-navigation");

const urql = new Client({ url: "http://test.invalid/graphql", exchanges: [] });
let container: HTMLElement;
let root: ReturnType<typeof createRoot> | null = null;

const mount = async (openWith: "barcode" | "photo" | null) => {
  calls.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <Provider value={urql}>
        <SearchPageLayout urlQuery={null} landing={null} openWith={openWith}>
          <p>look in</p>
        </SearchPageLayout>
      </Provider>,
    );
    await new Promise((r) => setTimeout(r, 10));
  });
};

after(async () => {
  await GlobalRegistrator.unregister();
});

afterEach(async () => {
  if (root === null) return;
  const mounted = root;
  await act(async () => mounted.unmount());
  root = null;
  container.remove();
});

describe("?with= (F-102)", () => {
  test("Home's links name the sheet to open", () => {
    assert.equal(scanModeFromParam("scan"), "barcode");
    assert.equal(scanModeFromParam("photo"), "photo");
    assert.equal(scanModeFromParam(["photo", "scan"]), "photo");
    assert.equal(scanModeFromParam("x"), null);
    assert.equal(scanModeFromParam(undefined), null);
  });

  test("?with=scan opens the scan sheet and drops with from the URL", async () => {
    await mount("barcode");
    assert.ok(container.querySelector('[data-test-sheet="barcode"]'));
    assert.deepEqual(calls, [["replace", "/search"]]);
  });

  test("?with=photo opens the photo sheet", async () => {
    await mount("photo");
    assert.ok(container.querySelector('[data-test-sheet="photo"]'));
  });

  test("without it, no sheet and no navigation", async () => {
    await mount(null);
    assert.equal(container.querySelector("[data-test-sheet]"), null);
    assert.deepEqual(calls, []);
  });
});
