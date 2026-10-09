/**
 * `RecipeLoveButton` (D9) writes the state the tap asked for — `setRecipeLove`
 * with `loved` — never a flip, so a retried request (its first answer lost)
 * lands on the same state instead of taking the Love back. happy-dom, with
 * `useMutation` answering by hand.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/recipes/r1" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Answer = { data?: { setRecipeLove: Record<string, unknown> } };
let writes: {
  variables: Record<string, unknown>;
  resolve: (answer: Answer) => void;
}[];
const realUrql = await import("urql");
mock.module("urql", () => ({
  ...realUrql,
  useMutation: () => [
    { fetching: false, stale: false },
    (variables: Record<string, unknown>) =>
      new Promise<Answer>((resolve) => {
        writes.push({ variables, resolve });
      }),
  ],
}));

let notes: string[];
mock.module("@/components/app/notify", () => ({
  notify: (message: string) => {
    notes.push(message);
    return message;
  },
  dismissNotification: () => {},
}));

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { RecipeLoveButton } = await import("./RecipeLoveButton");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  writes = [];
  notes = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const button = () => {
  const found = container.querySelector("button[aria-pressed]");
  assert.ok(found, "the Love control renders");
  return found as HTMLButtonElement;
};
const mount = async (loved: boolean) => {
  await act(async () =>
    root.render(<RecipeLoveButton recipeId="r1" loved={loved} />),
  );
};
const answer = async (index: number, payload: Record<string, unknown>) => {
  await act(async () => {
    writes[index]?.resolve({ data: { setRecipeLove: payload } });
    await new Promise((r) => setTimeout(r, 0));
  });
};

describe("RecipeLoveButton (D9) sets, never flips", () => {
  test("a tap on an unloved recipe asks for loved: true, and keeps the answer", async () => {
    await mount(false);
    await act(async () => button().click());
    assert.equal(button().getAttribute("aria-pressed"), "true");
    assert.deepEqual(writes[0]?.variables, { recipeId: "r1", loved: true });

    // Already loved on the server (a retry of a lost write): still loved.
    await answer(0, {
      __typename: "SetRecipeLovePayload",
      recipeId: "r1",
      loved: true,
      changed: false,
    });
    assert.equal(button().getAttribute("aria-pressed"), "true");
    assert.deepEqual(notes, []);
  });

  test("a tap on a loved recipe asks for loved: false", async () => {
    await mount(true);
    await act(async () => button().click());
    assert.equal(button().getAttribute("aria-pressed"), "false");
    assert.deepEqual(writes[0]?.variables, { recipeId: "r1", loved: false });
    await answer(0, {
      __typename: "SetRecipeLovePayload",
      recipeId: "r1",
      loved: false,
      changed: true,
    });
    assert.equal(button().getAttribute("aria-pressed"), "false");
  });

  test("a refusal puts the Love back, with a toast", async () => {
    await mount(false);
    await act(async () => button().click());
    await answer(0, {
      __typename: "NotFoundError",
      code: "NOT_FOUND",
      message: "recipe r1 not found",
    });
    assert.equal(button().getAttribute("aria-pressed"), "false");
    assert.equal(notes.length, 1);
  });
});
