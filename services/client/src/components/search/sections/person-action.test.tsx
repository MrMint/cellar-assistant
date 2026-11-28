/**
 * A person row's actions (Recipes-Search 25–28; KIT § 4 "Toast or confirm"):
 * Cancel request is held until its Undo toast closes, through
 * `friend/undoable-write` (F-97, H-91), so Undo sends nothing; Cancel and
 * Accept use the row's own `pendingRequestId` with no lookup (F-105). urql
 * and the toast are stood in.
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
type Toast = {
  message: string;
  undo?: () => void;
  onAutoClose?: () => void;
  onClose?: () => void;
};
const toasts: Toast[] = [];
const ok: Record<string, unknown> = {
  SendFriendRequest: {
    sendFriendRequest: { __typename: "FriendRequest", id: "r-again" },
  },
  RejectFriendRequestAction: {
    rejectFriendRequest: { __typename: "RejectFriendRequestPayload" },
  },
  AcceptFriendRequestAction: {
    acceptFriendRequest: { __typename: "AcceptFriendRequestPayload" },
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
mock.module("@/components/app/notify", () => ({
  notify: (message: string, options: Omit<Toast, "message"> = {}) => {
    toasts.push({ message, ...options });
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

describe("PersonAction · Cancel request (F-97, H-91)", () => {
  test("Cancel is held: the row turns at once, Undo sends nothing", async () => {
    await act(async () =>
      root.render(
        <PersonAction
          userId="u-5"
          name="Demo Five"
          relation="REQUEST_SENT"
          requestId="r-1"
        />,
      ),
    );
    await settle(() => button("Cancel the request to Demo Five").click());

    assert.deepEqual(calls, []);
    const [toast] = toasts;
    assert.equal(toast?.message, "Request to Demo Five canceled");
    assert.ok(button("Add Demo Five as a friend"));

    await settle(() => toast?.undo?.());
    assert.deepEqual(calls, []);
    assert.ok(button("Cancel the request to Demo Five"));
    // The toast closing after its Undo sends nothing either.
    await settle(() => toast?.onClose?.());
    assert.deepEqual(calls, []);
  });

  test("the cancel goes when its toast closes, with the row's own id", async () => {
    await act(async () =>
      root.render(
        <PersonAction
          userId="u-7"
          name="Demo Seven"
          relation="REQUEST_SENT"
          requestId="r-7"
        />,
      ),
    );
    await settle(() => button("Cancel the request to Demo Seven").click());
    await settle(() => toasts[0]?.onAutoClose?.());
    assert.deepEqual(calls, [
      { name: "RejectFriendRequestAction", variables: { requestId: "r-7" } },
    ]);
  });

  test("leaving the page sends a cancel still held", async () => {
    await act(async () =>
      root.render(
        <PersonAction
          userId="u-8"
          name="Demo Eight"
          relation="REQUEST_SENT"
          requestId="r-8"
        />,
      ),
    );
    await settle(() => button("Cancel the request to Demo Eight").click());
    await act(async () => root.render(<span />));
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    assert.deepEqual(calls, [
      { name: "RejectFriendRequestAction", variables: { requestId: "r-8" } },
    ]);
  });

  test("Add friend while a cancel is held takes it back, no write", async () => {
    await act(async () =>
      root.render(
        <PersonAction
          userId="u-9"
          name="Demo Nine"
          relation="REQUEST_SENT"
          requestId="r-9"
        />,
      ),
    );
    await settle(() => button("Cancel the request to Demo Nine").click());
    await settle(() => button("Add Demo Nine as a friend").click());
    assert.deepEqual(calls, []);
    assert.ok(button("Cancel the request to Demo Nine"));
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
    assert.deepEqual(calls.at(-1), {
      name: "RejectFriendRequestAction",
      variables: { requestId: "r-again" },
    });
    assert.equal(toasts.length, 1);
  });
});

describe("PersonAction · Accept (F-105)", () => {
  test("accepts the row's own pendingRequestId, with no lookup", async () => {
    await act(async () =>
      root.render(
        <PersonAction
          userId="u-3"
          name="Demo Three"
          relation="REQUEST_RECEIVED"
          requestId="r-3"
        />,
      ),
    );
    await settle(() => button("Accept Demo Three's request").click());
    assert.deepEqual(calls, [
      { name: "AcceptFriendRequestAction", variables: { requestId: "r-3" } },
    ]);
  });

  test("no id on the row: Cancel and Accept cannot be tapped", async () => {
    await act(async () =>
      root.render(
        <PersonAction userId="u-4" name="Demo Four" relation="REQUEST_SENT" />,
      ),
    );
    assert.equal(
      button("Cancel the request to Demo Four").hasAttribute("disabled"),
      true,
    );
  });
});
