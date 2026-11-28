/**
 * The app primitives that need a DOM: sheets and dialogs (portals, focus,
 * Escape), the tab bar and its ＋, the segmented control, the rating
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
const { MAIN_CONTENT_ID } = await import("./main-content");
const { SkipLink } = await import("./SkipLink");
const { MapFilter } = await import("../map/core/MapFilter");
const { TooltipProvider } = await import("../ui/tooltip");

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

  test("back closes the sheet on top, and focus returns to its opener (KIT § 4)", async () => {
    function Opener() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <BottomSheet open={open} onOpenChange={setOpen} title="Actions">
            <p>rows</p>
          </BottomSheet>
        </>
      );
    }
    await render(<Opener />);
    const opener = byText("Open");
    assert.ok(opener);
    opener.focus();
    await click(opener);
    await flush(10);
    assert.ok(document.querySelector('[role="dialog"]'), "the sheet is open");
    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    assert.equal(
      document.querySelector('[role="dialog"]')?.getAttribute("data-state"),
      "closed",
      "back asked the sheet to close",
    );
  });

  test("on desktop, back closes the dialog on top and focus returns to its opener", async () => {
    viewportWidth = 1280;
    function Opener() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <ResponsiveDialog open={open} onOpenChange={setOpen} title="Rename">
            <p>field</p>
          </ResponsiveDialog>
        </>
      );
    }
    await render(<Opener />);
    const opener = byText("Open");
    assert.ok(opener);
    opener.focus();
    await click(opener);
    await flush(10);
    assert.ok(document.querySelector('[role="dialog"]'));
    assert.notEqual(document.activeElement, opener, "focus moved into it");
    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await flush(50);
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, opener, "focus is back on Open");
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

  test("a content-sized sheet is capped at 90dvh or 788 (KIT § 2), through the same variant", async () => {
    await render(
      <BottomSheet open onOpenChange={() => {}} title="Add">
        <p>rows</p>
      </BottomSheet>,
    );
    await flush(10);
    const cls =
      document.querySelector('[data-slot="bottom-sheet"]')?.className ?? "";
    assert.doesNotMatch(cls, /direction=bottom\]:max-h-\[80vh\]/);
    assert.match(cls, /direction=bottom\]:max-h-\[min\(90dvh,788px\)\]/);
  });
});

/*
 * The physics around vaul (B04), driven with pointer events on the sheet.
 * happy-dom does no layout, so these prove the wiring — release decisions,
 * M6 and the stretch — and `sheet-physics.test.ts` proves the numbers.
 */
