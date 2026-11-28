/**
 * BrandPicker in a DOM (happy-dom): the free-solo combobox the Joy
 * `Autocomplete` was. Typing reports the text as typed; two characters and
 * the debounce bring the matches; nothing is highlighted until an arrow key,
 * so Enter keeps what was typed; an arrow and Enter, or a click, pick a
 * match; the new-brand note shows only for a name that matches nothing.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/add" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { Client, Provider, createRequest, ssrExchange } = await import("urql");
const { BrandPicker } = await import("./BrandPicker");
const { BRAND_PICKER_LIMIT, BrandPickerSearchQuery } = await import(
  "@/components/common/OnboardingWizard/queries"
);

const DEBOUNCE_MS = 300;

/** A client that answers the search for `term` with these brand names. */
const answering = (term: string, names: string[]) => {
  const { key } = createRequest(BrandPickerSearchQuery, {
    term,
    limit: BRAND_PICKER_LIMIT,
    first: BRAND_PICKER_LIMIT,
  });
  return new Client({
    url: "http://test.invalid/graphql",
    exchanges: [
      ssrExchange({
        isClient: true,
        initialState: {
          [key]: {
            data: JSON.stringify({
              brandSearch: {
                __typename: "BrandSearchConnection",
                edges: names.map((name, index) => ({
                  node: { __typename: "Brand", id: `b${index}`, name },
                })),
              },
            }),
          },
        },
      }),
    ],
  });
};

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
let changes: string[];

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  changes = [];
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const mount = async (client: InstanceType<typeof Client>, label?: string) => {
  await act(async () =>
    root.render(
      <Provider value={client}>
        <BrandPicker
          value=""
          label={label}
          onChange={(next) => changes.push(next)}
        />
      </Provider>,
    ),
  );
  const input = container.querySelector<HTMLInputElement>(
    'input[role="combobox"]',
  );
  assert.ok(input, "the combobox input is rendered");
  return input;
};

const valueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value",
)?.set;

const typeInto = async (el: HTMLInputElement, value: string) => {
  await act(async () => {
    el.focus();
    valueSetter?.call(el, value);
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
};

const press = async (el: HTMLInputElement, key: string) => {
  await act(async () => {
    el.dispatchEvent(
      new window.KeyboardEvent("keydown", { key, bubbles: true }),
    );
  });
};

const settle = async (ms = DEBOUNCE_MS + 50) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};

const options = () => [
  ...document.querySelectorAll<HTMLElement>('[role="option"]'),
];

describe("BrandPicker (free-solo combobox)", () => {
  test("labelled Brand; the matches appear after the debounce, none highlighted", async () => {
    const input = await mount(answering("Viet", ["Vietti", "Vietti Moscato"]));
    const label = container.querySelector("label");
    assert.equal(label?.textContent, "Brand");
    assert.equal(label?.getAttribute("for"), input.id);
    assert.equal(input.getAttribute("aria-expanded"), "false");

    await typeInto(input, "Viet");
    assert.deepEqual(changes, ["Viet"], "typing reports the text as typed");
    assert.equal(options().length, 0, "no list before the debounce");

    await settle();
    assert.deepEqual(
      options().map((o) => o.textContent),
      ["Vietti", "Vietti Moscato"],
    );
    assert.equal(input.getAttribute("aria-expanded"), "true");
    assert.ok(
      options().every((o) => o.getAttribute("aria-selected") === "false"),
    );
    assert.equal(input.getAttribute("aria-activedescendant"), null);
  });

  test("Enter with nothing highlighted keeps the typed text", async () => {
    const input = await mount(answering("Viet", ["Vietti"]));
    await typeInto(input, "Viet");
    await settle();
    await press(input, "Enter");
    assert.equal(input.value, "Viet");
    assert.deepEqual(changes, ["Viet"]);
  });

  test("ArrowDown then Enter picks the highlighted match", async () => {
    const input = await mount(answering("Viet", ["Vietti", "Vietti Moscato"]));
    await typeInto(input, "Viet");
    await settle();
    await press(input, "ArrowDown");
    await press(input, "ArrowDown");
    const [, second] = options();
    assert.equal(second?.getAttribute("aria-selected"), "true");
    assert.equal(input.getAttribute("aria-activedescendant"), second?.id);
    await press(input, "Enter");
    assert.equal(input.value, "Vietti Moscato");
    assert.deepEqual(changes, ["Viet", "Vietti Moscato"]);
    assert.equal(options().length, 0, "picking closes the list");
  });

  test("a click picks a match", async () => {
    const input = await mount(answering("Viet", ["Vietti"]));
    await typeInto(input, "Viet");
    await settle();
    // Pressing anywhere in the list — an option, or the list itself where
    // its scrollbar is — must not take focus from the box: a blur closes
    // the list before the click lands.
    for (const target of [
      options()[0],
      document.querySelector('[role="listbox"]'),
    ]) {
      const down = new window.MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
      });
      target?.dispatchEvent(down);
      assert.ok(down.defaultPrevented, "mousedown in the list is cancelled");
    }
    await act(async () => options()[0]?.click());
    assert.equal(input.value, "Vietti");
    assert.deepEqual(changes, ["Viet", "Vietti"]);
  });

  test("the new-brand note: only for a name no match spells", async () => {
    const input = await mount(answering("Viet", ["Vietti"]));
    await typeInto(input, "Viet");
    await settle();
    assert.match(
      container.textContent ?? "",
      /“Viet” will be added as a new brand\./,
    );
    const noteId = input.getAttribute("aria-describedby");
    assert.ok(noteId, "the note describes the box");
    assert.match(
      document.getElementById(noteId)?.textContent ?? "",
      /will be added as a new brand/,
    );

    const exact = await mount(answering("vietti", ["Vietti"]));
    await typeInto(exact, "vietti");
    await settle();
    assert.doesNotMatch(container.textContent ?? "", /will be added/);
    assert.equal(exact.getAttribute("aria-describedby"), null);
  });

  test("Clear empties the box and reports none", async () => {
    const input = await mount(answering("Viet", []));
    await typeInto(input, "Viet");
    const clear = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Clear"]',
    );
    assert.ok(clear);
    await act(async () => clear.click());
    assert.equal(input.value, "");
    assert.deepEqual(changes, ["Viet", ""]);
  });

  test("the label names what the field holds when it is not a brand (H-134)", async () => {
    const input = await mount(answering("Viet", []), "Producer");
    const label = container.querySelector("label");
    assert.equal(label?.textContent, "Producer");
    assert.equal(label?.getAttribute("for"), input.id);
  });

  test("Clear search shows only when nothing matched, and empties the box (H-134)", async () => {
    const some = await mount(answering("Viet", ["Vietti"]));
    await typeInto(some, "Viet");
    await settle();
    const clearSearch = () =>
      [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Clear search",
      );
    assert.equal(clearSearch(), undefined, "a match is the way on, not Clear");

    changes = [];
    const none = await mount(answering("Zzyx", []));
    await typeInto(none, "Zzyx");
    await settle();
    const button = clearSearch();
    assert.ok(button, "no match: Clear search is one tap back");
    await act(async () => button.click());
    assert.equal(none.value, "");
    assert.deepEqual(changes, ["Zzyx", ""]);
    assert.equal(clearSearch(), undefined);
  });
});
