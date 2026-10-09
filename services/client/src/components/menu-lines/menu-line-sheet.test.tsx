/**
 * X07 — a menu line's sheet in a DOM (happy-dom).
 *
 * What a person can do from a line: on a matched one, I'm having this /
 * Want to try / Add to cellar / Add to tier list, and — only if they scanned
 * the menu — Not this, which clears the match and offers Undo. On an
 * unmatched one, the catalog's nearest rows as a question and Add to
 * catalog. Every request the sheet sends goes through a recording exchange,
 * so what it asks the API is checked, not just what it draws.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/places/p1" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    refresh: () => {},
    back: () => {},
    prefetch: () => {},
  }),
  usePathname: () => "/places/p1",
  useSearchParams: () => new URLSearchParams(),
}));

window.matchMedia = ((query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList) as typeof window.matchMedia;

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { Client, Provider, fetchExchange } = await import("urql");
const { MenuLineSheet } = await import("./MenuLineSheet");
const { menuItemFrom } = await import("@/components/map/adapter");

type MenuLineAction = import("./MenuLineSheet").MenuLineAction;
type Sent = {
  operationName?: string;
  query: string;
  variables: Record<string, unknown>;
};

/**
 * A client whose network is a stub: every request the sheet sends is
 * recorded, and answered with `answer(request)`.
 */
const recording = (answer: (sent: Sent) => unknown) => {
  const seen: Sent[] = [];
  const client = new Client({
    url: "http://test.invalid/graphql",
    preferGetMethod: false,
    exchanges: [fetchExchange],
    fetch: (async (_url: unknown, init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body)) as Sent;
      seen.push(sent);
      return new Response(JSON.stringify({ data: answer(sent) }), {
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  });
  return { client, seen };
};

/** The operation's own name, read off the document it sent. */
const opName = (sent: Sent): string | undefined =>
  sent.operationName ?? /(?:query|mutation)\s+(\w+)/.exec(sent.query)?.[1];

const matchedLine = (canCorrect: boolean) =>
  menuItemFrom({
    id: "11111111-1111-4111-8111-111111111111",
    name: "BAROLO — Vietti",
    price: 18,
    detectedItemType: "wine",
    canCorrectMatch: canCorrect,
    matchedItem: {
      id: "22222222-2222-4222-8222-222222222222",
      type: "wine",
      item: {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Vietti Barolo Castiglione",
        isWantToTry: false,
      },
    },
    forYou: {
      yourScore: 4.5,
      friendsWhoLovedNames: [],
      friendsWhoLovedCount: 0,
      cellar: null,
      likeYouRated: null,
    },
  });

const unmatchedLine = (canCorrect: boolean) =>
  menuItemFrom({
    id: "33333333-3333-4333-8333-333333333333",
    name: "LAGAVULIN 16",
    detectedItemType: "spirit",
    canCorrectMatch: canCorrect,
    extractedAttributes: { search_name: "lagavulin 16" },
  });

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const flush = async (ms = 0) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};

const button = (name: RegExp): HTMLButtonElement | undefined =>
  Array.from(document.querySelectorAll("button")).find((b) =>
    name.test(b.textContent ?? ""),
  );

const mount = async (
  client: InstanceType<typeof Client>,
  line: ReturnType<typeof menuItemFrom>,
  actions: MenuLineAction[] = [],
) => {
  await act(async () =>
    root.render(
      <Provider value={client}>
        <MenuLineSheet
          line={line}
          place={{ id: "p1", name: "Cork & Barrel" }}
          open
          onOpenChange={() => {}}
          onAction={(action) => actions.push(action)}
        />
      </Provider>,
    ),
  );
  await flush();
};

describe("MenuLineSheet — a matched line", () => {
  test("offers the four actions, in words, and hands each back to the list", async () => {
    const { client } = recording(() => ({}));
    const actions: MenuLineAction[] = [];
    await mount(client, matchedLine(false), actions);

    const text = document.body.textContent ?? "";
    assert.match(text, /Barolo — Vietti/);
    assert.match(text, /Matched to/);
    assert.match(text, /Vietti Barolo Castiglione/);
    assert.match(text, /You ★4\.5/);
    assert.doesNotMatch(text, /%/);
    for (const label of [
      /I'm having this/,
      /Want to try/,
      /Add to cellar/,
      /Add to tier list/,
    ]) {
      assert.ok(button(label), `no ${label} button`);
    }
    // Only the person who scanned the menu may unlink a match.
    assert.equal(button(/^Not this$/), undefined);

    await act(async () => button(/I'm having this/)?.click());
    await act(async () => button(/Add to cellar/)?.click());
    await act(async () => button(/Add to tier list/)?.click());
    assert.deepEqual(actions, ["log", "cellar", "tierList"]);
  });

  test("Not this clears the match through verifyMenuItemMatch, for the scanner", async () => {
    const { client, seen } = recording((sent) =>
      opName(sent) === "VerifyMenuLineMatch"
        ? {
            verifyMenuItemMatch: {
              __typename: "ForbiddenError",
              message: "stub",
              code: "FORBIDDEN",
            },
          }
        : {},
    );
    await mount(client, matchedLine(true));
    const notThis = button(/^Not this$/);
    assert.ok(notThis, "the scanner sees Not this");
    await act(async () => notThis.click());
    await flush();
    const sent = seen.find((op) => opName(op) === "VerifyMenuLineMatch");
    assert.deepEqual(sent?.variables, {
      placeId: "p1",
      menuItemId: "11111111-1111-4111-8111-111111111111",
      match: null,
    });
  });
});

describe("MenuLineSheet — an unmatched line", () => {
  const candidates = (sent: Sent) =>
    opName(sent) === "MenuLineCandidates"
      ? {
          itemSearch: {
            __typename: "ItemSearchConnection",
            edges: [
              {
                __typename: "ItemSearchEdge",
                node: {
                  __typename: "ItemSearchResult",
                  id: "44444444-4444-4444-8444-444444444444",
                  type: "SPIRIT",
                  name: "LAGAVULIN 16 YEAR OLD",
                },
              },
            ],
          },
        }
      : {};

  test("asks the catalog in the line's type, and offers its rows as a question", async () => {
    const { client, seen } = recording(candidates);
    const actions: MenuLineAction[] = [];
    await mount(client, unmatchedLine(true), actions);
    await flush();

    const search = seen.find((op) => opName(op) === "MenuLineCandidates");
    assert.deepEqual(search?.variables, {
      text: "lagavulin 16",
      itemTypes: ["SPIRIT"],
    });
    const text = document.body.textContent ?? "";
    assert.match(text, /Is it one of these\?/);
    assert.match(text, /Lagavulin 16 Year Old/);
    assert.ok(button(/That's it/), "the scanner can set the match");
    // No drink actions on a line that is no item yet.
    assert.equal(button(/I'm having this/), undefined);

    await act(async () => button(/Add to catalog/)?.click());
    assert.deepEqual(actions, ["addToCatalog"]);
  });

  test("someone who did not scan the menu can open a candidate but not set the match", async () => {
    const { client } = recording(candidates);
    await mount(client, unmatchedLine(false));
    await flush();
    assert.equal(button(/That's it/), undefined);
    const link = document.querySelector(
      'a[href="/spirits/44444444-4444-4444-8444-444444444444"]',
    );
    assert.ok(link, "the candidate opens its item page");
  });
});