describe("BottomSheet physics", () => {
  const sheet = () =>
    document.querySelector<HTMLElement>('[data-slot="bottom-sheet"]');
  /**
   * `at` stamps the event's time, so a drag's speed is the test's, not the
   * machine's: under load a real 20 ms wait can take 300 ms, and a flick
   * reads as a slow drag.
   */
  const pointer = (type: string, y: number, at?: number) => {
    const event = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      isPrimary: true,
      pointerId: 1,
      button: 0,
      clientY: y,
    });
    if (at !== undefined)
      Object.defineProperty(event, "timeStamp", { value: at });
    return event;
  };
  /**
   * Past the 500 ms settle: polled, because under a loaded machine (the
   * whole suite at once) timers run late and a fixed wait flakes.
   */
  const settled = async (done: () => boolean, ms = 4000) => {
    const until = Date.now() + ms;
    while (!done() && Date.now() < until) await flush(50);
  };
  /** A quick drag: down, the moves (a frame apart), up. */
  const drag = async (el: HTMLElement, ys: readonly number[]) => {
    const [first, ...rest] = ys;
    const t0 = performance.now();
    let frame = 0;
    const at = () => t0 + 16 * frame++;
    await act(async () => {
      el.dispatchEvent(pointer("pointerdown", first ?? 0, at()));
    });
    for (const y of rest.slice(0, -1)) {
      await act(async () => {
        el.dispatchEvent(pointer("pointermove", y, at()));
        await new Promise((r) => setTimeout(r, 20));
      });
    }
    await act(async () => {
      el.dispatchEvent(pointer("pointerup", rest.at(-1) ?? first ?? 0, at()));
    });
  };
  const Snapping = ({
    onSnap,
    onClose = () => {},
    dismissible,
  }: {
    onSnap: (snap: string) => void;
    onClose?: () => void;
    dismissible?: boolean;
  }) => {
    const [open, setOpen] = useState(true);
    return (
      <BottomSheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) onClose();
        }}
        title="Places"
        snapPoints={["peek", "half", "full"]}
        initialSnap="half"
        onSnapChange={onSnap}
        dismissible={dismissible}
      >
        <p>list</p>
      </BottomSheet>
    );
  };

  // vaul captures the pointer on press; happy-dom has no capture to give.
  HTMLElement.prototype.setPointerCapture ??= () => {};
  HTMLElement.prototype.releasePointerCapture ??= () => {};

  test("M6: a flick up from half settles on full, reported once", async () => {
    const snaps: string[] = [];
    await render(<Snapping onSnap={(s) => snaps.push(s)} />);
    await flush(30);
    const el = sheet();
    assert.ok(el);
    // A browser computes `none`; happy-dom computes nothing, which vaul reads.
    el.style.transform ||= "translate3d(0, 0px, 0)";
    await drag(el, [500, 470, 430, 380]);
    assert.deepEqual(snaps, [], "not before the snap has settled");
    await settled(() => snaps.length > 0);
    assert.deepEqual(snaps, ["full"]);
    await flush(560);
    assert.deepEqual(snaps, ["full"], "once");
  });

  test("M6: the snap it opens at is not a change", async () => {
    const snaps: string[] = [];
    await render(<Snapping onSnap={(s) => snaps.push(s)} />);
    await flush(600);
    assert.deepEqual(snaps, []);
  });

  test("M6: never on close — a hard flick down dismisses without a snap", async () => {
    const snaps: string[] = [];
    let closed = 0;
    await render(
      <Snapping
        onSnap={(s) => snaps.push(s)}
        onClose={() => {
          closed += 1;
        }}
      />,
    );
    await flush(30);
    const el = sheet();
    assert.ok(el);
    // A browser computes `none`; happy-dom computes nothing, which vaul reads.
    el.style.transform ||= "translate3d(0, 0px, 0)";
    await drag(el, [300, 360, 460, 600]);
    await flush(700);
    assert.equal(closed, 1, "the sheet asked to close");
    assert.deepEqual(snaps, []);
  });

  test("a sheet that cannot be dismissed lands on peek instead", async () => {
    const snaps: string[] = [];
    let closed = 0;
    await render(
      <Snapping
        dismissible={false}
        onSnap={(s) => snaps.push(s)}
        onClose={() => {
          closed += 1;
        }}
      />,
    );
    await flush(30);
    const el = sheet();
    assert.ok(el);
    // A browser computes `none`; happy-dom computes nothing, which vaul reads.
    el.style.transform ||= "translate3d(0, 0px, 0)";
    await drag(el, [300, 360, 460, 600]);
    await settled(() => snaps.length > 0);
    assert.equal(closed, 0);
    assert.deepEqual(snaps, ["peek"]);
  });

  test("M6: never for a sheet without snapPoints", async () => {
    const snaps: string[] = [];
    await render(
      <BottomSheet
        open
        onOpenChange={() => {}}
        title="Add"
        onSnapChange={(s) => snaps.push(s)}
      >
        <p>rows</p>
      </BottomSheet>,
    );
    await flush(30);
    const el = sheet();
    assert.ok(el);
    // A browser computes `none`; happy-dom computes nothing, which vaul reads.
    el.style.transform ||= "translate3d(0, 0px, 0)";
    await drag(el, [500, 470, 430, 380]);
    await flush(600);
    assert.deepEqual(snaps, []);
  });

  test("an upward drag on a content-sized sheet stretches it, and it springs back", async () => {
    await render(
      <BottomSheet open onOpenChange={() => {}} title="Add">
        <p>rows</p>
      </BottomSheet>,
    );
    await flush(30);
    const el = sheet();
    assert.ok(el);
    // A browser computes `none`; happy-dom computes nothing, which vaul reads.
    el.style.transform ||= "translate3d(0, 0px, 0)";
    await act(async () => {
      el.dispatchEvent(pointer("pointerdown", 500));
    });
    await act(async () => {
      el.dispatchEvent(pointer("pointermove", 400));
      await new Promise((r) => setTimeout(r, 40));
    });
    const stretched = /^0px (-[\d.]+)px$|^0 (-[\d.]+)px$/.exec(
      el.style.translate,
    );
    assert.ok(stretched, `a negative translate, got "${el.style.translate}"`);
    const px = Number(stretched[1] ?? stretched[2]);
    assert.ok(px > -100 && px < 0, "less than the finger's 100 px");
    await act(async () => {
      el.dispatchEvent(pointer("pointerup", 400));
    });
    await flush(1500);
    assert.equal(el.style.translate, "", "back at rest");
  });
});

