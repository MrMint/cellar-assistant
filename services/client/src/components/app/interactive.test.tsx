/**
 * The app primitives that need a DOM: sheets and dialogs (portals, focus,
 * Escape), the tab bar and its chooser, the segmented control, the rating
 * input, AppBar's Back, and toasts with Undo. Driven through happy-dom with
 * `next/navigation` stood in for, the way `search-page-layout.test.tsx` does.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/cellars" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let pathname = "/cellars";
const pushes: string[] = [];
let backs = 0;
const router = {
  push: (href: string) => {
    pushes.push(href);
  },
  replace: (href: string) => {
    pushes.push(href);
  },
  back: () => {
    backs += 1;
  },
  forward: () => {},
  refresh: () => {},
  prefetch: () => {},
};
mock.module("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));

/** matchMedia that answers `matches` for min-width queries at or below `width`. */
let viewportWidth = 390;
window.matchMedia = ((query: string) => {
  const min = /min-width:\s*(\d+)px/.exec(query);
  const matches = min !== null && viewportWidth >= Number(min[1]);
  return {
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
}) as typeof window.matchMedia;

const React = await import("react");
const { act, useState } = React;
type ReactNode = import("react").ReactNode;
const { createRoot } = await import("react-dom/client");
const { BottomSheet, vaulSnapPoint } = await import("./BottomSheet");
const { ResponsiveDialog } = await import("./ResponsiveDialog");
const { ConfirmSheet } = await import("./ConfirmSheet");
const { SegmentedControl } = await import("./SegmentedControl");
const { TabBar, handleActiveTabTap } = await import("./TabBar");
const { TABS } = await import("./nav");
const { RatingInput } = await import("./RatingInput");
const { AppBar } = await import("./AppBar");
const { recordNavigation } = await import("./nav-history");
const { Toaster } = await import("./Toaster");
const { dismissNotification, notify, UNDO_TOAST_MS } = await import("./notify");
const { AppShell } = await import("./AppShell");
const { MAIN_CONTENT_ID } = await import("./SkipLink");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

const render = async (node: ReactNode) => {
  await act(async () => root.render(node));
};
const flush = async (ms = 0) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};
const byText = (text: string, scope: ParentNode = document) =>
  [...scope.querySelectorAll<HTMLElement>("*")].find(
    (el) => el.children.length === 0 && el.textContent?.trim() === text,
  );
const click = async (el: Element | null | undefined) => {
  assert.ok(el, "element to click exists");
  await act(async () => {
    (el as HTMLElement).click();
  });
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  pathname = "/cellars";
  pushes.length = 0;
  backs = 0;
  viewportWidth = 390;
  window.sessionStorage.clear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

describe("BottomSheet", () => {
  test("open: a named dialog in a portal; Escape asks to close", async () => {
    const changes: boolean[] = [];
    await render(
      <BottomSheet
        open
        onOpenChange={(o) => changes.push(o)}
        title="Finished it?"
        description="Mark the bottle empty."
      >
        <p>sheet body</p>
      </BottomSheet>,
    );
    await flush(10);
    const dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog, "a dialog is rendered");
    assert.ok(!container.contains(dialog), "it is portalled out of the tree");
    const labelledBy = dialog.getAttribute("aria-labelledby") ?? "";
    assert.equal(
      document.getElementById(labelledBy)?.textContent,
      "Finished it?",
    );
    assert.ok(byText("sheet body"));
    assert.equal(dialog.getAttribute("data-slot"), "bottom-sheet");
    await act(async () => {
      dialog.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    assert.deepEqual(changes, [false]);
  });

  test("closed: nothing rendered", async () => {
    await render(
      <BottomSheet open={false} onOpenChange={() => {}} title="Hidden">
        <p>never</p>
      </BottomSheet>,
    );
    assert.equal(document.querySelector('[role="dialog"]'), null);
  });

  test("hideTitle keeps the name but not the visible heading", async () => {
    await render(
      <BottomSheet open onOpenChange={() => {}} title="Actions" hideTitle>
        <p>x</p>
      </BottomSheet>,
    );
    await flush(10);
    const header = document.querySelector('[data-slot="drawer-header"]');
    assert.match(header?.className ?? "", /sr-only/);
  });
});

describe("BottomSheet snaps", () => {
  test("vaul's fractions put the visible heights where the names say", () => {
    // vaul measures from the fully open drawer, which is `full` (94dvh) tall.
    assert.equal(vaulSnapPoint("full"), 1);
    assert.equal(vaulSnapPoint("half"), 0.61);
    assert.equal(vaulSnapPoint("peek"), 0.36);
  });

  test("a snapping sheet is 94dvh tall, not capped at ui/drawer's 80vh", async () => {
    await render(
      <BottomSheet
        open
        onOpenChange={() => {}}
        title="Places"
        snapPoints={["peek", "half", "full"]}
        initialSnap="half"
      >
        <p>list</p>
      </BottomSheet>,
    );
    await flush(10);
    const cls =
      document.querySelector('[data-slot="bottom-sheet"]')?.className ?? "";
    assert.doesNotMatch(cls, /direction=bottom\]:max-h-\[80vh\]/);
    assert.match(cls, /h-\[94dvh\]/);
    assert.match(cls, /direction=bottom\]:max-h-\[94dvh\]/);
  });

  test("a content-sized sheet is capped at 90dvh, through the same variant", async () => {
    await render(
      <BottomSheet open onOpenChange={() => {}} title="Add">
        <p>rows</p>
      </BottomSheet>,
    );
    await flush(10);
    const cls =
      document.querySelector('[data-slot="bottom-sheet"]')?.className ?? "";
    assert.doesNotMatch(cls, /direction=bottom\]:max-h-\[80vh\]/);
    assert.match(cls, /direction=bottom\]:max-h-\[90dvh\]/);
  });
});

