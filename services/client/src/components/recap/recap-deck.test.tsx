/**
 * L04 recap deck in a DOM: a failed read is an error with Try again, not
 * the "too little logged" empty state (CR-7); the deck has a heading and its
 * Close goes back rather than pushing /me (CR-6, CR-14).
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/recap?period=2026-10" });
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

let calls: string[] = [];
mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: (href: string) => calls.push(`push ${href}`),
    replace: (href: string) => calls.push(`replace ${href}`),
    back: () => calls.push("back"),
    refresh: () => {},
    prefetch: () => {},
  }),
  usePathname: () => "/recap",
  useSearchParams: () => new URLSearchParams(),
}));

let reads = 0;
globalThis.fetch = (async () => {
  reads += 1;
  return new Response(
    JSON.stringify({ data: null, errors: [{ message: "recap timed out" }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}) as unknown as typeof fetch;

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { Client, Provider, fetchExchange } = await import("urql");
const { RecapDeck } = await import("./RecapDeck");
const { recapStatus } = await import("./recap-data");
const { recordNavigation } = await import("@/components/app/nav-history");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
const settle = () => new Promise((r) => setTimeout(r, 10));

beforeEach(() => {
  calls = [];
  reads = 0;
  window.sessionStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const render = async () => {
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
        <RecapDeck ownerId="u1" period="2026-10" />
      </Provider>,
    );
    await settle();
  });
  await act(settle);
};

const button = (name: RegExp) => {
  const found = [...document.querySelectorAll("button")].find((el) =>
    name.test(el.getAttribute("aria-label") ?? el.textContent ?? ""),
  );
  if (found === undefined) throw new Error(`no button ${name}`);
  return found;
};

describe("recap deck (L04)", () => {
  test("a failed read is an error with Try again, not 'too little' (CR-7)", async () => {
    await render();
    assert.ok(document.querySelector('[data-slot="recap-failed"]'));
    assert.doesNotMatch(document.body.textContent ?? "", /Too little logged/);
    assert.equal(
      [...document.querySelectorAll("button")].some((b) =>
        /Share this card/.test(b.textContent ?? ""),
      ),
      false,
    );
    const before = reads;
    await act(async () => {
      button(/^Try again$/).click();
      await settle();
    });
    assert.ok(reads > before, "Try again reads the recap again");
  });

  test("the deck has a heading (CR-14)", async () => {
    await render();
    assert.equal(document.querySelectorAll("h1").length, 1);
  });

  test("Close goes back when a page is behind it, else replaces /me (CR-6)", async () => {
    recordNavigation("/me");
    recordNavigation("/recap");
    await render();
    await act(async () => button(/^Close recap$/).click());
    assert.deepEqual(calls, ["back"]);
    calls = [];
    window.sessionStorage.clear();
    await act(async () => button(/^Close recap$/).click());
    assert.deepEqual(calls, ["replace /me"]);
  });

  test("recapStatus: only a recap that came back is a deck", () => {
    assert.equal(recapStatus({ fetching: true }), "loading");
    assert.equal(
      recapStatus({ fetching: false, error: new Error("x") }),
      "failed",
    );
    assert.equal(
      recapStatus({
        fetching: false,
        data: {
          recap: { __typename: "NotFound", message: "no" },
        } as unknown as Parameters<typeof recapStatus>[0]["data"],
      }),
      "failed",
    );
  });
});
