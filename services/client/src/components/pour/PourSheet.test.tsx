/**
 * The Pour sheet in a DOM (happy-dom, X03), over a stubbed `fetch` so what
 * each tap *sends* is the assertion: the level is a slider that a glass
 * preset moves; a pour logs the drink and then sets the level (opening a
 * sealed bottle); its Undo deletes the log and puts the bottle back; the
 * last pour asks "Finished?" instead of writing a level; and "me + Sam"
 * comes from the last pour on this device.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/cellars/c1" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let changes = 0;
mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    back: () => {},
    refresh: () => {},
  }),
  usePathname: () => "/cellars/c1",
  useSearchParams: () => new URLSearchParams(),
}));

/** A phone: no min-width query matches; motion is not reduced. */
window.matchMedia = ((query: string) => {
  const min = /min-width:\s*(\d+)px/.exec(query);
  return {
    matches: min !== null && 390 >= Number(min[1]),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
}) as typeof window.matchMedia;

const POURED_AT = "2026-10-08T19:30:00.000Z";

type Sent = { operationName: string; variables: Record<string, unknown> };
const sent: Sent[] = [];
globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
  // urql sends a query as a GET (its parameters in the URL) and a mutation
  // as a POST body.
  const params = new URL(String(url), "http://localhost").searchParams;
  const body = (
    init?.body === undefined
      ? {
          query: params.get("query") ?? undefined,
          operationName: params.get("operationName") ?? undefined,
          variables: JSON.parse(params.get("variables") ?? "{}"),
        }
      : JSON.parse(String(init.body))
  ) as {
    query?: string;
    operationName?: string;
    variables?: Record<string, unknown>;
  };
  const operationName =
    body.operationName ??
    /(?:mutation|query)\s+(\w+)/.exec(body.query ?? "")?.[1] ??
    "";
  const variables = body.variables ?? {};
  sent.push({ operationName, variables });
  const answers: Record<string, unknown> = {
    LogDrink: {
      logDrink: {
        __typename: "LoggedDrinkPayload",
        drinkerCount: 1,
        entryIds: [variables.id],
        entry: {
          __typename: "ItemCheckIn",
          id: variables.id,
          createdAt: POURED_AT,
          score: null,
          note: null,
          tags: [],
          isMine: true,
          canRemove: true,
          fromCellar: true,
          userId: "me",
          createdById: "me",
          companionIds: [],
          user: null,
          companions: { edges: [] },
          place: null,
          photo: null,
        },
      },
    },
    UpdateCellarItem: {
      updateCellarItem: {
        __typename: "CellarItem",
        id: variables.cellarItemId,
      },
    },
    DeleteDrinkLog: {
      deleteDrinkLog: {
        __typename: "DeletedDrinkLogPayload",
        ids: [variables.id],
      },
    },
    EmptyCellarItem: {
      emptyCellarItem: {
        __typename: "CellarItem",
        id: variables.cellarItemId,
      },
    },
    PourFollowUp: {
      me: { id: "me" },
      item: {
        __typename: "QueryItemSuccess",
        data: {
          __typename: "Wine",
          id: "w1",
          myReview: null,
          tierListEntries: {
            edges: [
              {
                node: {
                  __typename: "TierListItem",
                  id: "e1",
                  band: 3,
                  tierList: {
                    __typename: "TierList",
                    id: "t1",
                    name: "Best reds",
                    createdById: "me",
                  },
                },
              },
              {
                node: {
                  __typename: "TierListItem",
                  id: "e9",
                  band: 1,
                  tierList: {
                    __typename: "TierList",
                    id: "t9",
                    name: "Sam's list",
                    createdById: "sam",
                  },
                },
              },
            ],
          },
        },
      },
    },
    AddItemReview: {
      addItemReview: {
        __typename: "ItemReview",
        id: "r1",
        itemId: "w1",
        itemType: "WINE",
        score: 5,
        text: null,
        userId: "me",
        createdAt: POURED_AT,
        updatedAt: POURED_AT,
      },
    },
    PourTierListBand: {
      tierList: {
        __typename: "TierList",
        id: "t1",
        items: {
          pageInfo: { hasNextPage: false },
          edges: [
            {
              node: {
                __typename: "TierListItem",
                id: "e1",
                band: 3,
                position: 0,
              },
            },
            {
              node: {
                __typename: "TierListItem",
                id: "e5",
                band: 5,
                position: 1,
              },
            },
            {
              node: {
                __typename: "TierListItem",
                id: "e4",
                band: 5,
                position: 0,
              },
            },
          ],
        },
      },
    },
    ReorderBand: {
      reorderTierListBand: { __typename: "ReorderBandPayload", band: 5 },
    },
    PourTierListHistory: {
      tierList: {
        __typename: "TierList",
        id: "t1",
        editHistory: {
          __typename: "TierListEditHistory",
          undo: {
            __typename: "TierListEdit",
            seq: 7,
            kind: "MOVE",
            fromBand: 3,
            toBand: 5,
          },
        },
      },
    },
    MyFriends: {
      myFriends: {
        __typename: "FriendConnection",
        edges: [
          {
            node: {
              user: { id: "sam", displayName: "Sam", avatarUrl: null },
            },
          },
        ],
      },
    },
  };
  return new Response(JSON.stringify({ data: answers[operationName] ?? {} }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

const React = await import("react");
const { act } = React;
type ReactNode = import("react").ReactNode;
const { createRoot } = await import("react-dom/client");
const { Client, Provider, fetchExchange } = await import("urql");
const { PourSheet } = await import("./PourSheet");
const { Toaster } = await import("@/components/app/Toaster");

const client = new Client({
  url: "http://localhost/api/graphql",
  exchanges: [fetchExchange],
  requestPolicy: "network-only",
});

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
const render = async (node: ReactNode) => {
  await act(async () =>
    root.render(<Provider value={client}>{node}</Provider>),
  );
};
const flush = async (ms = 0) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};
const button = (name: string | RegExp) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => {
    const text = b.textContent?.trim() ?? "";
    return typeof name === "string"
      ? text === name || b.getAttribute("aria-label") === name
      : name.test(text);
  });
const click = async (el: Element | null | undefined) => {
  assert.ok(el, "element to click exists");
  await act(async () => {
    (el as HTMLElement).click();
  });
};
const slider = () => {
  const found = document.querySelector<HTMLElement>('[role="slider"]');
  assert.ok(found, "the level is a slider");
  return found;
};
const ops = (name: string) => sent.filter((s) => s.operationName === name);

let closes = 0;
const sheet = (bottle: {
  percentageRemaining: number;
  openAt: string | null;
}) => (
  <>
    <PourSheet
      open
      onOpenChange={(next) => {
        if (!next) closes += 1;
      }}
      bottle={{ cellarId: "c1", cellarItemId: "b1", ...bottle }}
      subject={{ itemType: "WINE", itemId: "w1", itemName: "Barolo 2016" }}
      friends={[{ id: "sam", displayName: "Sam", avatarUrl: null }]}
      onChanged={() => {
        changes += 1;
      }}
    />
    <Toaster />
  </>
);

beforeEach(() => {
  sent.length = 0;
  changes = 0;
  closes = 0;
  window.localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

describe("PourSheet", () => {
  test("starts on a glass; presets and keys move the level", async () => {
    await render(
      sheet({ percentageRemaining: 60, openAt: "2026-10-01T00:00:00Z" }),
    );
    await flush(20);
    assert.equal(slider().getAttribute("aria-valuenow"), "40");
    assert.equal(slider().getAttribute("aria-valuemax"), "60");
    assert.equal(
      slider().getAttribute("aria-valuetext"),
      "40% left, pouring 20%",
    );
    assert.ok(button("Pour 150 ml"), "the button names the glass");
    assert.match(
      document.body.textContent ?? "",
      /Measured against a 750 ml bottle/,
    );

    await click(document.querySelector('[data-preset="taste"]'));
    assert.equal(slider().getAttribute("aria-valuenow"), "50");
    assert.ok(button("Pour 75 ml"));

    await click(document.querySelector('[data-preset="rest"]'));
    assert.equal(slider().getAttribute("aria-valuenow"), "0");
    assert.ok(button("Pour the last of it"));

    await act(async () => {
      slider().dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
      );
    });
    assert.equal(slider().getAttribute("aria-valuenow"), "1");
    await act(async () => {
      slider().dispatchEvent(
        new KeyboardEvent("keydown", { key: "End", bubbles: true }),
      );
    });
    // Back where it was: nothing to pour, so nothing to press.
    assert.equal(slider().getAttribute("aria-valuenow"), "60");
    assert.equal(button("Pour")?.disabled, true);
  });

  test("the first pour logs it, then opens the bottle at the pour's time; Undo reverses both", async () => {
    await render(sheet({ percentageRemaining: 100, openAt: null }));
    await flush(20);
    await click(button("Pour 150 ml"));
    await flush(50);

    const [log] = ops("LogDrink");
    assert.ok(log, "logDrink was sent");
    assert.deepEqual(log.variables.input, {
      item: { type: "WINE", id: "w1" },
      bottle: { cellarId: "c1", cellarItemId: "b1" },
    });
    const [level] = ops("UpdateCellarItem");
    assert.ok(level, "then the level");
    assert.deepEqual(level.variables.input, {
      percentageRemaining: 80,
      openAt: POURED_AT,
    });
    assert.match(document.body.textContent ?? "", /Poured 150 ml · 80% left/);
    assert.ok(changes > 0, "the page is re-read");

    await click(button("Undo"));
    await flush(50);
    assert.deepEqual(ops("DeleteDrinkLog")[0]?.variables, {
      id: log.variables.id,
    });
    assert.deepEqual(ops("UpdateCellarItem")[1]?.variables.input, {
      percentageRemaining: 100,
      openAt: null,
    });
  });

  test("the last pour asks Finished? instead of writing a level; Not yet leaves a drop", async () => {
    await render(
      sheet({ percentageRemaining: 15, openAt: "2026-10-01T00:00:00Z" }),
    );
    await flush(20);
    // 15% is less than a glass: the sheet starts on the last of it.
    assert.equal(slider().getAttribute("aria-valuenow"), "0");
    await click(button("Pour the last of it"));
    await flush(50);
    assert.equal(ops("LogDrink").length, 1);
    assert.equal(ops("UpdateCellarItem").length, 0, "no level yet");
    assert.match(document.body.textContent ?? "", /That's the last of it/);
    assert.ok(button("Finished"));

    await click(button("Not yet — leave a drop"));
    await flush(50);
    assert.deepEqual(ops("UpdateCellarItem")[0]?.variables.input, {
      percentageRemaining: 5,
    });
  });

  test("closing on Finished? is Not yet: the poured bottle keeps a drop, with Undo", async () => {
    await render(
      sheet({ percentageRemaining: 15, openAt: "2026-10-01T00:00:00Z" }),
    );
    await flush(20);
    await click(button("Pour the last of it"));
    await flush(50);
    assert.match(document.body.textContent ?? "", /That's the last of it/);
    assert.equal(closes, 0);

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    await flush(50);
    assert.deepEqual(
      ops("UpdateCellarItem")[0]?.variables.input,
      { percentageRemaining: 5 },
      "the level is written as Not yet would write it",
    );
    assert.equal(ops("EmptyCellarItem").length, 0, "never finished silently");
    assert.ok(closes > 0, "and the sheet closes");
    assert.match(document.body.textContent ?? "", /a drop left/);
  });

  test("a bottle at 0% that was never finished pours the last of it", async () => {
    await render(
      sheet({ percentageRemaining: 0, openAt: "2026-10-01T00:00:00Z" }),
    );
    await flush(20);
    const pour = button("Pour the last of it");
    assert.equal(pour?.disabled, false);
    await click(pour);
    await flush(50);
    assert.equal(ops("LogDrink").length, 1);
    assert.match(document.body.textContent ?? "", /That's the last of it/);
  });

  test("me + Sam is the last table poured with on this device", async () => {
    window.localStorage.setItem(
      "ca.pour.lastCompanions",
      JSON.stringify([{ id: "sam", displayName: "Sam", avatarUrl: null }]),
    );
    await render(
      sheet({ percentageRemaining: 60, openAt: "2026-10-01T00:00:00Z" }),
    );
    await flush(20);
    assert.equal(button("Just me")?.getAttribute("aria-pressed"), "true");
    await click(button("me + Sam"));
    assert.equal(button("me + Sam")?.getAttribute("aria-pressed"), "true");
    await click(button("Pour 150 ml"));
    await flush(50);
    const input = ops("LogDrink")[0]?.variables.input as
      | { companionIds?: string[] }
      | undefined;
    assert.deepEqual(input?.companionIds, ["sam"]);
  });

  test("Finished, then rate — the review — then a band from that rating on your own lists", async () => {
    await render(
      sheet({ percentageRemaining: 15, openAt: "2026-10-01T00:00:00Z" }),
    );
    await flush(20);
    await click(button("Pour the last of it"));
    await flush(50);
    await click(button("Finished"));
    await flush(80);
    assert.deepEqual(ops("EmptyCellarItem")[0]?.variables, {
      cellarId: "c1",
      cellarItemId: "b1",
    });
    // N13a's toast, with its Undo.
    assert.match(document.body.textContent ?? "", /Finished\. Moved out/);
    assert.match(document.body.textContent ?? "", /How was it\?/);

    const five = document.querySelector<HTMLInputElement>(
      'input[type="radio"][value="5"]',
    );
    await click(five);
    await click(button("Save rating"));
    await flush(80);
    const [review] = ops("AddItemReview");
    const rating = review?.variables.input as { score?: number } | undefined;
    assert.equal(rating?.score, 5, "the rating is the item's review");

    // Only the viewer's own list; 5 stars reads Outstanding.
    assert.match(document.body.textContent ?? "", /Best reds/);
    assert.doesNotMatch(document.body.textContent ?? "", /Sam's list/);
    await click(button("Move to Outstanding"));
    await flush(50);
    assert.deepEqual(ops("ReorderBand")[0]?.variables, {
      tierListId: "t1",
      band: 5,
      orderedIds: ["e4", "e5", "e1"],
    });

    // Its Undo names the move it made (D4's expectedSeq), read back from the
    // list's history — never "whatever is on top".
    const toast = [
      ...document.querySelectorAll<HTMLElement>("[data-sonner-toast]"),
    ].find((t) => /Moved .* to Outstanding/.test(t.textContent ?? ""));
    assert.ok(toast, "the move's toast");
    await click(
      [...toast.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "Undo",
      ),
    );
    await flush(50);
    assert.deepEqual(ops("UndoTierListEdit")[0]?.variables, {
      tierListId: "t1",
      expectedSeq: 7,
    });
  });
});
