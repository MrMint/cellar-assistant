/**
 * A person row's Cancel request (Recipes-Search 26; KIT § 4 "Toast or
 * confirm"; F-97): it acts at once, says so in a toast, and the toast's Undo
 * sends the request again. urql, the request lookup and the toast are stood in.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/search?q=demo" });
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

const calls: { name: string; variables: unknown }[] = [];
const toasts: { message: string; undo?: () => void }[] = [];
const ok: Record<string, unknown> = {
  SendFriendRequest: {
    sendFriendRequest: { __typename: "FriendRequest", id: "r-again" },
  },
  RejectFriendRequestAction: {
    rejectFriendRequest: { __typename: "RejectFriendRequestPayload" },
  },
};

mock.module("urql", () => ({
  useQuery: () => [{ fetching: false }, () => {}],
  useMutation: (document: {
    definitions?: { kind?: string; name?: { value?: string } }[];
  }) => {
    const name =
      document.definitions?.find(
        (definition) => definition.kind === "OperationDefinition",
      )?.name?.value ?? "";
    return [
      { fetching: false },
      async (variables: unknown) => {
        calls.push({ name, variables });
        return { data: ok[name] };
      },
    ];
  },
}));
mock.module("./person-requests", () => ({
  usePendingRequest: (direction: string | null) => ({
    id: direction === null ? null : "r-1",
    fetching: false,
  }),
}));
mock.module("@/components/app/notify", () => ({
  notify: (message: string, options: { undo?: () => void } = {}) => {
    toasts.push({ message, undo: options.undo });
    return message;
  },
  dismissNotification: () => {},
  pauseToasts: () => () => {},
  UNDO_TOAST_MS: 5000,
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { PersonAction } = await import("./PersonAction");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  calls.length = 0;
  toasts.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

after(async () => {
  await GlobalRegistrator.unregister();
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const button = (label: string) => {
  const found = container.querySelector(`button[aria-label="${label}"]`);
  if (!(found instanceof HTMLElement)) throw new Error(`no "${label}"`);
  return found;
};

const settle = async (run: () => void) => {
  await act(async () => {
    run();
    await new Promise((r) => setTimeout(r, 20));
  });
};

describe("PersonAction · Cancel request (F-97)", () => {
  test("cancel says so in a toast whose Undo sends the request again", async () => {
    await act(async () =>
      root.render(
        <PersonAction userId="u-5" name="Demo Five" relation="REQUEST_SENT" />,
      ),
    );
    await settle(() => button("Cancel the request to Demo Five").click());

    assert.deepEqual(calls, [
      { name: "RejectFriendRequestAction", variables: { requestId: "r-1" } },
    ]);
    const [toast] = toasts;
    assert.equal(toast?.message, "Request to Demo Five canceled");
    assert.equal(typeof toast?.undo, "function");
    assert.ok(button("Add Demo Five as a friend"));

    await settle(() => toast?.undo?.());
    assert.deepEqual(calls.at(-1), {
      name: "SendFriendRequest",
      variables: { userId: "u-5" },
    });
    assert.ok(button("Cancel the request to Demo Five"));
  });

  test("Undo on Add's toast cancels without a second undo toast", async () => {
    await act(async () =>
      root.render(
        <PersonAction userId="u-6" name="Demo Six" relation="NONE" />,
      ),
    );
    await settle(() => button("Add Demo Six as a friend").click());
    const [sent] = toasts;
    assert.equal(sent?.message, "Request sent to Demo Six");
    await settle(() => sent?.undo?.());
    assert.equal(calls.at(-1)?.name, "RejectFriendRequestAction");
    assert.equal(toasts.length, 1);
  });
});
