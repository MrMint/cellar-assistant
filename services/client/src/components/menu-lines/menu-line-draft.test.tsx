/**
 * X07 — "Add to catalog" from an unmatched menu line, in a DOM (happy-dom).
 *
 * The rules a person relies on: the card starts from what the menu says;
 * **nothing is written until Add** (decision D25 — never auto-commit); a
 * "Suggested" value is a chip under its field that does nothing until
 * tapped; a suggestion never renames the line; and Add opens an onboarding
 * with nothing to read before confirming it with the card's values.
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
const { MenuLineDraftSheet, draftEntries } = await import(
  "./MenuLineDraftSheet"
);
const { menuItemFrom } = await import("@/components/map/adapter");
const { formLayout } = await import("@/components/item/itemFormLayout");

type Sent = {
  operationName?: string;
  query: string;
  variables: Record<string, unknown>;
};

const opName = (sent: Sent): string | undefined =>
  sent.operationName ?? /(?:query|mutation)\s+(\w+)/.exec(sent.query)?.[1];

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

const line = menuItemFrom({
  id: "33333333-3333-4333-8333-333333333333",
  name: "LAGAVULIN 16",
  description: "Islay, peat smoke",
  detectedItemType: "spirit",
  canCorrectMatch: false,
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

const mount = async (client: InstanceType<typeof Client>) => {
  await act(async () =>
    root.render(
      <Provider value={client}>
        <MenuLineDraftSheet
          line={line}
          placeId="p1"
          open
          onOpenChange={() => {}}
        />
      </Provider>,
    ),
  );
  await flush();
};

describe("draftEntries", () => {
  test("the name and what the type cannot be saved without, then whatever holds a value", () => {
    const layout = formLayout("SPIRIT", "create");
    const keys = (all: boolean, shown: string[] = []) =>
      draftEntries(layout, (path) => shown.includes(path), all).map((entry) =>
        entry.kind === "attribute" ? entry.field.key : entry.kind,
      );
    assert.deepEqual(keys(false), ["name", "spiritType"]);
    assert.deepEqual(keys(false, ["country"]), [
      "name",
      "spiritType",
      "country",
    ]);
    assert.equal(keys(true).length, layout.length);
  });
});

describe("MenuLineDraftSheet", () => {
  test("starts from the menu's words and type, and sends nothing on its own", async () => {
    const { client, seen } = recording(() => ({ me: null }));
    await mount(client);
    const name = document.querySelector<HTMLInputElement>('input[type="text"]');
    assert.equal(name?.value, "Lagavulin 16");
    const spirit = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button[aria-pressed]"),
    ).find((b) => /Spirit/.test(b.textContent ?? ""));
    assert.equal(spirit?.getAttribute("aria-pressed"), "true");
    // Reads only (capabilities, picker options): no draft opened, nothing
    // suggested, no item.
    assert.deepEqual(
      seen.filter((s) => /^\s*mutation\b/.test(s.query)).map(opName),
      [],
    );
  });

  test("a suggestion is a chip that waits for a tap, and never renames the line", async () => {
    const { client, seen } = recording((sent) =>
      opName(sent) === "SuggestNewItemDetails"
        ? {
            suggestNewItemDetails: {
              __typename: "ItemDetailSuggestions",
              abstained: false,
              note: "Lagavulin 16, an Islay single malt.",
              defaults: { name: "Lagavulin 16 Year Old", country: "SCOTLAND" },
            },
          }
        : { me: null },
    );
    await mount(client);
    await act(async () => button(/Suggest details/)?.click());
    await flush();
    const asked = seen.find((s) => opName(s) === "SuggestNewItemDetails");
    assert.ok(asked, "Suggest details asked the API");
    assert.equal(asked.variables.type, "SPIRIT");
    assert.equal(
      (asked.variables.input as { name: string }).name,
      "Lagavulin 16",
    );
    // Not applied: the chip waits for a tap.
    const text = document.body.textContent ?? "";
    assert.match(text, /Suggested:\s*Scotland/i);
    assert.doesNotMatch(text, /Lagavulin 16 Year Old/);
    const name = document.querySelector<HTMLInputElement>('input[type="text"]');
    assert.equal(name?.value, "Lagavulin 16");
    assert.equal(
      seen.some((s) => opName(s) === "OpenItemDraft"),
      false,
      "a suggestion must not open a draft or write anything",
    );
  });

  test("Add refuses a spirit with no type, before any request", async () => {
    const { client, seen } = recording(() => ({ me: null }));
    await mount(client);
    const form = document.querySelector("form");
    await act(async () => {
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await flush();
    assert.match(document.body.textContent ?? "", /starred fields/);
    assert.equal(
      seen.some((s) => opName(s) === "OpenItemDraft"),
      false,
    );
  });

  test("the verb keeps its word, with '1 to check' beside it while the spirit's type is open (CROSS-LOT)", async () => {
    const { client } = recording(() => ({ me: null }));
    await mount(client);
    const chip = document.querySelector('[data-slot="to-check"]');
    assert.equal(chip?.textContent, "1 to check");
    const footer = document.querySelector('[data-slot="draft-footer"]');
    assert.match(footer?.textContent ?? "", /Add to catalog$/);
  });
});
