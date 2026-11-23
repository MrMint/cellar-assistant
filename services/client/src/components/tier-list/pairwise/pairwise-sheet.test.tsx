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

const render = async () => {
  await act(async () => {
    root.render(
      <Provider value={client()}>
        <PairwisePlacement
          tierListId="tl-1"
          candidate={{
            id: "s-new",
            entityType: "spirit",
            name: "Blanton's",
            subtitle: "",
            myScore: 4,
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
    assert.deepEqual(adds()[0]?.variables.input, {
      tierListItemId: (adds()[0]?.variables.input as { tierListItemId: string })
        .tierListItemId,
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
});
