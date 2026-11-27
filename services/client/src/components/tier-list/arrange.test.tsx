/**
 * X23 / D4 in a DOM: Arrange replaces the padlock, a removal lands at once
 * with Undo in its toast, and the Arrange bar's Undo / Redo step the list's
 * server-side history and say what they did. The server is stood in for at
 * `useTierListActions`; the board is the real one (dnd-kit included).
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/tier-lists/tl-1" });
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

type Toast = {
  message: string;
  options?: { undo?: () => void; actionLabel?: string; tone?: string };
};
const toasts: Toast[] = [];
const calls: string[] = [];

/** What the next `requestInsightsAction` answers (the panel tests set it). */
let insightsAnswer:
  | { success: true; status: string }
  | {
      success: false;
      failure: { code: string; reason: string | null; retryAt: string | null };
    } = { success: true, status: "PENDING" };

const edit = {
  seq: 7,
  kind: "MOVE" as const,
  entryName: "Barolo",
  fromBand: 0,
  toBand: 5,
};

mock.module("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => calls.push("refresh"),
    replace: () => {},
    push: () => {},
  }),
  usePathname: () => "/tier-lists/tl-1",
  useSearchParams: () => new URLSearchParams(),
}));
mock.module("nuqs", () => ({
  parseAsStringLiteral: () => ({ withDefault: (value: string) => value }),
  useQueryState: (key: string) => [key === "tab" ? "rankings" : null, () => {}],
}));
mock.module("@/components/app/notify", () => ({
  notify: (message: string, options?: Toast["options"]) => {
    toasts.push({ message, options });
    return message;
  },
  dismissNotification: () => {},
  UNDO_TOAST_MS: 5000,
}));
mock.module("@/components/tier-list/actions", () => ({
  isValidListType: () => true,
  useTierListActions: () => ({
    removeItemFromTierListAction: async (id: string) => {
      calls.push(`remove ${id}`);
      return { success: true };
    },
    reorderBandAction: async (
      call: { band: number; orderedIds: string[] },
      id: string,
    ) => {
      calls.push(`reorder ${id} ${call.band} ${call.orderedIds.join(",")}`);
      return { success: true };
    },
    requestInsightsAction: async (id: string) => {
      calls.push(`insights ${id}`);
      return insightsAnswer;
    },
    addItemToTierListAction: async () => ({ success: true }),
    undoAction: async (id: string, expectedSeq: number) => {
      calls.push(`undo ${id} #${expectedSeq}`);
      return {
        success: true,
        applied: edit,
        history: { canUndo: false, canRedo: true, undo: null, redo: edit },
      };
    },
    redoAction: async (id: string, expectedSeq: number) => {
      calls.push(`redo ${id} #${expectedSeq}`);
      return {
        success: true,
        applied: edit,
        history: { canUndo: true, canRedo: false, undo: edit, redo: null },
      };
    },
  }),
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { Client, Provider } = await import("urql");
const { TooltipProvider } = await import("@/components/ui/tooltip");
const { TierListViewPage } = await import("./TierListViewPage");
const { TierListInsightsPanel } = await import(
  "./insights/TierListInsightsPanel"
);

const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [],
});

const items = ["Barolo", "Rioja", "Chianti"].map((name, i) => ({
  id: `row-${i}`,
  band: i === 0 ? 5 : 3,
  position: i === 0 ? 0 : i - 1,
  name,
  subtitle: "",
  href: `/wines/w-${i}`,
  ownerScore: null,
  viewerScore: null,
  publicRating: null,
  publicRatingCount: null,
}));

const data = {
  id: "tl-1",
  name: "Reds",
  description: null,
  privacy: "PRIVATE",
  listType: "wine",
  isOwner: true,
  itemCount: items.length,
  items,
  history: { canUndo: true, canRedo: false, undo: edit, redo: null },
};
const insights = {
  items: [],
  aiInsights: null,
  contentUpdatedAt: null,
  showPlaceStats: false,
};

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  toasts.length = 0;
  calls.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const render = async (pageData: typeof data = data) => {
  await act(async () =>
    root.render(
      <Provider value={client}>
        <TooltipProvider>
          <TierListViewPage data={pageData} insightsData={insights} />
        </TooltipProvider>
      </Provider>,
    ),
  );
};

const button = (name: string | RegExp): HTMLButtonElement => {
  const found = [...document.querySelectorAll("button")].find((el) => {
    const label = el.getAttribute("aria-label") ?? el.textContent ?? "";
    return typeof name === "string" ? label.trim() === name : name.test(label);
  });
  if (found === undefined) throw new Error(`no button ${String(name)}`);
  return found;
};

const click = async (el: HTMLElement) => {
  await act(async () => {
    el.click();
    await new Promise((r) => setTimeout(r, 0));
  });
};

/** Arrange's removal: pick the row, Move to band…, Remove from list. */
const remove = async (name: string) => {
  await click(button(name));
  await click(button("Move to band…"));
  await click(button("Remove from list"));
};

describe("Arrange (X23 / D4)", () => {
  test("read-only until Arrange — even with the old lock set — and Done ends it", async () => {
    await render();
    assert.equal(document.querySelector('[aria-label^="Remove "]'), null);
    assert.equal(document.querySelector('[role="toolbar"]'), null);

    await click(button("Edit order"));
    assert.ok(document.querySelector('[role="toolbar"]'));
    assert.ok(button("Reorder Rioja"));
    assert.ok(button("Add entry"));
    assert.equal(button("Move up").disabled, true, "nothing picked yet");

    await click(button("Done"));
    assert.equal(document.querySelector('[role="toolbar"]'), null);
    assert.equal(document.querySelector('[aria-label^="Reorder "]'), null);
  });

  test("Undo names the edit, steps the history, and offers Redo back", async () => {
    await render();
    await click(button("Edit order"));
    const undo = button("Undo: moved Barolo to Outstanding");
    assert.equal(undo.disabled, false);
    assert.equal(button(/^Redo/).disabled, true);

    await click(undo);
    // It names the edit the button showed (D4 + wave B: expectedSeq), so a
    // newer edit from another tab can never be the one taken back.
    assert.deepEqual(calls, ["undo tl-1 #7", "refresh"]);
    assert.equal(toasts.at(-1)?.message, "Moved Barolo back to Unrated");
    assert.equal(toasts.at(-1)?.options?.actionLabel, "Redo");
    // The server's answer is now where the buttons stand.
    assert.equal(button(/^Undo/).disabled, true);
    assert.equal(button("Redo: moved Barolo to Outstanding").disabled, false);

    await act(async () => {
      toasts.at(-1)?.options?.undo?.();
      await new Promise((r) => setTimeout(r, 0));
    });
    assert.deepEqual(calls.slice(2), ["redo tl-1 #7", "refresh"]);
  });

  test("a removal lands at once, and its toast's Undo steps the history", async () => {
    await render({
      ...data,
      history: { canUndo: false, canRedo: false, undo: null, redo: null },
    });
    await click(button("Edit order"));
    assert.equal(button(/^Undo/).disabled, true);

    await remove("Rioja");
    assert.deepEqual(calls, ["remove row-1", "refresh"]);
    assert.equal(document.body.textContent?.includes("Rioja"), false);
    assert.equal(toasts.at(-1)?.message, "Removed Rioja");
    // The fresh edit is undoable before the refresh even lands.
    assert.equal(button(/^Undo/).disabled, false);

    // The toast's Undo, tapped before the refresh says which edit the
    // removal was: it waits for that instead of stepping blind…
    let tapped: Promise<void> | undefined;
    await act(async () => {
      tapped = Promise.resolve(toasts.at(-1)?.options?.undo?.());
      await new Promise((r) => setTimeout(r, 0));
    });
    assert.deepEqual(calls, ["remove row-1", "refresh"], "nothing sent yet");
    // …and names the edit once the refreshed history arrives.
    const removal = {
      seq: 8,
      kind: "REMOVE" as const,
      entryName: "Rioja",
      fromBand: 3,
      toBand: null,
    };
    await render({
      ...data,
      history: { canUndo: true, canRedo: false, undo: removal, redo: null },
    });
    await act(async () => {
      await tapped;
      await new Promise((r) => setTimeout(r, 250));
    });
    assert.deepEqual(calls.slice(2), ["undo tl-1 #8", "refresh"]);
  });

  test("a removal's Undo whose refresh shows nothing left to undo sends nothing, and says so", async () => {
    await render({
      ...data,
      history: { canUndo: false, canRedo: false, undo: null, redo: null },
    });
    await click(button("Edit order"));
    await remove("Rioja");
    let tapped: Promise<void> | undefined;
    await act(async () => {
      tapped = Promise.resolve(toasts.at(-1)?.options?.undo?.());
      await new Promise((r) => setTimeout(r, 0));
    });
    // Another tab already took the removal back: the refresh has no Undo.
    await render({
      ...data,
      history: { canUndo: false, canRedo: true, undo: null, redo: edit },
    });
    await act(async () => {
      await tapped;
      await new Promise((r) => setTimeout(r, 250));
    });
    assert.deepEqual(calls, ["remove row-1", "refresh", "refresh"]);
    assert.equal(
      toasts.at(-1)?.message,
      "Nothing to undo on this list any more.",
    );
    assert.equal(toasts.at(-1)?.options?.tone, "error");
  });

  test("⌘Z while arranging is Undo; outside Arrange it does nothing", async () => {
    await render();
    const press = async (shiftKey = false) =>
      act(async () => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "z", metaKey: true, shiftKey }),
        );
        await new Promise((r) => setTimeout(r, 0));
      });
    await press();
    assert.deepEqual(calls, []);
    await click(button("Edit order"));
    await press();
    assert.deepEqual(calls, ["undo tl-1 #7", "refresh"]);
  });

  test("an empty list's Add from what you've tasted opens the picker", async () => {
    await render({ ...data, items: [], itemCount: 0 });
    // Nothing to put in order: no Edit order, one Add in the dock.
    assert.throws(() => button("Edit order"));
    assert.ok(button("Add a wine"));
    await click(button("Add from what you've tasted"));
    assert.ok(
      document.querySelector('[role="dialog"]'),
      "the picker did not open",
    );
  });

  test("SPEC 16/17: a dock move is one band order, its rank said once, and #1 is New #1", async () => {
    await render();
    await click(button("Edit order"));
    await click(button("Rioja"));
    assert.match(document.body.textContent ?? "", /#2 · Rioja · Good/);
    // Rioja tops Good: up crosses into the band above, even an empty one.
    await click(button("Move up"));
    assert.deepEqual(calls, ["reorder tl-1 4 row-1", "refresh"]);
    assert.equal(toasts.at(-1)?.message, "Moved to Very Good · #2 · Rioja");
    assert.ok(toasts.at(-1)?.options?.undo, "the move's toast offers Undo");
    // …then the end of Outstanding, after Barolo…
    await click(button("Move up"));
    assert.deepEqual(calls.slice(2), ["reorder tl-1 5 row-0,row-1", "refresh"]);
    assert.equal(toasts.at(-1)?.message, "Moved to Outstanding · #2 · Rioja");
    // …then past it: the owner's new #1.
    await click(button("Move up"));
    assert.deepEqual(calls.slice(4), ["reorder tl-1 5 row-1,row-0", "refresh"]);
    assert.equal(toasts.at(-1)?.message, "New #1 · Rioja");
    // Already #1: nothing above it, nothing sent.
    await click(button("Move up"));
    assert.equal(calls.length, 6);
  });

  test("a stranger's list is never written: no pick, no move, no removal", async () => {
    await render({ ...data, isOwner: false, history: null });
    for (const name of [
      "Move up",
      "Move to band…",
      "Reorder Rioja",
      "Edit order",
    ]) {
      assert.throws(() => button(name), `${name} on a list you don't own`);
    }
    // A row is a link to the entry, never a pick.
    const row = [...document.querySelectorAll("a")].find(
      (a) => a.textContent === "Rioja",
    );
    assert.equal(row?.getAttribute("href"), "/wines/w-1");
    assert.deepEqual(calls, []);
  });

  test("a friend's list: no Arrange at all", async () => {
    await render({ ...data, isOwner: false, history: null });
    assert.throws(() => button("Edit order"));
    assert.throws(() => button("Add a wine"));
  });
});

