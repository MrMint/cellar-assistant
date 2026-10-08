/**
 * X23: removing a friend asks first. Unfriending cannot be undone from one
 * side (being friends again takes a new request the other must accept), so
 * Remove opens a confirm sheet and only its button calls `removeFriend`.
 * urql and the list walker are stood in for; the sheet is the real one.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/friends" });
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

const removed: unknown[] = [];
const toasts: string[] = [];

mock.module("urql", () => ({
  useQuery: () => [{ data: undefined, fetching: false }, () => {}],
  useMutation: (document: {
    definitions?: { kind?: string; name?: { value?: string } }[];
  }) => {
    const name =
      document.definitions?.find(
        (definition) => definition.kind === "OperationDefinition",
      )?.name?.value ?? "";
    return [
      {},
      async (variables: unknown) => {
        if (name === "RemoveFriendAction") {
          removed.push(variables);
          return {
            data: { removeFriend: { __typename: "RemoveFriendPayload" } },
          };
        }
        return { data: undefined };
      },
    ];
  },
}));
mock.module("@/lib/paging/use-whole-connection", () => ({
  useWholeConnection: (options: { variables: (after: null) => object }) => {
    const variables = options.variables(null) as { direction?: string };
    const rows =
      variables.direction === undefined
        ? [
            {
              since: "2026-10-01T00:00:00Z",
              user: { id: "u-2", displayName: "Test Two", avatarUrl: null },
            },
          ]
        : [];
    return {
      rows,
      loading: false,
      failure: null,
      refresh: () => {},
      retry: () => {},
    };
  },
}));
mock.module("@/components/app/notify", () => ({
  notify: (message: string) => {
    toasts.push(message);
    return message;
  },
  dismissNotification: () => {},
  UNDO_TOAST_MS: 5000,
}));
mock.module("@/components/shell/SearchField", () => ({
  SearchField: () => null,
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { FriendsClient } = await import("./FriendsClient");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  removed.length = 0;
  toasts.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const button = (text: string) => {
  const found = [...document.querySelectorAll("button")].find(
    (el) => el.textContent?.trim() === text,
  );
  if (found === undefined) throw new Error(`no button "${text}"`);
  return found;
};

const click = async (el: HTMLElement) => {
  await act(async () => {
    el.click();
    await new Promise((r) => setTimeout(r, 20));
  });
};

describe("removing a friend (X23)", () => {
  test("Remove asks first; nothing is removed until it is confirmed", async () => {
    await act(async () => root.render(<FriendsClient />));
    await click(button("Remove"));
    assert.deepEqual(removed, []);
    const sheet = document.querySelector('[role="alertdialog"]');
    assert.ok(sheet, "no confirm sheet");
    assert.match(sheet?.textContent ?? "", /Remove Test Two\?/);
    assert.match(sheet?.textContent ?? "", /new request/);

    await click(button("Remove friend"));
    assert.deepEqual(removed, [{ userId: "u-2" }]);
    assert.deepEqual(toasts, ["You and Test Two are no longer friends"]);
  });

  test("Cancel leaves the friendship alone", async () => {
    await act(async () => root.render(<FriendsClient />));
    await click(button("Remove"));
    await click(button("Cancel"));
    assert.deepEqual(removed, []);
  });
});
