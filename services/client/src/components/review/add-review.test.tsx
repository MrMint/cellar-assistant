/**
 * F-146 / F-147: the rating editor opens on the saved score and note every
 * time, whatever happened since the page first drew it (an Add, a Remove
 * from ⋯, an abandoned edit), and Cancel throws the edit away.
 *
 * urql, the router, the stars input and the rich-text editor are stood in
 * for; the form is the real one.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/beers/i-1" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const writes: { input?: unknown; reviewId?: string }[] = [];
mock.module("urql", () => ({
  useMutation: () => [
    {},
    async (variables: { input?: unknown; reviewId?: string }) => {
      writes.push(variables);
      return {
        data: {
          addItemReview: { __typename: "ItemReview", id: "r-1" },
          updateItemReview: { __typename: "ItemReview", id: "r-1" },
          deleteItemReview: { __typename: "DeletedItemReview", id: "r-1" },
        },
      };
    },
  ],
}));
mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
// The stars: shows its value, and a button per score to pick it.
mock.module("@/components/app/RatingInput", () => ({
  RatingInput: ({
    value,
    onChange,
  }: {
    value: number | null | undefined;
    onChange: (value: number) => void;
  }) => (
    <div data-testid="stars" data-value={value ?? ""}>
      {[2, 4].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)}>
          {`pick ${n}`}
        </button>
      ))}
    </div>
  ),
}));
mock.module("../common/RichTextEditor", () => ({
  RichTextEditor: ({
    initialText,
    onChange,
  }: {
    initialText?: string;
    onChange: (text: string) => void;
  }) => (
    <textarea
      data-testid="note"
      defaultValue={initialText ?? ""}
      onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
    />
  ),
}));
mock.module("../common/rich-text", () => ({
  plainTextFromRichText: (text: string) => text,
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { AddReview } = await import("./AddReview");

let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  writes.length = 0;
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
type Review = { id: string; score: number; text: string | null } | null;
const render = async (myReview: Review) => {
  await act(async () => {
    root.render(<AddReview itemId="i-1" type="BEER" myReview={myReview} />);
    await settle();
  });
};
const button = (name: string) => {
  const found = [...document.querySelectorAll("button")].find(
    (b) => b.textContent === name || b.getAttribute("aria-label") === name,
  );
  assert.ok(found, `no ${name} button`);
  return found;
};
const click = async (name: string) => {
  await act(async () => {
    button(name).click();
    await settle();
  });
};
const shownScore = () =>
  document.querySelector('[data-testid="stars"]')?.getAttribute("data-value");
const shownNote = () =>
  document.querySelector<HTMLTextAreaElement>('[data-testid="note"]')?.value;

const saved = { id: "r-1", score: 4, text: "Bright and bitter" };

describe("the stars button (F-149)", () => {
  test("its tap target is 44 px tall", async () => {
    await render(saved);
    assert.match(button("Change your rating").className, /\bmin-h-11\b/);
  });
});

describe("the rating editor (F-146)", () => {
  test("after Add, Edit note opens on the score and note just saved", async () => {
    await render(null);
    await click("Rate it");
    await click("pick 4");
    await click("Add");
    // The refresh hands the page the review it just wrote.
    await render(saved);
    await click("Edit note");
    assert.equal(shownScore(), "4");
    assert.equal(shownNote(), "Bright and bitter");
  });

  test("Change your rating opens on a review that arrived after the first draw", async () => {
    await render(null);
    await render(saved);
    await click("Change your rating");
    assert.equal(shownScore(), "4");
    assert.equal(shownNote(), "Bright and bitter");
  });

  test("after Remove my rating (from ⋯), the editor opens empty", async () => {
    await render(saved);
    await render(null);
    await click("Rate it");
    assert.equal(shownScore(), "");
    assert.equal(shownNote(), "");
  });

  test("Remove rating in the editor deletes the review by its id", async () => {
    await render(saved);
    await click("Change your rating");
    await click("Remove rating");
    assert.deepEqual(writes.at(-1), {
      itemId: "i-1",
      type: "BEER",
      reviewId: "r-1",
    });
  });
});

describe("Cancel (F-147)", () => {
  test("Cancel discards the changed score: reopening shows the saved one, and Save writes it", async () => {
    await render(saved);
    await click("Change your rating");
    await click("pick 2");
    assert.equal(shownScore(), "2");
    await click("Cancel");
    await click("Change your rating");
    assert.equal(shownScore(), "4");
    await click("Save");
    assert.deepEqual(writes.at(-1)?.input, {
      score: 4,
      text: "Bright and bitter",
    });
  });
});