describe("Insights writes itself on first open (L12, MC-quota)", () => {
  const entries = ["Barolo", "Rioja", "Chianti"].map((name, i) => ({
    id: `row-${i}`,
    band: 4,
    name,
    countryCode: null,
    region: null,
    primaryCategory: null,
  }));
  const idle = {
    items: entries,
    aiInsights: null,
    contentUpdatedAt: null,
    status: "IDLE" as const,
    failureReason: null,
    retryAt: null,
    showPlaceStats: false,
  };
  const renderPanel = async (
    over: Partial<typeof idle> = {},
    isOwner = true,
  ) => {
    await act(async () =>
      root.render(
        <Provider value={client}>
          <TooltipProvider>
            <TierListInsightsPanel
              insights={{ ...idle, ...over }}
              grounded={{ tierListId: "tl-1", isOwner }}
              noun="wines"
            />
          </TooltipProvider>
        </Provider>,
      ),
    );
    await act(async () => new Promise((r) => setTimeout(r, 0)));
  };

  test("the owner's IDLE list of 3 asks once, and shows the working card", async () => {
    insightsAnswer = { success: true, status: "PENDING" };
    await renderPanel();
    assert.deepEqual(
      calls.filter((c) => c.startsWith("insights")),
      ["insights tl-1"],
    );
    assert.ok(document.querySelector('[aria-label="Writing insights"]'));
    assert.match(document.body.textContent ?? "", /Reading 3 wines/);
    // A re-render (the refresh landing still IDLE) never asks twice.
    await renderPanel();
    assert.equal(calls.filter((c) => c.startsWith("insights")).length, 1);
  });

  test("a stranger's list is never written: a read never writes", async () => {
    await renderPanel({}, false);
    assert.deepEqual(
      calls.filter((c) => c.startsWith("insights")),
      [],
    );
    assert.equal(
      document.querySelector('[aria-label="Writing insights"]'),
      null,
    );
  });

  test("under 3 entries, or already written, sends nothing", async () => {
    await renderPanel({
      items: entries.slice(0, 2),
      status: "NOT_ENOUGH_ENTRIES" as never,
    });
    await renderPanel({ status: "READY" as never });
    assert.deepEqual(
      calls.filter((c) => c.startsWith("insights")),
      [],
    );
  });

  test("a quota refusal shows Limit reached with the reset", async () => {
    insightsAnswer = {
      success: false,
      failure: {
        code: "BUDGET_EXCEEDED",
        reason: "USER_CAP",
        retryAt: "2099-01-01T15:40:00.000Z",
      },
    };
    await renderPanel();
    const text = document.body.textContent ?? "";
    assert.match(text, /Limit reached/);
    assert.match(text, /try again/i);
    assert.equal(
      document.querySelector('[aria-label="Writing insights"]'),
      null,
    );
    insightsAnswer = { success: true, status: "PENDING" };
  });
});