describe("ResponsiveDialog", () => {
  test("a bottom sheet on a phone", async () => {
    viewportWidth = 390;
    await render(
      <ResponsiveDialog open onOpenChange={() => {}} title="Share">
        <p>body</p>
      </ResponsiveDialog>,
    );
    await flush(10);
    assert.ok(document.querySelector('[data-slot="bottom-sheet"]'));
  });

  test("a centred dialog from md (900 px) up", async () => {
    viewportWidth = 1024;
    await render(
      <ResponsiveDialog open onOpenChange={() => {}} title="Share">
        <p>body</p>
      </ResponsiveDialog>,
    );
    await flush(10);
    assert.equal(document.querySelector('[data-slot="bottom-sheet"]'), null);
    assert.ok(document.querySelector('[data-slot="dialog-content"]'));
  });
});

describe("ConfirmSheet", () => {
  test("an alert dialog; the danger button confirms, Cancel closes", async () => {
    let confirmed = 0;
    const changes: boolean[] = [];
    await render(
      <ConfirmSheet
        open
        onOpenChange={(o) => changes.push(o)}
        title="Delete this cellar?"
        description="Its bottles go with it."
        confirmLabel="Delete"
        onConfirm={() => {
          confirmed += 1;
        }}
      />,
    );
    await flush(10);
    // On a phone too, where it is a sheet, not only as the desktop dialog.
    assert.ok(document.querySelector('[role="alertdialog"]'));
    assert.equal(document.querySelector('[role="dialog"]'), null);
    const buttons = [...document.querySelectorAll("button")];
    const del = buttons.find((b) => b.textContent === "Delete");
    const cancel = buttons.find((b) => b.textContent === "Cancel");
    assert.match(del?.className ?? "", /bg-destructive/);
    await click(del);
    assert.equal(confirmed, 1);
    await click(cancel);
    assert.deepEqual(changes, [false]);
  });

  test("pending: both buttons disabled", async () => {
    await render(
      <ConfirmSheet
        open
        onOpenChange={() => {}}
        title="Delete?"
        confirmLabel="Delete"
        onConfirm={() => {}}
        pending
      />,
    );
    await flush(10);
    const buttons = [...document.querySelectorAll("button")].filter((b) =>
      ["Delete", "Cancel"].includes(b.textContent ?? ""),
    );
    assert.equal(buttons.length, 2);
    assert.ok(buttons.every((b) => b.disabled));
  });
});