describe("MapFilter (L15)", () => {
  const filters = (isMobile: boolean, onRating: (r?: number) => void) => (
    <TooltipProvider>
      <MapFilter
        isMobile={isMobile}
        onItemTypesChange={() => {}}
        onSearchQueryChange={() => {}}
        minRating={4}
        onMinRatingChange={onRating}
        onVisitStatusesChange={() => {}}
      />
    </TooltipProvider>
  );

  test("phone: More filters opens a bottom sheet; Reset is in its footer", async () => {
    const ratings: (number | undefined)[] = [];
    await render(filters(true, (r) => ratings.push(r)));
    const more = container.querySelector('button[aria-label="More filters"]');
    assert.equal(more?.getAttribute("aria-haspopup"), "dialog");
    await click(more);
    await flush(10);
    const sheet = document.querySelector('[data-slot="bottom-sheet"]');
    assert.ok(sheet, "the filters are a BottomSheet");
    assert.equal(
      document.getElementById(sheet.getAttribute("aria-labelledby") ?? "")
        ?.textContent,
      "Filters",
    );
    assert.ok(byText("Minimum Rating", sheet));
    const footer = sheet.querySelector('[data-slot="drawer-footer"]');
    await click(byText("Reset", footer ?? undefined));
    assert.deepEqual(ratings, [undefined]);
  });

  test("from md: the popover, not a sheet", async () => {
    viewportWidth = 1024;
    await render(filters(false, () => {}));
    await click(container.querySelector('button[aria-label="More filters"]'));
    await flush(10);
    assert.equal(document.querySelector('[data-slot="bottom-sheet"]'), null);
    const panel = container.querySelector("#map-advanced-filters");
    assert.ok(panel, "the panel renders in place, beside the button");
    assert.ok(byText("Minimum Rating", panel));
    // Let motion's enter finish: happy-dom rejects a cancelled animation's
    // `finished`, and unmounting mid-enter would surface that as an error.
    await flush(600);
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
  test("an alert dialog; Keep it first, the outlined danger verb confirms", async () => {
    let confirmed = 0;
    const changes: boolean[] = [];
    await render(
      <ConfirmSheet
        cancelLabel="Keep it"
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
    const cancel = buttons.find((b) => b.textContent === "Keep it");
    // KIT § 2: destructive is outlined in danger with the trash glyph, and
    // never first (CROSS-LOT "Delete confirm").
    assert.match(del?.className ?? "", /border-danger/);
    assert.doesNotMatch(del?.className ?? "", /bg-destructive/);
    assert.ok(del?.querySelector("svg"), "the trash glyph");
    assert.ok(
      cancel !== undefined &&
        del !== undefined &&
        buttons.indexOf(cancel) < buttons.indexOf(del),
      "Keep it comes first",
    );
    await click(del);
    assert.equal(confirmed, 1);
    await click(cancel);
    assert.deepEqual(changes, [false]);
  });

  test("pending: both buttons disabled", async () => {
    await render(
      <ConfirmSheet
        cancelLabel="Keep it"
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
      ["Delete", "Keep it"].includes(b.textContent ?? ""),
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

  test("a count is part of the segment's name, a word apart (X04)", async () => {
    await render(
      <SegmentedControl
        aria-label="Status"
        value="in"
        onValueChange={() => {}}
        options={[
          { value: "in", label: "In cellar" },
          { value: "finished", label: "Finished", count: 12 },
        ]}
      />,
    );
    const radios = [...container.querySelectorAll('[role="radio"]')];
    assert.deepEqual(
      radios.map((radio) => radio.textContent),
      ["In cellar", "Finished 12"],
    );
  });
});

describe("TabBar", () => {
  test("the kit's seven: Cellars, Search, Map, Add, Lists, More, Me", async () => {
    pathname = "/cellars/abc";
    await render(<TabBar />);
    const nav = container.querySelector('nav[aria-label="Main"]');
    assert.ok(nav);
    const names = [...nav.querySelectorAll("a, button")].map(
      (el) => el.getAttribute("aria-label") ?? el.textContent,
    );
    assert.deepEqual(names, [
      "Cellars",
      "Search",
      "Map",
      "Add",
      "Lists",
      "More",
      "Me",
    ]);
    assert.deepEqual(
      [...nav.querySelectorAll("[aria-current=page]")].map(
        (a) => a.textContent,
      ),
      ["Cellars"],
    );
  });

  test("Me is the avatar, named with its friend-request badge", async () => {
    const { ShellViewerContext, pendingRequests } = await import(
      "./overlays/ShellViewer"
    );
    const requests = pendingRequests({
      myFriendRequests: {
        __typename: "FriendRequestConnection",
        edges: [
          { node: { id: "r1", status: "PENDING" } },
          { node: { id: "r2", status: "PENDING" } },
          { node: { id: "r3", status: "ACCEPTED" } },
        ],
      },
    } as Parameters<typeof pendingRequests>[0]);
    await render(
      <ShellViewerContext.Provider
        value={{ displayName: "Test User", requests }}
      >
        <TabBar />
      </ShellViewerContext.Provider>,
    );
    const me = container.querySelector('[data-slot="me-tab"]');
    assert.equal(me?.getAttribute("aria-label"), "Me, 2 friend requests");
    assert.equal(me?.getAttribute("href"), "/me");
    assert.equal(
      container.querySelector('[data-slot="me-badge"]')?.textContent,
      "2",
    );
    assert.equal(
      container.querySelector('[data-slot="user-avatar"]')?.textContent,
      "TU",
    );
  });

  test("More opens a sheet of the places with no tab", async () => {
    await render(<TabBar />);
    const more = container.querySelector('[data-slot="more-button"]');
    await click(more);
    await flush();
    assert.equal(more?.getAttribute("aria-expanded"), "true");
    const dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog, "More's sheet");
    assert.ok(byText("Recipes", dialog as ParentNode));
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
      /max-md:mb-\[calc\(-1\*env\(safe-area-inset-bottom\)\)\]/,
    );
    assert.doesNotMatch(bar?.className ?? "", /\bmb-\[/);
    assert.match(bar?.className ?? "", /pb-\[env\(safe-area-inset-bottom\)\]/);
  });

  test("/search keeps the tab bar and its safe-area padding (FR-2, H-65)", async () => {
    pathname = "/search";
    await render(
      <AppShell>
        <p>page</p>
      </AppShell>,
    );
    const shell = container.querySelector('[data-slot="app-shell"]');
    assert.ok(container.querySelector('[data-slot="tab-bar"]'));
    assert.match(shell?.className ?? "", /safe-area-inset-bottom/);
  });

  test("＋ goes straight to the capture surface — no chooser (X06)", async () => {
    await render(<TabBar />);
    const add = container.querySelector('a[aria-label="Add"]');
    assert.equal(add?.getAttribute("href"), "/add");
    assert.equal(add?.getAttribute("aria-haspopup"), null);
    assert.equal(document.querySelector('[role="dialog"]'), null);
  });

  test("the capture surface hides the tab bar, and the shell keeps the inset", async () => {
    pathname = "/add";
    await render(
      <AppShell>
        <p>camera</p>
      </AppShell>,
    );
    assert.equal(container.querySelector('[data-slot="tab-bar"]'), null);
    const shell = container.querySelector('[data-slot="app-shell"]');
    assert.doesNotMatch(shell?.className ?? "", /max-md:mb-/);
  });

  test("re-tap: scroll to top first, then pop to the tab's root", () => {
    const cellar = TABS.find((t) => t.key === "cellars");
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

  test("X10: Search at the landing and the top opens the search sheet", () => {
    const home = TABS.find((t) => t.key === "search");
    assert.ok(home);
    assert.equal(home.href, "/");
    const scroller = { scrollTop: 0, scrollTo: () => {} } as unknown as Element;
    const nav: string[] = [];
    assert.equal(
      handleActiveTabTap(home, "/", (h) => nav.push(h), scroller),
      true,
    );
    assert.deepEqual(nav, ["/search"]);
  });
});

describe("AppShell", () => {
  const press = async (target: Element, key: string) => {
    await act(async () => {
      target.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true }),
      );
    });
  };

  test("keys go to the app element: ? opens Keys, G L goes to Lists, a field keeps its N", async () => {
    pathname = "/cellars";
    await render(
      <AppShell>
        <input aria-label="Name" />
      </AppShell>,
    );
    const main = container.querySelector("main");
    assert.ok(main);
    await press(main, "g");
    await press(main, "l");
    assert.deepEqual(pushes, ["/tier-lists"]);
    const input = container.querySelector("input");
    assert.ok(input);
    await press(input, "n");
    assert.deepEqual(pushes, ["/tier-lists"], "typing is not a key");
    // A key on the document, outside the app element, is not ours.
    await press(document.body, "?");
    assert.equal(document.querySelector('[role="dialog"]'), null);
    await press(main, "?");
    await flush(10);
    const dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog);
    assert.ok(byText("Keys", dialog));
  });

  test("G O opens the More that is showing", async () => {
    pathname = "/cellars";
    await render(<AppShell>page</AppShell>);
    const main = container.querySelector("main");
    assert.ok(main);
    await press(main, "g");
    await press(main, "o");
    await flush(10);
    const dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog);
    assert.ok(byText("Recipes", dialog));
  });

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

  test("X21: the skip link focuses main without a history entry", async () => {
    pathname = "/cellars";
    await render(
      <>
        <SkipLink />
        <AppShell>page</AppShell>
      </>,
    );
    const before = window.history.length;
    const href = window.location.href;
    await click(container.querySelector('[data-slot="skip-link"]'));
    assert.equal(document.activeElement?.id, MAIN_CONTENT_ID);
    // A fragment navigation would add `#main-content` and an entry, and the
    // next Back would only return to this same page.
    assert.equal(window.location.href, href);
    assert.equal(window.history.length, before);
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

  test("over a photo: Back and ⋯ are glass discs, the title is for screen readers", async () => {
    await render(
      <AppBar
        title="Ridge Lytton Springs"
        parent="/cellars"
        tone="photo"
        overflow={[{ label: "Edit", onSelect: () => {} }]}
      />,
    );
    const bar = container.querySelector('[data-slot="app-bar"]');
    assert.equal(bar?.getAttribute("data-tone"), "photo");
    const discs = [
      ...container.querySelectorAll('[data-slot="glass-disc"]'),
    ].map((d) => d.getAttribute("aria-label"));
    assert.deepEqual(discs, ["Back", "More actions"]);
    assert.match(
      container.querySelector("h1")?.parentElement?.className ?? "",
      /sr-only/,
    );
    // F-47: a flex-1 spacer that is not sr-only keeps ⋯ at the right.
    const spacer = container.querySelector("h1")?.parentElement?.parentElement;
    assert.match(spacer?.className ?? "", /flex-1/);
    assert.doesNotMatch(spacer?.className ?? "", /sr-only/);
  });

  test("sticky: the bar shadow comes once the scroller has moved", async () => {
    await render(
      <main data-app-scroller="">
        <AppBar title="Cellars" root sticky />
      </main>,
    );
    const bar = container.querySelector('[data-slot="app-bar"]');
    const scroller = container.querySelector("main");
    assert.ok(bar && scroller);
    assert.match(bar.className, /data-\[stuck\]:shadow-bar/);
    assert.equal(bar.hasAttribute("data-stuck"), false);
    await act(async () => {
      scroller.scrollTop = 40;
      scroller.dispatchEvent(new Event("scroll"));
    });
    assert.equal(bar.hasAttribute("data-stuck"), true);
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
    // The one BottomSheet, so it drags, snaps and stretches like the rest.
    assert.ok(document.querySelector('[data-slot="bottom-sheet"]'));
    const del = [...document.querySelectorAll('[role="dialog"] button')].find(
      (b) => b.textContent === "Delete",
    );
    assert.match(del?.className ?? "", /text-danger/);
    await click(del);
    // The action waits for the sheet to finish closing, so a ConfirmSheet it
    // opens never overlaps the closing sheet (stuck pointer-events on body).
    assert.equal(deleted, 0);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    assert.equal(deleted, 1);
  });

  test("overflow from md is a menu, not a sheet", async () => {
    viewportWidth = 1024;
    await render(
      <AppBar
        title="Barolo"
        overflow={[{ label: "Edit", onSelect: () => {} }]}
      />,
    );
    await flush(10);
    const more = container.querySelector('button[aria-label="More actions"]');
    assert.equal(more?.getAttribute("aria-haspopup"), "menu");
    await click(more);
    await flush(10);
    assert.equal(document.querySelector('[data-slot="bottom-sheet"]'), null);
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

  test("ten named radios; the filled stars are gold (it is the control)", async () => {
    await render(<Harness initial={3} />);
    const radios = [...container.querySelectorAll('input[type="radio"]')];
    assert.equal(radios.length, 10);
    assert.equal(radios[5]?.getAttribute("aria-label"), "3 stars, Good");
    assert.ok((radios[5] as HTMLInputElement).checked);
    assert.match(
      container.querySelector("[data-fraction] svg")?.getAttribute("class") ??
        "",
      /text-gold/,
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
