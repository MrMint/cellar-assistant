/**
 * X19 / D8 in the browser (happy-dom): the edit form's AI helpers only
 * *propose* — a suggestion is a chip under its field, the field is untouched
 * until the chip is tapped, and a used value carries the field's AI mark —
 * the wine vintage takes a year or the NV chip, and the item page's
 * "Wrong brand? Change it" opens the BrandPicker sheet with Save held until
 * the brand actually changes.
 *
 * The client is real (urql + `fetchExchange`) over a stubbed `fetch` that
 * answers by operation name and records what was sent.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/wines/w1/edit" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const pushed: string[] = [];
mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: (href: string) => pushed.push(href),
    refresh: () => {},
    back: () => {},
  }),
  usePathname: () => "/wines/w1/edit",
  useSearchParams: () => new URLSearchParams(),
}));

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

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { createClient, fetchExchange, Provider } = await import("urql");
const { ItemForm } = await import("./ItemForm");
const { ChangeBrand } = await import("./ChangeBrand");
const { correctionSummary } = await import("./ItemCorrectionPanel");

const CAPABILITIES = {
  semanticSearch: true,
  imageSearch: false,
  labelRead: true,
  menuScan: true,
  recipePhoto: true,
  tierListInsights: true,
  detailSuggestions: true,
};

type Sent = { operationName?: string; variables: Record<string, unknown> };

const clientAnswering = (answers: Record<string, unknown>) => {
  const sent: Sent[] = [];
  const client = createClient({
    url: "http://api.test/graphql",
    exchanges: [fetchExchange],
    fetch: (async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Sent & { query: string };
      const name =
        body.operationName ??
        /(?:query|mutation)\s+(\w+)/.exec(body.query)?.[1];
      sent.push({ operationName: name, variables: body.variables });
      const data =
        name === "AiCapabilities"
          ? {
              me: {
                __typename: "Viewer",
                id: "u1",
                aiCapabilities: CAPABILITIES,
              },
            }
          : (answers[name ?? ""] ?? {});
      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch,
  });
  return { client, sent };
};

let container: HTMLElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

const mount = async (node: React.ReactNode) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
  await flush(20);
};

const flush = async (ms = 0) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};

const button = (name: string | RegExp) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
    typeof name === "string"
      ? (b.getAttribute("aria-label") ?? b.textContent?.trim()) === name
      : name.test(b.getAttribute("aria-label") ?? b.textContent ?? ""),
  );

const click = async (element: HTMLElement | undefined) => {
  assert.ok(element, "element to click");
  await act(async () => element.click());
  await flush(30);
};

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  container = null;
  document.body.innerHTML = "";
});

const wineForm = (client: ReturnType<typeof createClient>) => (
  <Provider value={client}>
    <ItemForm
      id="w1"
      type="WINE"
      defaultValues={{
        name: "Lytton Springs",
        description: "",
        country: "",
        // No reference options load in this test, so a picker value would
        // not survive the first render; the text and year fields carry it.
        attributes: { vintage: "2016-01-01", region: "" },
      }}
      onSavedHref="/wines/w1"
      brand={{ brandId: "b1", name: "Ridge" }}
      correction={{ canRereadLabel: false, canSuggestDetails: true }}
    />
  </Provider>
);

describe("the edit form's correction loop (X19)", () => {
  test("only the helpers this item supports are offered", async () => {
    const { client } = clientAnswering({});
    await mount(wineForm(client));
    assert.ok(button("Suggest details"), "Suggest details is offered");
    assert.equal(button("Re-read label"), undefined, "no label kept");
    // The brand is in the edit form now, starting from the item's.
    const brand = document.querySelector<HTMLInputElement>(
      'input[role="combobox"]',
    );
    assert.equal(brand?.value, "Ridge");
  });

  test("a suggestion is a chip — the field changes only when it is tapped", async () => {
    const { client, sent } = clientAnswering({
      SuggestItemDetails: {
        suggestItemDetails: {
          __typename: "ItemDetailSuggestions",
          abstained: false,
          note: "Ridge Lytton Springs.",
          defaults: { wine: { region: "Dry Creek Valley" } },
        },
      },
    });
    await mount(wineForm(client));
    await click(button("Suggest details"));

    const call = sent.find((s) => s.operationName === "SuggestItemDetails");
    assert.ok(call, "the suggestion pass ran");
    assert.deepEqual(call.variables.input, {
      name: "Lytton Springs",
      brandName: "Ridge",
      country: null,
      attributes: { vintage: "2016-01-01" },
    });

    const region = document.querySelector<HTMLInputElement>(
      'input[name="attributes.region"]',
    );
    assert.equal(region?.value, "", "nothing applied by itself");
    const chip = button("Use suggested Region: Dry Creek Valley");
    assert.ok(chip, "the chip names the field and the value");
    assert.match(document.body.textContent ?? "", /1 suggestion below/);

    await click(chip);
    assert.equal(
      document.querySelector<HTMLInputElement>(
        'input[name="attributes.region"]',
      )?.value,
      "Dry Creek Valley",
    );
    assert.equal(button("Use suggested Region: Dry Creek Valley"), undefined);
    assert.ok(
      document.querySelector('[data-ai-draft="suggested"]'),
      "a used suggestion carries the AI mark",
    );
  });

  test("an abstention suggests nothing, and says so", async () => {
    const { client } = clientAnswering({
      SuggestItemDetails: {
        suggestItemDetails: {
          __typename: "ItemDetailSuggestions",
          abstained: true,
          note: "I do not know this wine.",
          defaults: {},
        },
      },
    });
    await mount(wineForm(client));
    await click(button("Suggest details"));
    assert.match(document.body.textContent ?? "", /Not sure what this is/);
    assert.equal(document.querySelector('[data-slot="ai-proposal"]'), null);
  });

  test("the vintage is a year or the NV chip", async () => {
    const { client } = clientAnswering({});
    await mount(wineForm(client));
    const nv = button("NV");
    assert.equal(nv?.getAttribute("aria-pressed"), "false");
    await click(nv);
    assert.equal(
      button("NV")?.getAttribute("aria-pressed"),
      "true",
    );
    const year = document.querySelector<HTMLInputElement>(
      'input[name="attributes.vintage"]',
    );
    assert.ok(year?.disabled, "the year gives way to NV");
    assert.equal(year?.value, "");
  });
});

describe("Wrong brand? Change it (D8)", () => {
  test("opens the picker; Save waits for an actual change", async () => {
    const { client } = clientAnswering({});
    await mount(
      <Provider value={client}>
        <ChangeBrand
          type="WINE"
          itemId="w1"
          itemName="Lytton Springs"
          shown={{ brandId: "b1", name: "Ridge" }}
        />
      </Provider>,
    );
    await click(button("Wrong brand? Change it"));
    assert.match(document.body.textContent ?? "", /Change the brand/);
    assert.match(
      document.body.textContent ?? "",
      /Lytton Springs is filed under Ridge/,
    );
    assert.ok(button("Save brand")?.disabled, "nothing typed yet");
  });

  test("an item with no brand offers to add one", async () => {
    const { client } = clientAnswering({});
    await mount(
      <Provider value={client}>
        <ChangeBrand type="WINE" itemId="w1" itemName="X" shown={null} />
      </Provider>,
    );
    assert.ok(button("Add the brand"));
  });
});

describe("correctionSummary", () => {
  test("says what came back, in words", () => {
    assert.equal(
      correctionSummary({ kind: "label", offered: 0, unusable: 0 }),
      "The label agrees with what's here.",
    );
    assert.equal(
      correctionSummary({ kind: "label", offered: 2, unusable: 1 }),
      "The label says something different for 2 fields — tap one below to use it. 1 value couldn't be used here.",
    );
    assert.equal(
      correctionSummary({ kind: "suggested", offered: 3, unusable: 0 }),
      "3 suggestions below — check each before you use it.",
    );
    assert.match(
      correctionSummary({
        kind: "suggested",
        offered: 0,
        unusable: 0,
        abstained: true,
      }),
      /^Not sure what this is/,
    );
  });
});