describe("SegmentedControl", () => {
  function Harness() {
    const [value, setValue] = useState<"all" | "open" | "finished">("all");
    return (
      <>
        <SegmentedControl
          aria-label="Show"
          value={value}
          onValueChange={setValue}
          options={[
            { value: "all", label: "All" },
            { value: "open", label: "Open" },
            { value: "finished", label: "Finished" },
          ]}
        />
        <output>{value}</output>
      </>
    );
  }

  test("radio semantics; a tap selects; the current one cannot be tapped off", async () => {
    await render(<Harness />);
    const group = container.querySelector('[aria-label="Show"]');
    assert.equal(group?.getAttribute("role"), "radiogroup");
    const radios = [...container.querySelectorAll('[role="radio"]')];
    assert.equal(radios.length, 3);
    assert.equal(radios[0]?.getAttribute("aria-checked"), "true");
    await click(radios[1]);
    assert.equal(container.querySelector("output")?.textContent, "open");
    assert.equal(radios[1]?.getAttribute("aria-checked"), "true");
    await click(radios[1]);
    assert.equal(
      container.querySelector("output")?.textContent,
      "open",
      "still selected",
    );
  });
});

describe("TabBar", () => {
  test("five labelled entries; the route's tab is the current page", async () => {
    pathname = "/cellars/abc";
    await render(<TabBar />);
    const nav = container.querySelector('nav[aria-label="Main"]');
    assert.ok(nav);
    const links = [...nav.querySelectorAll("a")];
    assert.deepEqual(
      links.map((a) => a.textContent),
      ["Home", "Cellar", "Map", "Me"],
    );
    const add = nav.querySelector('button[aria-label="Add"]');
    assert.ok(add, "the capture button");
    assert.deepEqual(
      [...nav.querySelectorAll("[aria-current=page]")].map(
        (a) => a.textContent,
      ),
      ["Cellar"],
    );
  });

  test("a tapped tab lights at once, before the route changes", async () => {
    await render(<TabBar />);
    const map = [...container.querySelectorAll("a")].find(
      (a) => a.textContent === "Map",
    );
    await act(async () => {
      map?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    assert.equal(map?.getAttribute("aria-current"), "page");
  });

  test("a modifier-click (new tab) does not light the tab here", async () => {
    await render(<TabBar />);
    const map = [...container.querySelectorAll("a")].find(
      (a) => a.textContent === "Map",
    );
    await act(async () => {
      map?.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          metaKey: true,
        }),
      );
    });
    assert.equal(map?.getAttribute("aria-current"), null);
  });

  test("the bar pads the home indicator; the shell, not the bar, reclaims it", async () => {
    await render(
      <AppShell>
        <p>page</p>
      </AppShell>,
    );
    const shell = container.querySelector('[data-slot="app-shell"]');
    const bar = container.querySelector('[data-slot="tab-bar"]');
    // The shell clips (overflow-hidden), so a negative margin on the bar
    // would be cut off at the shell's bottom edge.
    assert.match(shell?.className ?? "", /overflow-hidden/);
    assert.match(
      shell?.className ?? "",
      /max-sm:mb-\[calc\(-1\*env\(safe-area-inset-bottom\)\)\]/,
    );
    assert.doesNotMatch(bar?.className ?? "", /\bmb-\[/);
    assert.match(bar?.className ?? "", /pb-\[env\(safe-area-inset-bottom\)\]/);
  });

  test("＋ opens the chooser: Bottle · Menu · Recipe · Place", async () => {
    await render(<TabBar />);
    await click(container.querySelector('button[aria-label="Add"]'));
    await flush(10);
    const dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog);
    const labels = [...dialog.querySelectorAll("a")].map((a) => a.textContent);
    assert.deepEqual(labels, ["Bottle", "Menu", "Recipe", "Place"]);
  });

  test("re-tap: scroll to top first, then pop to the tab's root", () => {
    const cellar = TABS.find((t) => t.key === "cellar");
    assert.ok(cellar);
    const scrolled: number[] = [];
    const scroller = {
      scrollTop: 300,
      scrollTo: ({ top }: { top: number }) => scrolled.push(top),
    } as unknown as Element;
    const nav: string[] = [];
    assert.equal(
      handleActiveTabTap(cellar, "/cellars/1", (h) => nav.push(h), scroller),
      true,
    );
    assert.deepEqual(scrolled, [0]);
    assert.deepEqual(nav, []);
    (scroller as unknown as { scrollTop: number }).scrollTop = 0;
    handleActiveTabTap(cellar, "/cellars/1", (h) => nav.push(h), scroller);
    assert.deepEqual(nav, ["/cellars"]);
    assert.equal(
      handleActiveTabTap(cellar, "/cellars", (h) => nav.push(h), scroller),
      false,
      "at the root and the top: nothing to do",
    );
  });
});

