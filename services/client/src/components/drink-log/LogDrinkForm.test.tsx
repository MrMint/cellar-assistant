/**
 * The "Log a drink" form in a DOM (happy-dom), X02.
 *
 * What a person does with it: types a note and, once it sits still, sees the
 * flavours the note names as **suggested** chips (the AI's mark, dashed) that
 * do nothing until tapped; a tap makes one a tag of theirs; "Not these" hides
 * them; tags typed by hand are normalised; friends toggle for "Who with".
 * The suggestion is answered by an `ssrExchange` keyed on the exact document
 * and variables the form sends, so a change in what it asks fails here.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/wines/w1" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const React = await import("react");
const { act, useState } = React;
const { createRoot } = await import("react-dom/client");
const { Client, Provider, createRequest, ssrExchange } = await import("urql");
const { mapExchange } = await import("urql");
const { LogDrinkForm, LogDrinkSheet } = await import("./LogDrinkSheet");
const { EMPTY_DRAFT } = await import("./log-draft");
const { SuggestFlavourTagsMutation } = await import("./queries");

const NOTE = "Dark cherries and a little smoke";
const LOG_ID = "11111111-1111-4111-8111-111111111111";

const answering = (suggestions: { tag: string; evidence: string }[]) => {
  const { key } = createRequest(SuggestFlavourTagsMutation, {
    logId: LOG_ID,
    note: NOTE,
    itemType: "WINE",
    existing: [],
  });
  return new Client({
    url: "http://test.invalid/graphql",
    exchanges: [
      ssrExchange({
        isClient: true,
        initialState: {
          [key]: {
            data: JSON.stringify({
              suggestFlavourTags: {
                __typename: "FlavourTagSuggestionsPayload",
                abstained: suggestions.length === 0,
                suggestions: {
                  __typename: "FlavourTagSuggestionConnection",
                  edges: suggestions.map((node) => ({
                    __typename: "FlavourTagSuggestionEdge",
                    node: { __typename: "FlavourTagSuggestion", ...node },
                  })),
                },
              },
            }),
          },
        },
      }),
    ],
  });
};

function Harness() {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  return (
    <LogDrinkForm
      draft={draft}
      onChange={setDraft}
      subject={{ itemType: "WINE", itemId: "w1", itemName: "Barolo" }}
      logId={LOG_ID}
      allowCompanions
      friends={[{ id: "f1", displayName: "Sam", avatarUrl: null }]}
      initialPhotoUrl={null}
      error={null}
    />
  );
}

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

const mount = async (client: InstanceType<typeof Client>) => {
  await act(async () =>
    root.render(
      <Provider value={client}>
        <Harness />
      </Provider>,
    ),
  );
};

/** Types into a controlled field the way a browser does. */
const typeInto = async (
  element: HTMLTextAreaElement | HTMLInputElement,
  value: string,
) => {
  const proto =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const button = (name: string | RegExp) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
    typeof name === "string"
      ? (b.getAttribute("aria-label") ?? b.textContent?.trim()) === name
      : name.test(b.getAttribute("aria-label") ?? b.textContent ?? ""),
  );

const yourTags = () =>
  [...container.querySelectorAll('[aria-label="Your tags"] li')].map((li) =>
    li.textContent?.trim(),
  );

