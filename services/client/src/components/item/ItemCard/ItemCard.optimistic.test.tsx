/**
 * `ItemCard`'s heart (X24): it fills, and the count moves, in the tap's own
 * frame — no spinner, no wait on `setFavorite` — and a refused write puts
 * both back with a toast. (The old card set its "optimistic" state inside the
 * async transition that awaited the write, so the heart only changed when the
 * server answered.) happy-dom, with `useMutation` answering by hand.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/favorites" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { nextImageModule } = await import("../../../test-support/next-image");
mock.module("next/image", () => nextImageModule("fallback"));

type Answer = {
  data?: { setFavorite: Record<string, unknown> };
  error?: Error;
};
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

let notes: { message: string; options: Record<string, unknown> }[];
mock.module("@/components/app/notify", () => ({
  notify: (message: string, options: Record<string, unknown> = {}) => {
    notes.push({ message, options });
    return message;
  },
  dismissNotification: () => {},
}));

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { ItemCard, shownFavoriteCount } = await import("./index");

const item = {
  id: "ci1",
  itemId: "i1",
  name: "Barolo",
  vintage: "2016",
  isFavorite: false,
  favoriteCount: 4,
};

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
  await act(async () => {
    for (const w of writes) {
      w.resolve({
        data: {
          setFavorite: {
            __typename: "SetFavoritePayload",
            favorited: true,
          },
        },
      });
    }
    await new Promise((r) => setTimeout(r, 0));
  });
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const heart = () => {
  const b = container.querySelector("button[aria-pressed]");
  assert.ok(b, "the card has a favourite toggle");
  return b as HTMLButtonElement;
};
/** The count beside the heart (its first text node). */
const count = () => heart().querySelector("span")?.textContent;
const mount = async (favorite = false) => {
  await act(async () =>
    root.render(
      <ItemCard
        type="WINE"
        href="/wines/i1"
        item={{ ...item, isFavorite: favorite }}
      />,
    ),
  );
};
const answer = async (a: Answer) => {
  await act(async () => {
    writes[0]?.resolve(a);
    await new Promise((r) => setTimeout(r, 0));
  });
};

describe("ItemCard favourite toggle (X24)", () => {
  test("the heart fills and the count moves before the write answers", async () => {
    await mount(false);
    assert.equal(heart().getAttribute("aria-pressed"), "false");
    assert.equal(count(), "4");

    await act(async () => heart().click());

    assert.equal(heart().getAttribute("aria-pressed"), "true");
    assert.equal(count(), "5");
    assert.equal(heart().disabled, false, "a second tap is still taken");
    assert.equal(heart().querySelector('[role="status"]'), null, "no spinner");
    // The state asked for, not a flip: a retry of this write cannot undo it.
    assert.deepEqual(writes[0]?.variables, {
      itemId: "i1",
      type: "WINE",
      favorited: true,
    });
  });

  test("the server's answer is kept", async () => {
    await mount(false);
    await act(async () => heart().click());
    await answer({
      data: {
        setFavorite: {
          __typename: "SetFavoritePayload",
          favorited: true,
        },
      },
    });
    assert.equal(heart().getAttribute("aria-pressed"), "true");
    assert.equal(count(), "5");
    assert.deepEqual(notes, []);
  });

  test("a refused write puts the heart and the count back, with a toast", async () => {
    await mount(true);
    await act(async () => heart().click());
    assert.equal(heart().getAttribute("aria-pressed"), "false");
    assert.equal(count(), "3");

    await answer({
      data: {
        setFavorite: {
          __typename: "ForbiddenError",
          message: "Not yours",
          code: "FORBIDDEN",
        },
      },
    });

    assert.equal(heart().getAttribute("aria-pressed"), "true");
    assert.equal(count(), "4");
    assert.equal(notes.length, 1);
    assert.equal(notes[0]?.options.tone, "error");
  });

  test("a transport failure is a refusal too", async () => {
    await mount(false);
    await act(async () => heart().click());
    await answer({ error: new Error("Network down") });
    assert.equal(heart().getAttribute("aria-pressed"), "false");
    assert.equal(count(), "4");
    assert.equal(notes.length, 1);
  });

  test("a double tap flips twice, one write at a time, and ends where it began", async () => {
    // Writes never overlap, so they cannot land out of order; the second
    // is sent only after the first, and each names its own state.
    await mount(false);
    await act(async () => heart().click());
    await act(async () => heart().click());
    assert.equal(heart().getAttribute("aria-pressed"), "false");
    assert.equal(count(), "4");
    assert.equal(writes.length, 1, "the second flip waits for the first");

    await act(async () => {
      writes[0]?.resolve({
        data: {
          setFavorite: {
            __typename: "SetFavoritePayload",
            favorited: true,
          },
        },
      });
      await new Promise((r) => setTimeout(r, 0));
    });
    assert.equal(writes.length, 2, "then the flip back");
    assert.equal(writes[0]?.variables.favorited, true);
    assert.equal(writes[1]?.variables.favorited, false);
    await act(async () => {
      writes[1]?.resolve({
        data: {
          setFavorite: {
            __typename: "SetFavoritePayload",
            favorited: false,
          },
        },
      });
      await new Promise((r) => setTimeout(r, 0));
    });
    assert.equal(heart().getAttribute("aria-pressed"), "false");
    assert.equal(count(), "4");
    assert.deepEqual(notes, []);
  });

  test("the heart does not leave the page through the card's link", async () => {
    await mount(false);
    let followed = false;
    container.querySelector("a")?.addEventListener("click", (event) => {
      followed = true;
      event.preventDefault();
    });
    await act(async () => heart().click());
    assert.equal(followed, false);
  });
});

describe("shownFavoriteCount", () => {
  test("moves the server's count by the drawn change, never below zero", () => {
    assert.equal(shownFavoriteCount(4, false, false), 4);
    assert.equal(shownFavoriteCount(4, false, true), 5);
    assert.equal(shownFavoriteCount(4, true, false), 3);
    assert.equal(shownFavoriteCount(4, true, true), 4);
    assert.equal(shownFavoriteCount(0, true, false), 0);
  });
});