describe("AppShell", () => {
  test("rail, scroller and tab bar; the scroller is the one main", async () => {
    pathname = "/cellars";
    await render(
      <AppShell>
        <p>page</p>
      </AppShell>,
    );
    assert.equal(container.querySelectorAll("main").length, 1);
    const main = container.querySelector("main");
    assert.ok(main?.hasAttribute("data-app-scroller"));
    assert.match(main?.className ?? "", /overflow-y-auto/);
    assert.ok(container.querySelector('[data-slot="side-rail"]'));
    assert.ok(container.querySelector('[data-slot="tab-bar"]'));
  });

  test("X21: the main is the skip link's target, and the navs are named", async () => {
    pathname = "/cellars";
    await render(<AppShell>page</AppShell>);
    const main = container.querySelector("main");
    assert.equal(main?.id, MAIN_CONTENT_ID);
    // Focusable by script only, so following the skip link lands focus in it.
    assert.equal(main?.getAttribute("tabindex"), "-1");
    const navs = [...container.querySelectorAll("nav")];
    assert.ok(navs.length >= 2);
    for (const nav of navs)
      assert.equal(nav.getAttribute("aria-label"), "Main");
  });

  test("records in-app history for AppBar's Back", async () => {
    pathname = "/cellars";
    await render(<AppShell>a</AppShell>);
    pathname = "/cellars/1";
    await render(<AppShell>b</AppShell>);
    assert.equal(
      window.sessionStorage.getItem("ca:nav-stack"),
      JSON.stringify(["/cellars", "/cellars/1"]),
    );
  });
});

describe("AppBar", () => {
  test("cold open of a deep link: Back goes to the parent", async () => {
    await render(<AppBar title="Barolo" parent="/cellars/1" />);
    await click(container.querySelector('button[aria-label="Back"]'));
    assert.deepEqual(pushes, ["/cellars/1"]);
    assert.equal(backs, 0);
    assert.equal(container.querySelector("h1")?.textContent, "Barolo");
  });

  test("with an in-app page behind: Back is history back", async () => {
    recordNavigation("/cellars");
    recordNavigation("/cellars/1");
    await render(<AppBar title="Barolo" parent="/cellars" />);
    await click(container.querySelector('button[aria-label="Back"]'));
    assert.equal(backs, 1);
    assert.deepEqual(pushes, []);
  });

  test("no parent, but history: Back appears after mount", async () => {
    recordNavigation("/search");
    recordNavigation("/brands/1");
    await render(<AppBar title="Brand" />);
    await click(container.querySelector('button[aria-label="Back"]'));
    assert.equal(backs, 1);
  });

  test("the browser's real history vetoes the stack (router.replace)", async () => {
    // A cold-opened form replaced itself with its result: the stack holds
    // two pages, the browser one. Back must not call router.back().
    recordNavigation("/cellars/1/add");
    recordNavigation("/wines/9");
    const w = window as { navigation?: unknown };
    w.navigation = { canGoBack: false };
    try {
      await render(<AppBar title="Barolo" parent="/cellars/1" />);
      await click(container.querySelector('button[aria-label="Back"]'));
      assert.equal(backs, 0);
      assert.deepEqual(pushes, ["/cellars/1"]);
    } finally {
      delete w.navigation;
    }
  });

  test("a tab root draws no Back even with in-app history", async () => {
    recordNavigation("/search");
    recordNavigation("/cellars");
    await render(<AppBar title="Cellars" root />);
    assert.equal(container.querySelector('button[aria-label="Back"]'), null);
  });

  test("a tab root with no history draws no Back", async () => {
    await render(<AppBar title="Cellars" />);
    assert.equal(container.querySelector('button[aria-label="Back"]'), null);
  });

  test("overflow on a phone is an action sheet, Delete in danger text", async () => {
    let deleted = 0;
    await render(
      <AppBar
        title="Barolo"
        overflow={[
          { label: "Edit", onSelect: () => {} },
          {
            label: "Delete",
            destructive: true,
            onSelect: () => {
              deleted += 1;
            },
          },
        ]}
      />,
    );
    await click(container.querySelector('button[aria-label="More actions"]'));
    await flush(10);
    const del = [...document.querySelectorAll('[role="dialog"] button')].find(
      (b) => b.textContent === "Delete",
    );
    assert.match(del?.className ?? "", /text-destructive/);
    await click(del);
    // The action waits for the sheet to finish closing, so a ConfirmSheet it
    // opens never overlaps the closing sheet (stuck pointer-events on body).
    assert.equal(deleted, 0);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    assert.equal(deleted, 1);
  });
});

