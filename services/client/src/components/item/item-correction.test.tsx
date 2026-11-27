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
import type { ApiFailure } from "@/lib/api/result";

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
const { useBrandChange } = await import("./brand-change");
const { correctionOutcome, correctionSummary } = await import(
  "./ItemCorrectionPanel"
);

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
    assert.equal(button("NV")?.getAttribute("aria-pressed"), "true");
    const year = document.querySelector<HTMLInputElement>(
      'input[name="attributes.vintage"]',
    );
    assert.ok(year?.disabled, "the year gives way to NV");
    assert.equal(year?.value, "");
  });
});

const checkForm = (
  client: ReturnType<typeof createClient>,
  unconfirmed: readonly string[],
) => (
  <Provider value={client}>
    <ItemForm
      id="w1"
      type="WINE"
      defaultValues={{
        name: "Lytton Springs",
        description: "",
        country: "",
        attributes: { vintage: "2016-01-01", region: "Dry Creek Valley" },
      }}
      onSavedHref="/wines/w1"
      brand={{ brandId: "b1", name: "Ridge" }}
      unconfirmed={unconfirmed}
    />
  </Provider>
);

const marked = (): string[] =>
  [...document.querySelectorAll("[data-check-path]")].map(
    (el) => el.getAttribute("data-check-path") ?? "",
  );

const typeInto = async (input: HTMLInputElement | null, value: string) => {
  assert.ok(input, "input to type into");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await flush(30);
};

