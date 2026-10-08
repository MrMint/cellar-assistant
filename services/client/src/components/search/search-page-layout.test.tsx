/**
 * N01, in a DOM: the search box survives typing. The old page rendered the box
 * in two different trees for the landing and the results view, so the first
 * debounced navigation unmounted the input under the user's finger (focus
 * lost, the phone keyboard dismissed). These tests drive the real
 * `SearchPageLayout` and `ClientSearchInterface` through a router stand-in
 * that re-renders the page for each URL inside the caller's transition, the
 * way the App Router does, and check that it is the **same input node**,
 * still focused, with the text intact — plus the push/replace rules and the
 * results skeleton while the next page is pending.
 */

import { mock } from "bun:test";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/search" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Call = ["push" | "replace", string];
const calls: Call[] = [];
let navigateTo: (href: string) => void = () => {};
const router = {
  push: (href: string) => {
    calls.push(["push", href]);
    navigateTo(href);
  },
  replace: (href: string) => {
    calls.push(["replace", href]);
    navigateTo(href);
  },
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

const React = await import("react");
const { act, Suspense, use, useState } = React;
type ReactNode = import("react").ReactNode;
const { createRoot } = await import("react-dom/client");
const { Client, Provider } = await import("urql");
const { searchStateFromParams } = await import("./adapter");
const { SearchPageLayout } = await import("./SearchPageLayout");
const { SearchResultsSkeleton } = await import("./SearchResultsSkeleton");
const { SEARCH_DEBOUNCE_MS } = await import("./search-navigation");

/* -------------------------------------------------------------------------- */
/* A page that streams: results for a query resolve when the test says so.    */
/* -------------------------------------------------------------------------- */

type Deferred = { promise: Promise<void>; resolve: () => void };
const deferredIn = (map: Map<string, Deferred>, key: string): Deferred => {
  let entry = map.get(key);
  if (entry === undefined) {
    let resolve = () => {};
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    entry = { promise, resolve };
    map.set(key, entry);
  }
  return entry;
};
const results = new Map<string, Deferred>();
const resultsFor = (query: string): Deferred => deferredIn(results, query);

/**
 * Gated hrefs: the page's shell has not arrived. The App Router suspends
 * above the page (`use(rsc)` in its layout router) until the shell streams,
 * so the navigation has not committed — the page, `urlQuery` included,
 * still shows the old URL. Ungated hrefs commit at once.
 */
const shells = new Map<string, Deferred>();
function Shell({ href, children }: { href: string; children: ReactNode }) {
  const gate = shells.get(href);
  if (gate !== undefined) use(gate.promise);
  return children;
}

function Results({ query }: { query: string }) {
  use(resultsFor(query).promise);
  return <p data-testid="results">results for {query}</p>;
}

const urql = new Client({ url: "http://test.invalid/graphql", exchanges: [] });

/** The `/search` page for one URL — the page.tsx shape, without the I/O. */
function Page({ href }: { href: string }) {
  const q = new URL(href, "http://localhost").searchParams.get("q");
  const { query, hasActiveSearch } = searchStateFromParams({
    q: q ?? undefined,
  });
  return (
    <SearchPageLayout
      urlQuery={query}
      landing={
        hasActiveSearch
          ? null
          : {
              hero: <h1 data-testid="hero">Good evening</h1>,
              quickLinks: <nav data-testid="quick-links">links</nav>,
            }
      }
    >
      {query === null ? (
        <p data-testid="discovery">discovery</p>
      ) : (
        <Suspense fallback={<SearchResultsSkeleton />}>
          <Results query={query} />
        </Suspense>
      )}
    </SearchPageLayout>
  );
}

function App({ initialHref }: { initialHref: string }) {
  const [href, setHref] = useState(initialHref);
  navigateTo = setHref;
  return (
    <Provider value={urql}>
      <Shell href={href}>
        <Page href={href} />
      </Shell>
    </Provider>
  );
}

/* -------------------------------------------------------------------------- */
/* Driving it                                                                 */
/* -------------------------------------------------------------------------- */

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

const mount = async (href: string) => {
  calls.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<App initialHref={href} />);
  });
};

const unmount = async () => {
  await act(async () => root.unmount());
  container.remove();
};

const input = (): HTMLInputElement => {
  const found = container.querySelector<HTMLInputElement>(
    'input[aria-label="Search your collection"]',
  );
  assert.ok(found, "the search input is rendered");
  return found;
};

const valueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value",
)?.set;

/** What a keystroke does: the native value changes, then `input` fires. */
const typeInto = async (el: HTMLInputElement, value: string) => {
  await act(async () => {
    valueSetter?.call(el, value);
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
};

const pressEnter = async (el: HTMLInputElement) => {
  await act(async () => {
    el.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
};

/** Let the debounce fire and the navigation it starts render. */
const settle = async (ms = SEARCH_DEBOUNCE_MS + 50) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};

const openShell = async (href: string) => {
  await act(async () => {
    deferredIn(shells, href).resolve();
    await deferredIn(shells, href).promise;
  });
};

const resolveResults = async (query: string) => {
  await act(async () => {
    resultsFor(query).resolve();
    await resultsFor(query).promise;
  });
};

const testId = (id: string) => container.querySelector(`[data-testid="${id}"]`);

before(() => {
  results.clear();
});

after(async () => {
  await GlobalRegistrator.unregister();
});

describe("the search box survives typing (N01)", () => {
  test("landing → results: the same input node, still focused, text intact", async () => {
    await mount("/search");
    try {
      const box = input();
      await act(async () => box.focus());
      assert.equal(document.activeElement, box);
      assert.ok(testId("hero"), "the landing view is showing");

      await typeInto(box, "w");
      await settle();
      await resolveResults("w");

      // The view switched under the box…
      assert.equal(testId("hero"), null, "the landing hero is gone");
      assert.equal(testId("results")?.textContent, "results for w");
      // …and the box is the same element, focused, holding what was typed.
      assert.equal(input(), box, "the input was not remounted");
      assert.ok(box.isConnected);
      assert.equal(document.activeElement, box, "focus survived");
      assert.equal(box.value, "w");

      await typeInto(box, "wi");
      await settle();
      await typeInto(box, "wine");
      await settle();
      await resolveResults("wi");
      await resolveResults("wine");

      assert.equal(input(), box);
      assert.equal(document.activeElement, box);
      assert.equal(box.value, "wine");
      // One history entry for the whole typing session.
      assert.deepEqual(calls, [
        ["push", "/search?q=w"],
        ["replace", "/search?q=wi"],
        ["replace", "/search?q=wine"],
      ]);
    } finally {
      await unmount();
    }
  });

  test("typing between debounces never navigates per keystroke", async () => {
    await mount("/search");
    try {
      const box = input();
      await act(async () => box.focus());
      for (const value of ["p", "pi", "pin", "pino", "pinot"]) {
        await typeInto(box, value);
        await settle(SEARCH_DEBOUNCE_MS / 3);
      }
      await settle();
      await resolveResults("pinot");
      assert.deepEqual(calls, [["push", "/search?q=pinot"]]);
      assert.equal(document.activeElement, box);
    } finally {
      await unmount();
    }
  });

  test("a slow push holds the session's typing back, then sends it as one replace", async () => {
    // Over a push that has not landed, a `replace` may discard it (the App
    // Router drops a navigation it is still fetching when the next starts,
    // `app-router-instance.js`: `actionQueue.pending.discarded = true`) and
    // overwrite the entry of the view the session started from; a second
    // `push` may land as a second entry (measured on the UX lane: `?q=wi`,
    // `?q=win`, `?q=wine` each in history). So the box sends neither.
    await resolveResults("merlot");
    deferredIn(shells, "/search?q=z");
    await mount("/search?q=merlot");
    try {
      const box = input();
      await act(async () => box.focus());
      await typeInto(box, "z");
      await settle();
      // `z`'s shell has not arrived when the next pause comes: not landed.
      assert.ok(testId("search-results-skeleton"), "z is still pending");
      await typeInto(box, "zi");
      await settle();
      await typeInto(box, "zin");
      await settle();
      assert.deepEqual(calls, [["push", "/search?q=z"]], "nothing sent");
      assert.equal(box.value, "zin", "the text is the user's meanwhile");
      // `z` lands: what the box holds by then goes as one replace.
      await openShell("/search?q=z");
      await resolveResults("zin");
      assert.equal(testId("results")?.textContent, "results for zin");
      // Landed: from here the session replaces.
      await typeInto(box, "zinfandel");
      await settle();
      await resolveResults("zinfandel");
      assert.deepEqual(calls, [
        ["push", "/search?q=z"],
        ["replace", "/search?q=zin"],
        ["replace", "/search?q=zinfandel"],
      ]);
      assert.equal(testId("results")?.textContent, "results for zinfandel");
      assert.equal(input(), box);
      assert.equal(document.activeElement, box);
      assert.equal(box.value, "zinfandel");
    } finally {
      await unmount();
    }
  });

  test("Enter while the push is in flight lands as soon as the push does", async () => {
    await resolveResults("tempranillo");
    deferredIn(shells, "/search?q=tem");
    await mount("/search");
    try {
      const box = input();
      await act(async () => box.focus());
      await typeInto(box, "tem");
      await settle();
      await typeInto(box, "tempranillo");
      await pressEnter(box);
      assert.deepEqual(calls, [["push", "/search?q=tem"]], "held back");
      await openShell("/search?q=tem");
      assert.deepEqual(calls, [
        ["push", "/search?q=tem"],
        ["replace", "/search?q=tempranillo"],
      ]);
      assert.equal(testId("results")?.textContent, "results for tempranillo");
      // The commit closed the session: the next typing pushes its own entry.
      await typeInto(box, "tempranillo reserva");
      await settle();
      assert.deepEqual(calls.at(-1), [
        "push",
        "/search?q=tempranillo%20reserva",
      ]);
    } finally {
      await unmount();
    }
  });

  test("the results slot shows a skeleton while the next page is pending", async () => {
    await resolveResults("barolo");
    await mount("/search?q=barolo");
    try {
      const box = input();
      await act(async () => box.focus());
      assert.equal(testId("results")?.textContent, "results for barolo");

      await typeInto(box, "beer");
      await settle();

      // `beer` has not streamed in: stale results are replaced by a skeleton.
      assert.ok(testId("search-results-skeleton"), "skeleton while pending");
      assert.equal(testId("results"), null, "the stale results are hidden");
      assert.equal(document.activeElement, box);

      await resolveResults("beer");
      assert.equal(testId("search-results-skeleton"), null);
      assert.equal(testId("results")?.textContent, "results for beer");
      assert.equal(input(), box);
      assert.equal(document.activeElement, box);
    } finally {
      await unmount();
    }
  });

  test("Enter commits at once; the next typing session pushes its own entry", async () => {
    await mount("/search");
    try {
      const box = input();
      await act(async () => box.focus());
      await typeInto(box, "rioja");
      await pressEnter(box);
      // No debounce wait: Enter flushed it.
      assert.deepEqual(calls, [["push", "/search?q=rioja"]]);
      await resolveResults("rioja");

      await typeInto(box, "rioja reserva");
      await settle();
      await resolveResults("rioja reserva");
      assert.deepEqual(calls, [
        ["push", "/search?q=rioja"],
        ["push", "/search?q=rioja%20reserva"],
      ]);
      assert.equal(input(), box);
      assert.equal(document.activeElement, box);
    } finally {
      await unmount();
    }
  });

  test("clear returns to the landing view with focus kept in the box", async () => {
    await resolveResults("malbec");
    await mount("/search?q=malbec");
    try {
      const box = input();
      await act(async () => box.focus());
      const clear = container.querySelector<HTMLButtonElement>(
        'button[aria-label="Clear search"]',
      );
      assert.ok(clear);
      await act(async () => {
        clear.dispatchEvent(
          new window.MouseEvent("mousedown", { bubbles: true }),
        );
        clear.click();
      });
      assert.deepEqual(calls, [["push", "/search"]]);
      assert.ok(testId("hero"), "back on the landing view");
      assert.equal(input(), box);
      assert.equal(box.value, "");
      assert.equal(document.activeElement, box);
    } finally {
      await unmount();
    }
  });

  test("a URL change from outside (Back) updates the box", async () => {
    await resolveResults("syrah");
    await resolveResults("grenache");
    await mount("/search?q=syrah");
    try {
      const box = input();
      assert.equal(box.value, "syrah");
      await act(async () => navigateTo("/search?q=grenache"));
      assert.equal(input(), box);
      assert.equal(box.value, "grenache");
      await act(async () => navigateTo("/search"));
      assert.equal(box.value, "");
      assert.deepEqual(calls, [], "the box navigated nowhere itself");
    } finally {
      await unmount();
    }
  });
});
