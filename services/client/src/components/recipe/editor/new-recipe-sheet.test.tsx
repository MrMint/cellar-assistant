/**
 * F-45 / W3-2: a row in the New recipe sheet that navigates must not have
 * its navigation undone by the sheet's own Back entry. Closing the sheet in
 * the click took the overlay's history entry back off (`history.back()`)
 * before the router had pushed the editor's, so Type closed the sheet and
 * stayed on /recipes.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/recipes" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const pushed: string[] = [];
const router = {
  push: (href: string) => pushed.push(href),
  replace: () => {},
  refresh: () => {},
  back: () => {},
  forward: () => {},
  prefetch: () => {},
};
mock.module("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/recipes",
  useSearchParams: () => new URLSearchParams(),
}));

const React = await import("react");
const { act, useState } = React;
const { createRoot } = await import("react-dom/client");
const { NewRecipeSheet } = await import("./NewRecipeSheet");
const { resetLayers } = await import("@/components/app/overlays/layers");

function Host() {
  const [open, setOpen] = useState(true);
  return <NewRecipeSheet open={open} onOpenChange={setOpen} aiOffered />;
}

describe("New recipe sheet rows navigate", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let backs = 0;
  const realBack = window.history.back.bind(window.history);

  beforeEach(() => {
    resetLayers();
    pushed.length = 0;
    backs = 0;
    window.history.back = () => {
      backs += 1;
      realBack();
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    window.history.back = realBack;
    await act(async () => root.unmount());
    document.body.innerHTML = "";
  });

  for (const name of ["Type", "Paste"]) {
    test(`${name} leaves the sheet's Back entry alone`, async () => {
      await act(async () => root.render(<Host />));
      const link = [...document.querySelectorAll("a")].find(
        (a) => a.textContent === name,
      );
      assert.ok(link, `${name} row is a link`);
      assert.match(link.getAttribute("href") ?? "", /^\/recipes\/new\?from=/);
      const before = backs;
      await act(async () => {
        link.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      });
      assert.equal(backs - before, 0, "the click must not pop history");
    });
  }
});
