/**
 * The recap deck's states against MC-recap answers: no `?period` opens the
 * latest recap; a period with no cards is the empty month (never a zero
 * deck) with a way to the latest; the deck ends on an end card with the
 * period's totals; the Recaps sheet lists this month, the years and months.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// One DOM per process: recap-deck.test.tsx may have registered it already.
if (!GlobalRegistrator.isRegistered) {
  GlobalRegistrator.register({ url: "http://localhost/recap" });
}
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

mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    back: () => {},
    refresh: () => {},
    prefetch: () => {},
  }),
  usePathname: () => "/recap",
  useSearchParams: () => new URLSearchParams(),
}));

const noStamps = {
  __typename: "BreadthStamps",
  styles: null,
  regions: null,
  types: null,
  recipes: null,
};
const card = (kind: string, count: number, chips: string[]) => ({
  kind,
  count,
  newCount: null,
  chips,
});
const recapOf = (period: string, full: boolean) => ({
  __typename: "Recap",
  period,
  timeZone: "UTC",
  totals: full
    ? { checkIns: 4, ratings: 3, bottlesAdded: 1 }
    : { checkIns: 0, ratings: 0, bottlesAdded: 0 },
  cards: {
    newToYou: full
      ? card("NEW_TO_YOU", 3, ["Ruby Port", "Gose", "Kabinett"])
      : null,
    types: full ? card("TYPES", 2, ["Wine", "Beer"]) : null,
    styles: null,
    regions: null,
    recipes: null,
    topRated: null,
    earned: noStamps,
  },
  stamps: noStamps,
});

let recapReads: string[] = [];
globalThis.fetch = (async (_url: string, init?: RequestInit) => {
  // urql sends a short query as a GET, with the operation in the URL.
  const url = new URL(String(_url), "http://localhost");
  const body = (
    init?.body
      ? JSON.parse(String(init.body))
      : {
          query: url.searchParams.get("query") ?? "",
          variables: JSON.parse(url.searchParams.get("variables") ?? "{}"),
        }
  ) as { query: string; variables: Record<string, unknown> };
  let data: unknown;
  if (/query RecapPeriods/.test(body.query)) {
    data = {
      months: {
        __typename: "QueryRecapPeriodsSuccess",
        data: ["2026-05", "2026-04"],
      },
      years: { __typename: "QueryRecapPeriodsSuccess", data: ["2026", "2024"] },
    };
  } else {
    const period = String(body.variables.period);
    recapReads.push(period);
    data = { recap: recapOf(period, period === "2026-05") };
  }
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as unknown as typeof fetch;

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { Client, Provider, fetchExchange } = await import("urql");
const { RecapDeck } = await import("./RecapDeck");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
const settle = () => new Promise((r) => setTimeout(r, 15));

beforeEach(() => {
  recapReads = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const render = async (period: string | null) => {
  await act(async () => {
    root.render(
      <Provider
        value={
          new Client({
            url: "http://localhost/api/graphql",
            exchanges: [fetchExchange],
          })
        }
      >
        <RecapDeck ownerId="u1" period={period} />
      </Provider>,
    );
    await settle();
  });
  await act(settle);
  await act(settle);
};

const text = () => document.body.textContent ?? "";
const button = (name: RegExp) => {
  const found = [...document.querySelectorAll("button")].find((el) =>
    name.test(el.getAttribute("aria-label") ?? el.textContent ?? ""),
  );
  if (found === undefined) throw new Error(`no button ${name}`);
  return found;
};

describe("recap deck states (MC-recap)", () => {
  test("no period opens the latest recap the server lists", async () => {
    await render(null);
    assert.deepEqual(recapReads, ["2026-05"]);
    assert.match(text(), /Your May 2026/);
    assert.match(text(), /things you had/);
  });

  test("a period with no cards is the empty month, with the latest one tap away", async () => {
    await render("2026-04");
    assert.ok(document.querySelector('[data-slot="recap-empty"]'));
    assert.match(text(), /Nothing to recap for April yet/);
    assert.doesNotMatch(text(), /\b0\b/, "never a zero deck");
    await act(async () => {
      button(/^See May 2026$/).click();
      await settle();
    });
    await act(settle);
    assert.equal(recapReads.at(-1), "2026-05");
    assert.match(text(), /things you had/);
  });

  test("the deck ends on the end card: tiles and the period's totals", async () => {
    await render("2026-05");
    await act(async () => button(/^Next card$/).click());
    await act(async () => button(/^Next card$/).click());
    assert.ok(document.querySelector('[data-slot="recap-end"]'));
    assert.match(text(), /That’s your May/);
    assert.match(
      document.querySelector('[data-slot="recap-totals"]')?.textContent ?? "",
      /^4 check-ins · 3 ratings · 1 bottle added$/,
    );
    await act(async () => button(/^Start over$/).click());
    assert.match(text(), /things you had/);
  });

  test("the arrow keys move through the deck on the app element", async () => {
    await render("2026-05");
    const app = document.querySelector<HTMLElement>('[data-slot="recap-deck"]');
    assert.ok(app);
    await act(async () => {
      app.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });
    assert.match(text(), /kinds of drink/);
    await act(async () => {
      app.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
      );
    });
    assert.match(text(), /things you had/);
  });
});