describe("LogDrinkForm", () => {
  test("says the score is this glass's and the review stays", async () => {
    await mount(answering([]));
    assert.match(
      container.textContent ?? "",
      /Your review of the Barolo stays/,
    );
    assert.ok(container.querySelector('[role="radiogroup"]'));
  });

  test("a still note brings suggested chips; a tap makes one a tag", async () => {
    await mount(
      answering([
        { tag: "cherry", evidence: "Dark cherries" },
        { tag: "smoky", evidence: "a little smoke" },
      ]),
    );
    const note = container.querySelector("textarea");
    assert.ok(note);
    await typeInto(note, NOTE);
    // Nothing is asked while the note is still moving.
    assert.equal(button(/^Add cherry/), undefined);
    await flush(1300);

    const marked = container.querySelector('[data-ai-draft="suggested"]');
    assert.ok(marked, "the suggestions carry the AI's suggested mark");
    assert.match(marked.textContent ?? "", /Suggested/);
    const cherry = button(/^Add cherry/);
    assert.ok(cherry, "a chip per suggestion, naming its evidence");
    assert.match(cherry.getAttribute("aria-label") ?? "", /Dark cherries/);
    assert.deepEqual(yourTags(), [], "nothing is applied before a tap");

    await act(async () => cherry.click());
    assert.deepEqual(yourTags(), ["cherry"]);
    assert.equal(button(/^Add cherry/), undefined, "a taken chip goes");
    assert.ok(button(/^Add smoky/));

    await act(async () => button("Not these")?.click());
    assert.equal(button(/^Add smoky/), undefined);
    assert.equal(container.querySelector('[data-ai-draft="suggested"]'), null);
  });

  test("a note that names no flavour shows no chips", async () => {
    await mount(answering([]));
    const note = container.querySelector("textarea");
    assert.ok(note);
    await typeInto(note, NOTE);
    await flush(1300);
    assert.equal(container.querySelector('[data-ai-draft="suggested"]'), null);
  });

  test("tags typed by hand are normalised, and removable", async () => {
    await mount(answering([]));
    const input = container.querySelector<HTMLInputElement>(
      'input[placeholder="Add a flavour"]',
    );
    assert.ok(input);
    await typeInto(input, "  Dry   Finish ");
    await act(async () => {
      input.form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    assert.deepEqual(yourTags(), ["dry finish"]);
    await act(async () => button("Remove dry finish")?.click());
    assert.deepEqual(yourTags(), []);
  });

  test("Who with toggles a friend and says what it does", async () => {
    await mount(answering([]));
    const sam = button(/Sam$/);
    assert.ok(sam);
    assert.equal(sam.getAttribute("aria-pressed"), "false");
    await act(async () => sam.click());
    assert.equal(button(/Sam$/)?.getAttribute("aria-pressed"), "true");
    assert.match(container.textContent ?? "", /their own log/);
  });
});

describe("LogDrinkSheet", () => {
  test("Edit opens on the entry's own note and does not ask the model about it", async () => {
    const asked: string[] = [];
    const client = new Client({
      url: "http://test.invalid/graphql",
      exchanges: [
        mapExchange({
          onOperation(operation) {
            for (const definition of operation.query.definitions) {
              if (definition.kind === "OperationDefinition") {
                asked.push(definition.name?.value ?? "?");
              }
            }
          },
        }),
        ssrExchange({ isClient: true, initialState: {} }),
      ],
    });
    // "Your log" mounts one sheet, closed, in "new" mode, and an entry's ⋯ →
    // Edit switches it to "edit" and opens it in the same update.
    const sheet = (open: boolean, edit: boolean) => (
      <Provider value={client}>
        <LogDrinkSheet
          open={open}
          onOpenChange={() => {}}
          subject={{ itemType: "WINE", itemId: "w1", itemName: "Barolo" }}
          mode={
            edit
              ? {
                  kind: "edit",
                  entryId: LOG_ID,
                  initial: { ...EMPTY_DRAFT, note: NOTE, tags: ["cherry"] },
                }
              : { kind: "new" }
          }
        />
      </Provider>
    );
    await act(async () => root.render(sheet(false, false)));
    await act(async () => root.render(sheet(true, true)));
    await flush(1300);
    const note = document.querySelector("textarea");
    assert.equal(note?.value, NOTE, "the form opens on the entry, not a blank");
    assert.deepEqual(
      asked.filter((name) => name === "SuggestFlavourTags"),
      [],
      "an untouched note is not sent to the model again",
    );
  });
});
