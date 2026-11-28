/**
 * W-8 / H-23: the cellar grid card's title morphs into the bottle page's
 * heading. React itself runs here (happy-dom, a stubbed
 * `document.startViewTransition`), so the test sees which elements React
 * names when it starts the transition — the same thing the lane probe read.
 *
 * Not under `act`: React's act path commits without the pass that pairs a
 * deleted named `<ViewTransition>` with an inserted one, so nothing would
 * ever be named. The renders are awaited on timers instead.
 *
 * The defect: the cellar page draws a bottle more than once (the "Open now"
 * and "Recently added" shelves above the grid are the same `BottleCard`,
 * with the same href and so the same morph name), and React pairs the page's
 * heading with the first in-viewport copy it meets in the old tree — not the
 * one that was tapped.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/cellars/c1/items" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = false;

let currentPath = "/cellars/c1/items";
mock.module("next/navigation", () => ({
  usePathname: () => currentPath,
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

type Named = { name: string; el: HTMLElement };
type Call = { before: Named[]; after: Named[]; types: string[] };
const calls: Call[] = [];
const named = (): Named[] =>
  Array.from(document.querySelectorAll<HTMLElement>("*"))
    .map((el) => ({ name: el.style.viewTransitionName, el }))
    .filter(({ name }) => name !== "" && name !== undefined);
const titles = (list: Named[]) =>
  list.filter(({ name }) => name.startsWith("title"));

const doc = document as unknown as Record<string, unknown>;
doc.startViewTransition = (opts: {
  update: () => unknown;
  types?: string[];
}) => {
  const call: Call = { before: named(), after: [], types: opts.types ?? [] };
  calls.push(call);
  const done = Promise.resolve().then(async () => {
    await opts.update();
    call.after = named();
  });
  return {
    ready: done,
    finished: done,
    updateCallbackDone: done,
    skipTransition: () => {},
    types: new Set(opts.types ?? []),
  };
};
if (!("fonts" in document)) {
  doc.fonts = { status: "loaded", ready: Promise.resolve() };
}
const root = document.documentElement as unknown as Record<string, unknown>;
if (typeof root.getAnimations !== "function") root.getAnimations = () => [];

const { NextImageConfig, nextImageModule } = await import(
  "../../test-support/next-image"
);
mock.module("next/image", () => nextImageModule("art"));
// The heart needs an urql client; it is beside the point here.
mock.module("@/components/item/LoveButton", () => ({
  LoveButton: () => <button type="button">Love</button>,
}));

const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { BottleCard } = await import("@/components/cellar/BottleCard");
const { ItemHero } = await import("@/components/item/ItemHero");
const { armMorph, MorphTitle, RouteTransition } = await import(
  "./RouteTransition"
);

const HREF = "/cellars/c1/wines/b1";
const cell = {
  type: "WINE",
  item: {
    id: "b1",
    itemId: "item-1",
    name: "Barolo",
    vintage: "2016",
    plate: { producer: "Vietti", name: "Barolo", vintage: "2016" },
    favoriteCount: 0,
    reviewCount: 0,
  },
  bottle: { openAt: null, emptyAt: null, percentageRemaining: 100 },
} as never;
const NOW = Date.parse("2026-10-08T12:00:00.000Z");

/** The cellar page: a shelf copy of the bottle above its grid copy. */
function CellarPage() {
  return (
    <NextImageConfig>
      <section data-slot="recent-shelf">
        <BottleCard cell={cell} href={HREF} now={NOW} />
      </section>
      <section data-slot="grid">
        <BottleCard cell={cell} href={HREF} now={NOW} />
      </section>
    </NextImageConfig>
  );
}

/** The bottle page's hero. */
function BottlePage() {
  return (
    <ItemHero
      itemId="item-1"
      type="WINE"
      name="Barolo"
      isFavorite={false}
      producer={null}
      subtitle={[]}
      picture={<div />}
    />
  );
}

/** The tier-list card's shape: the morph is a span inside the link. */
function ListsPage() {
  return (
    <h3>
      <a href="/tier-lists/t1" className="after:absolute after:inset-0">
        <MorphTitle href="/tier-lists/t1">
          <span className="block">Best Bars</span>
        </MorphTitle>
      </a>
    </h3>
  );
}
function ListPage() {
  return (
    <MorphTitle>
      <h1>Best Bars</h1>
    </MorphTitle>
  );
}

