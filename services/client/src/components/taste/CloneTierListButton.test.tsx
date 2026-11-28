/**
 * Copy on a friend's list (L03, Social-Friends `copyList`): one tap makes one
 * private copy, then the button says "Copied" so a second tap can't make a
 * second (F-92); Undo deletes the copy and gives Copy back.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/users/u-2" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const calls: string[] = [];
const toasts: { message: string; undo?: () => void }[] = [];

mock.module("urql", () => ({
  useMutation: (document: {
    definitions?: { kind?: string; name?: { value?: string } }[];
  }) => {
    const name =
      document.definitions?.find(
        (definition) => definition.kind === "OperationDefinition",
      )?.name?.value ?? "";
    return [
      { fetching: false },
      async () => {
        calls.push(name);
        return name.startsWith("Clone")
          ? {
              data: { cloneTierList: { __typename: "TierList", id: "t-copy" } },
            }
          : {
              data: {
                deleteTierList: { __typename: "DeletedTierList", id: "t-copy" },
              },
            };
      },
    ];
  },
}));
mock.module("@/components/app/notify", () => ({
  notify: (message: string, options?: { undo?: () => void }) => {
    toasts.push({ message, undo: options?.undo });
    return message;
  },
  dismissNotification: () => {},
  pauseToasts: () => () => {},
  UNDO_TOAST_MS: 5000,
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { CloneTierListButton } = await import("./CloneTierListButton");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  calls.length = 0;
  toasts.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const settle = () => new Promise((r) => setTimeout(r, 20));

describe("CloneTierListButton", () => {
  test("after a copy it says Copied and can't copy again; Undo gives Copy back", async () => {
    await act(async () =>
      root.render(<CloneTierListButton tierListId="t-1" name="Pils" />),
    );
    const copy = container.querySelector(
      'button[aria-label="Copy Pils to your lists"]',
    );
    assert.ok(copy instanceof HTMLElement);
    await act(async () => {
      copy.click();
      await settle();
    });
    assert.equal(calls.filter((c) => c.startsWith("Clone")).length, 1);
    assert.equal(toasts[0]?.message, "Copied “Pils”");
    assert.equal(
      container.querySelector('button[aria-label="Copy Pils to your lists"]'),
      null,
      "no second Copy",
    );
    assert.match(
      container.querySelector('[role="status"]')?.textContent ?? "",
      /Copied/,
    );

    await act(async () => {
      toasts[0]?.undo?.();
      await settle();
    });
    assert.ok(calls.some((c) => c.startsWith("Delete")));
    assert.ok(
      container.querySelector('button[aria-label="Copy Pils to your lists"]'),
    );
  });
});
