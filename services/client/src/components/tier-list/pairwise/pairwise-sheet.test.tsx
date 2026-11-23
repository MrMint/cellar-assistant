/**
 * L09 in a DOM, over a stubbed `fetch`: one pick in Add entry offers
 * Compare to place it; the questions are two named buttons; focus moves to
 * each next question; the answers end in ONE positioned add (M7) at the
 * band and position they imply; the result is announced; Undo takes it back
 * with one history step and the questions start again.
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

let refreshes = 0;
mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    back: () => {},
    refresh: () => {
      refreshes += 1;
    },
  }),
  usePathname: () => "/tier-lists/tl-1",
  useSearchParams: () => new URLSearchParams(),
}));

/** The board: four in Very Good (band 4), nothing above or below. */
const BOARD = ["Eagle Rare", "Weller", "Buffalo Trace", "Old Forester"];
/**
 * Per-test knobs: a long board served over two pages (CR-1), an add that
 * fails until told otherwise (CR-2), and a slow second page so urql holds
 * the first page's data while it fetches.
 */
let longBoard = false;
let failAdds = 0;
const LONG = Array.from({ length: 130 }, (_, i) => `Bottle ${i}`);
const wineNode = (name: string, position: number) => ({
  __typename: "TierListItem",
  id: `row-${position}`,
  tierListId: "tl-1",
  band: 4,
  position,
  notes: null,
  entryType: "SPIRIT",
  createdAt: null,
  updatedAt: null,
  ownerReview: null,
  place: null,
  item: {
    __typename: "Spirit",
    id: `s-${position}`,
    type: "SPIRIT",
    name,
    myReview: null,
  },
});

type Sent = { operationName: string; variables: Record<string, unknown> };
let sent: Sent[] = [];
const edit = (seq: number) => ({
  __typename: "TierListEdit",
  seq,
  kind: "ADD",
  entryName: "Blanton's",
  fromBand: null,
  toBand: 4,
  entryCount: 1,
});

globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
  const body = JSON.parse(String(init?.body ?? "{}")) as {
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
  const input = variables.input as
    | { band?: number; position?: number; entry?: { id: string } }
    | undefined;
  if (operationName === "GetTierList" && longBoard) {
    const second = variables.after === "c100";
    if (second) await new Promise((r) => setTimeout(r, 5));
    const slice = second ? LONG.slice(100) : LONG.slice(0, 100);
    const offset = second ? 100 : 0;
    const page = {
      tierList: {
        __typename: "TierList",
        id: "tl-1",
        items: {
          __typename: "TierListItemConnection",
          totalCount: LONG.length,
          pageInfo: {
            hasNextPage: !second,
            endCursor: second ? null : "c100",
          },
          edges: slice.map((name, i) => ({
            __typename: "TierListItemEdge",
            cursor: String(offset + i),
            node: wineNode(name, offset + i),
          })),
        },
      },
    };
    return new Response(JSON.stringify({ data: page }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (operationName === "AddItemToTierList" && failAdds > 0) {
    failAdds -= 1;
    return new Response(
      JSON.stringify({ data: null, errors: [{ message: "timed out" }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  const data =
    operationName === "GetTierList"
      ? {
          tierList: {
            __typename: "TierList",
            id: "tl-1",
            items: {
              __typename: "TierListItemConnection",
              totalCount: BOARD.length,
              pageInfo: { hasNextPage: false, endCursor: null },
              edges: BOARD.map((name, i) => ({
                __typename: "TierListItemEdge",
                cursor: String(i),
                node: wineNode(name, i),
              })),
            },
          },
        }
      : operationName === "AddItemToTierList"
        ? {
            addTierListItem: {
              __typename: "TierListItem",
              id: "new-row",
              band: input?.band,
              position: input?.position,
              entryType: "SPIRIT",
              tierList: {
                __typename: "TierList",
                id: "tl-1",
                editHistory: {
                  __typename: "TierListEditHistory",
                  undo: {
                    __typename: "TierListEdit",
                    seq: 7,
                    kind: "ADD",
                    entryId: input?.entry?.id,
                  },
                },
              },
            },
          }
        : operationName === "UndoTierListEdit"
          ? {
              undoTierListEdit: {
                __typename: "TierListHistoryStep",
                applied: edit(7),
                history: {
                  __typename: "TierListEditHistory",
                  canUndo: false,
                  canRedo: true,
                  undo: null,
                  redo: edit(7),
                },
              },
            }
          : {};
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { Client, Provider, fetchExchange } = await import("urql");
const { PairwisePlacement } = await import("./PairwisePlacement");

const client = () =>
  new Client({
    url: "http://localhost/api/graphql",
    exchanges: [fetchExchange],
    requestPolicy: "network-only",
  });

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
let done = 0;

beforeEach(() => {
  longBoard = false;
  failAdds = 0;
  sent = [];
  refreshes = 0;
  done = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const settle = () => new Promise((r) => setTimeout(r, 10));

const render = async ({
  myScore = 4,
  entityType = "spirit",
}: {
  myScore?: number;
  entityType?: "spirit" | "tea";
} = {}) => {
  await act(async () => {
    root.render(
      <Provider value={client()}>
        <PairwisePlacement
          tierListId="tl-1"
          candidate={{
            id: "s-new",
            entityType,
            name: "Blanton's",
            subtitle: "",
            myScore,
          }}
          onDone={() => {
            done += 1;
          }}
        />
      </Provider>,
    );
    await settle();
  });
  await act(settle);
};

const buttonNamed = (pattern: RegExp) => {
  const found = [...document.querySelectorAll("button")].find((el) =>
    pattern.test(el.getAttribute("aria-label") ?? el.textContent ?? ""),
  );
  if (found === undefined) throw new Error(`no button ${pattern}`);
  return found;
};
const click = async (el: HTMLElement) => {
  await act(async () => {
    el.click();
    await settle();
  });
  await act(settle);
};
const adds = () => sent.filter((s) => s.operationName === "AddItemToTierList");
/** The `position` the nth positioned add sent. */
const sentPosition = (n = 0) =>
  (adds()[n]?.variables.input as { position?: number } | undefined)?.position;

describe("pairwise placement (L09)", () => {
  test("asks with two named buttons, then places in one positioned add", async () => {
    await render();
    const heading = document.querySelector("h2");
    assert.equal(heading?.textContent, "Which do you like more?");
    const choices = [
      ...document.querySelectorAll<HTMLButtonElement>(
        '[data-slot="pairwise-choice"]',
      ),
    ];
    assert.equal(choices.length, 2);
    assert.equal(
      choices[0]?.getAttribute("aria-label"),
      "Blanton's, the new one",
    );
    // n = 4: the middle first — index 2, Buffalo Trace, #3 on the board.
    assert.equal(
      choices[1]?.getAttribute("aria-label"),
      "Buffalo Trace, Very Good number 3",
    );
    assert.ok(document.body.textContent?.includes("1 of 3"));
    assert.ok(
      document.body.textContent?.includes(
        "Skip, put it at the end of Very Good",
      ),
    );

    // Better than Buffalo Trace; focus moves to the next question.
    await click(buttonNamed(/the new one$/));
    assert.equal(document.activeElement, document.querySelector("h2"));
    assert.equal(adds().length, 0);
    // Next: Weller (index 1). Worse than it — so between Weller and Buffalo.
    assert.ok(buttonNamed(/^Weller, Very Good number 2$/));
    await click(buttonNamed(/^Weller/));

    assert.equal(adds().length, 1);
    const { tierListItemId, ...placedInput } = (adds()[0]?.variables.input ??
      {}) as { tierListItemId?: string };
    assert.equal(typeof tierListItemId, "string");
    assert.deepEqual(placedInput, {
      entry: { id: "s-new", type: "SPIRIT" },
      band: 4,
      position: 2,
    });
    const result = document.querySelector('[data-slot="pairwise-result"]');
    assert.ok(result?.textContent?.includes("#3"));
    assert.ok(result?.textContent?.includes("Blanton's goes in Very Good"));
    assert.ok(
      result?.textContent?.includes("Above Buffalo Trace, below Weller."),
    );
    assert.ok(result?.textContent?.includes("2 taps, no scores stored."));
    assert.match(
      document.querySelector('[role="status"]')?.textContent ?? "",
      /Blanton's goes in Very Good, number 3/,
    );
    assert.equal(document.activeElement?.tagName, "H2");
    assert.equal(refreshes, 1);
  });

  test("Undo takes it back in one history step and asks again", async () => {
    await render();
    await click(buttonNamed(/^About the same$/));
    assert.equal(sentPosition(), 3);
    await click(buttonNamed(/^Undo$/));
    const undos = sent.filter((s) => s.operationName === "UndoTierListEdit");
    assert.deepEqual(
      undos.map((s) => s.variables),
      [{ tierListId: "tl-1", expectedSeq: 7 }],
    );
    assert.ok(document.querySelector('[data-slot="pairwise-question"]'));
    assert.match(
      document.querySelector('[role="status"]')?.textContent ?? "",
      /Took back Blanton's/,
    );
  });

  test("Skip puts it at the end of its band, and Done closes", async () => {
    await render();
    await click(buttonNamed(/^Skip, put it at the end of Very Good$/));
    assert.equal(sentPosition(), BOARD.length);
    assert.ok(
      document.body.textContent?.includes("Put at the end of Very Good."),
    );
    await click(buttonNamed(/^Done$/));
    assert.equal(done, 1);
  });

  test("every control is at least 44 px by its classes", async () => {
    await render();
    const controls = [...document.querySelectorAll("button")];
    for (const el of controls) {
      assert.match(
        el.className,
        /min-h-11|h-11|h-12|h-13/,
        `${el.textContent} is under 44 px`,
      );
    }
  });

  test("reads every page of a list longer than one page (CR-1)", async () => {
    longBoard = true;
    await render();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    const reads = sent.filter((s) => s.operationName === "GetTierList");
    assert.deepEqual(
      reads.map((s) => s.variables.after ?? null),
      [null, "c100"],
    );
    assert.ok(document.querySelector('[data-slot="pairwise-question"]'));
    // 130 in the band: the middle of the whole board, not of page 1 twice.
    assert.ok(buttonNamed(/^Bottle 65, Very Good number 66$/));
  });

  test("Undo into an empty band offers to place it again (CR-2)", async () => {
    // Excellent (band 5) is empty on this board: no question, straight in.
    await render({ myScore: 5 });
    assert.equal(adds().length, 1);
    await click(buttonNamed(/^Undo$/));
    const panel = document.querySelector('[data-slot="pairwise-pending"]');
    assert.ok(panel, "a dead skeleton after Undo");
    assert.equal(
      document.querySelector('[aria-label="Reading your list"]'),
      null,
    );
    await click(buttonNamed(/^Place it again$/));
    assert.equal(adds().length, 2);
    assert.ok(document.querySelector('[data-slot="pairwise-result"]'));
  });

  test("a failed add offers Try again and a way back (CR-2)", async () => {
    failAdds = 1;
    await render();
    await click(buttonNamed(/^About the same$/));
    assert.equal(adds().length, 1);
    assert.ok(document.querySelector('[role="alert"]'));
    await click(buttonNamed(/^Try again$/));
    assert.equal(adds().length, 2);
    assert.equal(sentPosition(1), 3);
    assert.ok(document.querySelector('[data-slot="pairwise-result"]'));
  });

  test("a failed add can go back to the questions (CR-2)", async () => {
    failAdds = 1;
    await render();
    await click(buttonNamed(/^About the same$/));
    await click(buttonNamed(/^Start over$/));
    assert.ok(document.querySelector('[data-slot="pairwise-question"]'));
  });

  test("the vessels take the entry's type colour (CR-11)", async () => {
    await render({ entityType: "tea" });
    const vessels = [
      ...document.querySelectorAll('[data-slot="pairwise-choice"] svg'),
    ];
    assert.equal(vessels.length, 2);
    for (const svg of vessels) {
      assert.match(svg.getAttribute("class") ?? "", /text-type-tea-text/);
      assert.doesNotMatch(svg.getAttribute("class") ?? "", /spirit/);
    }
  });
});