const PAGES = {
  cellar: { path: "/cellars/c1/items", Page: CellarPage },
  bottle: { path: HREF, Page: BottlePage },
  lists: { path: "/tier-lists", Page: ListsPage },
  list: { path: "/tier-lists/t1", Page: ListPage },
} as const;
type PageKey = keyof typeof PAGES;

const tick = () => new Promise((resolve) => setTimeout(resolve, 30));

async function mount(start: PageKey) {
  calls.length = 0;
  currentPath = PAGES[start].path;
  const host = document.createElement("div");
  document.body.append(host);
  const reactRoot = createRoot(host);
  let go: (page: PageKey) => void = () => {};
  function App() {
    const [page, setPage] = React.useState<PageKey>(start);
    go = setPage;
    const { Page } = PAGES[page];
    return (
      <RouteTransition>
        <main>
          <Page />
        </main>
      </RouteTransition>
    );
  }
  reactRoot.render(<App />);
  await tick();
  const navigate = async (to: PageKey, type: string) => {
    React.startTransition(() => {
      React.addTransitionType(type);
      currentPath = PAGES[to].path;
      go(to);
    });
    await tick();
    await tick();
    return calls.at(-1);
  };
  const unmount = () => {
    reactRoot.unmount();
    host.remove();
  };
  return { host, navigate, unmount };
}

const press = (el: Element) =>
  el.dispatchEvent(new Event("pointerdown", { bubbles: true }));

afterEach(() => {
  armMorph(null);
});

describe("title morph: the tapped card pairs with the page heading (W-8)", () => {
  test("a grid card tapped under a shelf copy of the same bottle is the one named", async () => {
    const { host, navigate, unmount } = await mount("cellar");
    const gridLink = host.querySelector(`[data-slot=grid] a[href="${HREF}"]`);
    assert.ok(gridLink, "the grid card's title link renders");
    press(gridLink);
    await tick();
    const call = await navigate("bottle", "nav-forward");
    assert.ok(call, "the navigation started a view transition");
    const old = titles(call.before);
    assert.equal(old.length, 1, "exactly one old element carries the title");
    assert.equal(old[0]?.name, "title_cellars_c1_wines_b1");
    assert.equal(
      old[0]?.el,
      gridLink,
      "the tapped grid card, not the shelf copy above it",
    );
    assert.deepEqual(
      titles(call.after).map(({ name, el }) => [name, el.tagName]),
      [["title_cellars_c1_wines_b1", "H1"]],
    );
    unmount();
  });

  test("every card title carries the id a press arms", async () => {
    const { host, unmount } = await mount("cellar");
    const links = host.querySelectorAll(`a[href="${HREF}"]`);
    assert.equal(links.length, 2);
    for (const link of links) {
      assert.ok(link.hasAttribute("data-morph-id"));
    }
    unmount();
  });

  test("the tier-list card (a span inside the link) still morphs", async () => {
    const { host, navigate, unmount } = await mount("lists");
    const link = host.querySelector('a[href="/tier-lists/t1"]');
    assert.ok(link);
    press(link);
    await tick();
    const call = await navigate("list", "nav-forward");
    assert.ok(call);
    assert.deepEqual(
      titles(call.before).map(({ name, el }) => [name, el.tagName]),
      [["title_tier-lists_t1", "SPAN"]],
    );
    assert.deepEqual(
      titles(call.after).map(({ name, el }) => [name, el.tagName]),
      [["title_tier-lists_t1", "H1"]],
    );
    unmount();
  });

  test("Back from the bottle page lands the heading on the card that was tapped", async () => {
    const { host, navigate, unmount } = await mount("cellar");
    const gridLink = host.querySelector(`[data-slot=grid] a[href="${HREF}"]`);
    assert.ok(gridLink);
    press(gridLink);
    await tick();
    await navigate("bottle", "nav-forward");
    const back = await navigate("cellar", "nav-back");
    assert.ok(back);
    assert.deepEqual(
      titles(back.before).map(({ name, el }) => [name, el.tagName]),
      [["title_cellars_c1_wines_b1", "H1"]],
    );
    const landed = titles(back.after);
    assert.equal(landed.length, 1);
    assert.ok(
      landed[0]?.el.closest("[data-slot=grid]"),
      "the grid copy, the one the viewer left from",
    );
    unmount();
  });
});