describe("RatingInput", () => {
  function Harness({ initial }: { initial: number | null }) {
    const [value, setValue] = useState<number | null>(initial);
    return (
      <>
        <RatingInput
          value={value}
          onChange={setValue}
          onClear={() => setValue(null)}
        />
        <output>{value ?? "none"}</output>
      </>
    );
  }
  const out = () => container.querySelector("output")?.textContent;

  test("tap a star for that many; tap it again for the half", async () => {
    await render(<Harness initial={null} />);
    const star4 = container.querySelector('[data-star="4"]');
    await click(star4);
    assert.equal(out(), "4");
    await click(star4);
    assert.equal(out(), "3.5");
  });

  test("arrow keys step by halves and clamp", async () => {
    await render(<Harness initial={5} />);
    const group = container.querySelector('[role="radiogroup"]');
    await act(async () => {
      group?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });
    assert.equal(out(), "5");
    await act(async () => {
      group?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
      );
    });
    assert.equal(out(), "4.5");
  });

  test("ten named radios; the filled stars are brass (it is the control)", async () => {
    await render(<Harness initial={3} />);
    const radios = [...container.querySelectorAll('input[type="radio"]')];
    assert.equal(radios.length, 10);
    assert.equal(radios[5]?.getAttribute("aria-label"), "3 stars, Good");
    assert.ok((radios[5] as HTMLInputElement).checked);
    assert.match(
      container.querySelector("[data-fraction] svg")?.getAttribute("class") ??
        "",
      /text-primary/,
    );
  });

  test("Clear rating resets", async () => {
    await render(<Harness initial={2} />);
    const clear = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Clear rating",
    );
    await click(clear);
    assert.equal(out(), "none");
  });
});

describe("notify + Toaster", () => {
  test("a toast with Undo, above the tab bar, for five seconds", async () => {
    let undone = 0;
    await render(<Toaster />);
    await act(async () => {
      notify("Removed from Garage", {
        undo: () => {
          undone += 1;
        },
      });
    });
    await flush(50);
    assert.ok(byText("Removed from Garage"), "the toast is shown");
    const undo = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Undo",
    );
    assert.ok(undo, "with an Undo action");
    await click(undo);
    assert.equal(undone, 1);
    const list = document.querySelector("[data-sonner-toaster]");
    assert.match(
      list?.getAttribute("style") ?? "",
      /--offset-bottom:\s*calc\(var\(--ca-tabbar-h\)/,
    );
    assert.equal(UNDO_TOAST_MS, 5000);
  });

  test("one toast through phases: kept on its action, loading, then gone", async () => {
    let retried = 0;
    await render(<Toaster />);
    await act(async () => {
      notify("Couldn't put it back", {
        id: "phases",
        tone: "error",
        undo: () => {
          retried += 1;
        },
        actionLabel: "Try again",
        keepOnAction: true,
      });
    });
    await flush(50);
    const again = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Try again",
    );
    assert.ok(again, "the action carries its own label");
    await click(again);
    await flush(50);
    assert.equal(retried, 1);
    assert.ok(byText("Couldn't put it back"), "kept up after its action");

    await act(async () => {
      notify("Putting it back…", { id: "phases", tone: "loading" });
    });
    await flush(50);
    assert.ok(byText("Putting it back…"), "updated in place");
    assert.equal(
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent === "Try again",
      ),
      false,
      "an update without undo drops the earlier action",
    );

    await act(async () => dismissNotification("phases"));
    await flush(50);
    const left = byText("Putting it back…")?.closest("[data-sonner-toast]");
    // Gone, or on its way out (Sonner unmounts after its exit animation).
    assert.ok(
      left === undefined || left?.getAttribute("data-removed") === "true",
      "dismissed",
    );
  });
});
