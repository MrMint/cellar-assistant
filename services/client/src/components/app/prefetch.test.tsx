/**
 * Prefetch on pointerdown (X24): which anchors count (`prefetchTarget`), and
 * that the shell's one listener hands their path to `router.prefetch` at the
 * pointerdown — before any click — and stops when the shell unmounts.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/cellars" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let prefetched: string[] = [];
const router = {
  push: () => {},
  replace: () => {},
  back: () => {},
  forward: () => {},
  refresh: () => {},
  prefetch: (href: string) => {
    prefetched.push(href);
  },
};
mock.module("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/cellars",
  useSearchParams: () => new URLSearchParams(),
}));

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { prefetchTarget, usePointerDownPrefetch } = await import("./prefetch");

const here = {
  href: "http://localhost/cellars?sort=a",
  origin: "http://localhost",
};

/** An element inside an anchor built from `html`. */
const inside = (html: string): Element => {
  const host = document.createElement("div");
  host.innerHTML = html;
  const target = host.querySelector("[data-target]");
  assert.ok(target, "the fixture marks its target");
  return target;
};

describe("prefetchTarget", () => {
  test("the nearest in-app anchor's path and query", () => {
    assert.equal(
      prefetchTarget(
        inside('<a href="/map"><span data-target>Map</span></a>'),
        here,
      ),
      "/map",
    );
    assert.equal(
      prefetchTarget(
        inside('<a href="/search?q=barolo#top"><svg data-target></svg></a>'),
        here,
      ),
      "/search?q=barolo",
    );
    assert.equal(
      prefetchTarget(inside('<a href="../places/p1" data-target>x</a>'), {
        href: "http://localhost/map/scans",
        origin: "http://localhost",
      }),
      "/places/p1",
    );
  });

  test("not a link, another origin, a download, a new tab, an opt-out", () => {
    assert.equal(
      prefetchTarget(inside("<button data-target>x</button>"), here),
      null,
    );
    assert.equal(
      prefetchTarget(
        inside('<a href="https://maps.google.com/x" data-target>x</a>'),
        here,
      ),
      null,
    );
    assert.equal(
      prefetchTarget(
        inside('<a href="/export.csv" download data-target>x</a>'),
        here,
      ),
      null,
    );
    assert.equal(
      prefetchTarget(
        inside('<a href="/map" target="_blank" data-target>x</a>'),
        here,
      ),
      null,
    );
    assert.equal(
      prefetchTarget(
        inside('<a href="/map" data-prefetch="false" data-target>x</a>'),
        here,
      ),
      null,
    );
    assert.equal(
      prefetchTarget(inside('<a href="mailto:a@b.c" data-target>x</a>'), here),
      null,
    );
    assert.equal(prefetchTarget(null, here), null);
  });

  test("not route handlers, assets, or this very page", () => {
    assert.equal(
      prefetchTarget(
        inside('<a href="/api/auth/sign-out" data-target>x</a>'),
        here,
      ),
      null,
    );
    assert.equal(
      prefetchTarget(
        inside('<a href="/_next/static/x.js" data-target>x</a>'),
        here,
      ),
      null,
    );
    assert.equal(
      prefetchTarget(
        inside('<a href="/cellars?sort=a#later" data-target>x</a>'),
        here,
      ),
      null,
    );
    // Same path, another query: a different page.
    assert.equal(
      prefetchTarget(
        inside('<a href="/cellars?sort=b" data-target>x</a>'),
        here,
      ),
      "/cellars?sort=b",
    );
  });
});

function Shell() {
  usePointerDownPrefetch();
  return (
    <main>
      <a href="/me" id="me">
        <span id="me-label">Me</span>
      </a>
      <button type="button" id="plain">
        nothing
      </button>
    </main>
  );
}

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(async () => {
  prefetched = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Shell />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const pointerDown = (id: string, init: PointerEventInit = {}) => {
  const el = document.getElementById(id);
  assert.ok(el, `#${id}`);
  el.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      isPrimary: true,
      button: 0,
      pointerType: "touch",
      ...init,
    }),
  );
};

describe("usePointerDownPrefetch", () => {
  test("a pointerdown on an in-app link prefetches it, before any click", () => {
    pointerDown("me-label");
    assert.deepEqual(prefetched, ["/me"]);
  });

  test("not for a non-link, a secondary button or a second finger", () => {
    pointerDown("plain");
    pointerDown("me-label", { button: 2, pointerType: "mouse" });
    pointerDown("me-label", { isPrimary: false });
    assert.deepEqual(prefetched, []);
  });

  test("the listener goes with the shell", async () => {
    await act(async () => root.unmount());
    const a = document.createElement("a");
    a.href = "/me";
    document.body.appendChild(a);
    a.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        isPrimary: true,
        button: 0,
      }),
    );
    assert.deepEqual(prefetched, []);
    root = createRoot(container);
  });
});