describe('"Check this" on the label read’s guesses (C3, CROSS-LOT)', () => {
  test("marks each shown field in unconfirmedFields, in form order, with the count beside Save", async () => {
    const { client } = clientAnswering({});
    // `style` is not a field this form shows by that name; `brandName`
    // is the brand picker; unknown names are ignored.
    await mount(checkForm(client, ["region", "brandName", "name", "nope"]));
    assert.deepEqual(marked(), ["name", "brandName", "attributes.region"]);
    assert.equal(
      document.querySelectorAll('[data-slot="check-tag"]').length,
      3,
    );
    assert.equal(button("3 to check")?.textContent?.trim(), "3 to check");
    assert.ok(button("Save"), "Save keeps its verb");
  });

  test("editing a marked field clears its mark, and editing it back does not bring it back", async () => {
    const { client } = clientAnswering({});
    await mount(checkForm(client, ["name", "region"]));
    const name = document.querySelector<HTMLInputElement>(
      '[data-check-path="name"] input',
    );
    await typeInto(name, "Lytton Springs Zin");
    assert.deepEqual(marked(), ["attributes.region"]);
    assert.ok(button("1 to check"));

    await typeInto(
      document.querySelector<HTMLInputElement>('input[name="name"]'),
      "Lytton Springs",
    );
    assert.deepEqual(marked(), ["attributes.region"], "stays cleared");
  });

  test("Looks right confirms a field without changing it", async () => {
    const { client } = clientAnswering({});
    await mount(checkForm(client, ["region"]));
    await click(button("Region looks right"));
    assert.deepEqual(marked(), []);
    assert.equal(button(/to check$/), undefined, "no counter left");
    assert.equal(
      document.querySelector<HTMLInputElement>(
        'input[name="attributes.region"]',
      )?.value,
      "Dry Creek Valley",
    );
  });

  test("nothing to check: no marks and no counter", async () => {
    const { client } = clientAnswering({});
    await mount(checkForm(client, []));
    assert.deepEqual(marked(), []);
    assert.equal(button(/to check$/), undefined);
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

describe("the brand change and its Undo (D8)", () => {
  const replaceAnswers = {
    ResolveBrand: {
      resolveBrand: { __typename: "Brand", id: "b2", name: "Lytton" },
    },
    ReplaceItemBrand: {
      replaceItemBrand: { __typename: "ItemBrand", id: "l2", isPrimary: true },
    },
  };
  const ridge = { brandId: "b1", name: "Ridge" };

  const changerFor = async (
    client: ReturnType<typeof createClient>,
    linked: readonly string[],
  ) => {
    const box: { changer?: ReturnType<typeof useBrandChange> } = {};
    const Probe = () => {
      box.changer = useBrandChange("WINE", "w1", linked);
      return null;
    };
    await mount(
      <Provider value={client}>
        <Probe />
      </Provider>,
    );
    assert.ok(box.changer);
    return box.changer;
  };

  const replaced = (sent: Sent[]) =>
    sent
      .filter((op) => op.operationName === "ReplaceItemBrand")
      .map((op) => [op.variables.brandId, op.variables.replacesBrandId]);

  test("Undo of a brand the item already carried demotes it — it keeps the link", async () => {
    const { client, sent } = clientAnswering(replaceAnswers);
    const changer = await changerFor(client, ["b1", "b2"]);
    let change: Awaited<ReturnType<typeof changer.change>> | undefined;
    await act(async () => {
      change = await changer.change(ridge, "Lytton");
    });
    assert.ok(change?.ok && change.changed);
    assert.equal(change.toWasLinked, true);
    await act(async () => {
      if (change?.ok && change.changed) await changer.undo(change);
    });
    // The change swaps b1 out for b2; the Undo puts b1 back as primary and
    // names nothing to unlink, so b2 is demoted to the link it was.
    assert.deepEqual(replaced(sent), [
      ["b2", "b1"],
      ["b1", null],
    ]);
  });

  test("Undo of a brand new to the item unlinks it again", async () => {
    const { client, sent } = clientAnswering(replaceAnswers);
    const changer = await changerFor(client, ["b1"]);
    let change: Awaited<ReturnType<typeof changer.change>> | undefined;
    await act(async () => {
      change = await changer.change(ridge, "Lytton");
    });
    assert.ok(change?.ok && change.changed);
    assert.equal(change.toWasLinked, false);
    await act(async () => {
      if (change?.ok && change.changed) await changer.undo(change);
    });
    assert.deepEqual(replaced(sent), [
      ["b2", "b1"],
      ["b1", "b2"],
    ]);
  });

  test("clearing unlinks the brand that was shown — and a retried clear is a success, not a NotFound", async () => {
    const { client, sent } = clientAnswering({
      ...replaceAnswers,
      // The server's answer is the same whether the link was there or a
      // first, lost attempt already removed it (`unlinkBrand` is idempotent).
      UnlinkItemBrand: {
        unlinkItemBrand: { __typename: "UnlinkedItemBrand", brandId: "b1" },
      },
    });
    const changer = await changerFor(client, ["b1"]);
    const results: Awaited<ReturnType<typeof changer.change>>[] = [];
    await act(async () => {
      results.push(await changer.change(ridge, "  "));
      // The edit form's Save again, after "The brand wasn't changed. Try
      // again.": the page still shows Ridge, so it asks for the same unlink.
      results.push(await changer.change(ridge, ""));
    });
    for (const result of results) {
      assert.ok(result.ok && result.changed);
      assert.equal(result.to, null);
      assert.deepEqual(result.from, ridge);
    }
    assert.deepEqual(
      sent
        .filter((op) => op.operationName === "UnlinkItemBrand")
        .map((op) => op.variables),
      [
        { type: "WINE", itemId: "w1", brandId: "b1" },
        { type: "WINE", itemId: "w1", brandId: "b1" },
      ],
    );
    assert.deepEqual(replaced(sent), [], "a clear never replaces");

    // Undo of the clear: Ridge back as the primary, nothing named to unlink.
    const [cleared] = results;
    await act(async () => {
      if (cleared?.ok && cleared.changed) await changer.undo(cleared);
    });
    assert.deepEqual(replaced(sent), [["b1", null]]);
  });

  test("clearing an item that shows no brand sends nothing", async () => {
    const { client, sent } = clientAnswering({});
    const changer = await changerFor(client, []);
    let result: Awaited<ReturnType<typeof changer.change>> | undefined;
    await act(async () => {
      result = await changer.change(null, "");
    });
    assert.deepEqual(result, { ok: true, changed: false });
    assert.deepEqual(sent, []);
  });
});

describe("correctionOutcome", () => {
  const failure = (
    code: ApiFailure["code"],
    reason: ApiFailure["reason"] = null,
  ): ApiFailure => ({
    __typename: "ValidationError",
    code,
    reason,
    message: "operator text, never shown",
    retryAt: null,
  });

  test("never sends the person for a new photo or new search words", () => {
    for (const kind of ["label", "suggested"] as const) {
      for (const error of [
        failure("VALIDATION", "NOTHING_READ"),
        failure("CONFLICT", "NOTHING_READ"),
        failure("VALIDATION"),
      ]) {
        const outcome = correctionOutcome(kind, error);
        assert.doesNotMatch(outcome.message, /photo\b.*shot|different words/);
      }
    }
    assert.match(
      correctionOutcome("suggested", failure("VALIDATION", "NOTHING_READ"))
        .message,
      /product's full name/,
    );
  });

  test("keeps aiOutcome's words for limits and an absent provider", () => {
    assert.match(
      correctionOutcome("suggested", failure("CONFLICT", "AI_UNCONFIGURED"))
        .title,
      /Not available/,
    );
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
