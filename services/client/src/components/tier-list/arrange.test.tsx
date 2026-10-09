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
    reorderBandAction: async () => ({ success: true }),
    addItemToTierListAction: async () => ({ success: true }),
    undoAction: async (id: string) => {
      calls.push(`undo ${id}`);
      return {
        success: true,
        applied: edit,
        history: { canUndo: false, canRedo: true, undo: null, redo: edit },
      };
    },
    redoAction: async (id: string) => {
      calls.push(`redo ${id}`);
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
  isEditingLocked: true,
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

describe("Arrange (X23 / D4)", () => {
  test("read-only until Arrange — even with the old lock set — and Done ends it", async () => {
    await render();
    assert.equal(document.querySelector('[aria-label^="Remove "]'), null);
    assert.equal(document.querySelector('[role="toolbar"]'), null);

    await click(button("Arrange"));
    assert.ok(document.querySelector('[role="toolbar"]'));
    assert.ok(button("Remove Rioja"));
    assert.ok(button("Reorder Rioja"));
    assert.ok(button("Add entry"));

    await click(button("Done"));
    assert.equal(document.querySelector('[role="toolbar"]'), null);
    assert.equal(document.querySelector('[aria-label^="Remove "]'), null);
  });

  test("Undo names the edit, steps the history, and offers Redo back", async () => {
    await render();
    await click(button("Arrange"));
    const undo = button("Undo: moved Barolo to Outstanding");
    assert.equal(undo.disabled, false);
    assert.equal(button(/^Redo/).disabled, true);

    await click(undo);
    assert.deepEqual(calls, ["undo tl-1", "refresh"]);
    assert.equal(toasts.at(-1)?.message, "Moved Barolo back to Unrated");
    assert.equal(toasts.at(-1)?.options?.actionLabel, "Redo");
    // The server's answer is now where the buttons stand.
    assert.equal(button(/^Undo/).disabled, true);
    assert.equal(button("Redo: moved Barolo to Outstanding").disabled, false);

    await act(async () => {
      toasts.at(-1)?.options?.undo?.();
      await new Promise((r) => setTimeout(r, 0));
    });
    assert.deepEqual(calls.slice(2), ["redo tl-1", "refresh"]);
  });

  test("a removal lands at once, and its toast's Undo steps the history", async () => {
    await render({
      ...data,
      history: { canUndo: false, canRedo: false, undo: null, redo: null },
    });
    await click(button("Arrange"));
    assert.equal(button(/^Undo/).disabled, true);

    await click(button("Remove Rioja"));
    assert.deepEqual(calls, ["remove row-1", "refresh"]);
    assert.equal(document.body.textContent?.includes("Rioja"), false);
    assert.equal(toasts.at(-1)?.message, "Removed Rioja");
    // The fresh edit is undoable before the refresh even lands.
    assert.equal(button(/^Undo/).disabled, false);

    await act(async () => {
      toasts.at(-1)?.options?.undo?.();
      await new Promise((r) => setTimeout(r, 0));
    });
    assert.deepEqual(calls.slice(2), ["undo tl-1", "refresh"]);
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
    await click(button("Arrange"));
    await press();
    assert.deepEqual(calls, ["undo tl-1", "refresh"]);
  });

  test("an empty list's Add from what you've tasted opens Arrange and the picker, once", async () => {
    await render({ ...data, items: [], itemCount: 0 });
    await click(button("Add from what you've tasted"));
    assert.ok(document.querySelector('[role="toolbar"]'));
    const adds = [...document.querySelectorAll("button")].filter(
      (el) => el.textContent?.trim() === "Add entry",
    );
    assert.equal(adds.length, 1, "two Add entry buttons while arranging");
    assert.ok(
      document.querySelector('[role="dialog"]'),
      "the picker did not open",
    );
  });

  test("a friend's list: no Arrange at all", async () => {
    await render({ ...data, isOwner: false, history: null });
    assert.throws(() => button("Arrange"));
  });
});
