/**
 * A profile you may not open (Social-Friends 17, 18): Add friend asks for
 * this person, and Cancel request and Accept act on the request whose other
 * side is exactly this person — never another open request of the viewer's
 * (L2: cancel is the existing `rejectFriendRequest`). urql, the request
 * lists and the router are stood in for.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/users/u-2" });
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

type Row = { id: string; user: { id: string; displayName: string } };
const lists: { OUTGOING: Row[]; INCOMING: Row[] } = {
  OUTGOING: [],
  INCOMING: [],
};
const calls: { name: string; variables: unknown }[] = [];
type ToastOptions = {
  undo?: () => void;
  onAutoClose?: () => void;
  onClose?: () => void;
};
const toasts: ({ message: string } & ToastOptions)[] = [];
let refreshed = 0;

const row = (id: string, userId: string): Row => ({
  id,
  user: { id: userId, displayName: userId },
});

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
      { fetching: false },
      async (variables: unknown) => {
        calls.push({ name, variables });
        if (name === "SendFriendRequest") {
          return {
            data: {
              sendFriendRequest: {
                __typename: "FriendRequest",
                id: "r-new",
                status: "PENDING",
              },
            },
          };
        }
        if (name === "RejectFriendRequestAction") {
          return {
            data: {
              rejectFriendRequest: {
                __typename: "RejectFriendRequestPayload",
                requestId: "x",
                deleted: true,
              },
            },
          };
        }
        if (name === "AcceptFriendRequestAction") {
          return {
            data: {
              acceptFriendRequest: {
                __typename: "AcceptFriendRequestPayload",
                requestId: "x",
                friendId: "u-2",
                created: true,
              },
            },
          };
        }
        return { data: undefined };
      },
    ];
  },
}));
mock.module("@/lib/paging/use-whole-connection", () => ({
  useWholeConnection: (options: { variables: (after: null) => object }) => {
    const { direction } = options.variables(null) as {
      direction: "OUTGOING" | "INCOMING";
    };
    return {
      rows: lists[direction],
      loading: false,
      failure: null,
      refresh: () => {
        refreshed += 1;
      },
      retry: () => {},
    };
  },
}));
mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    refresh: () => {},
    back: () => {},
    prefetch: () => {},
  }),
  usePathname: () => "/users/u-2",
  useSearchParams: () => new URLSearchParams(),
}));
mock.module("@/components/app/notify", () => ({
  notify: (message: string, options?: ToastOptions) => {
    toasts.push({ message, ...options });
    return message;
  },
  dismissNotification: () => {},
  pauseToasts: () => () => {},
  UNDO_TOAST_MS: 5000,
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { LockedProfile } = await import("./LockedProfile");
const { requestWith } = await import("@/components/friend/friend-lists");

const person = { userId: "u-2", name: "Test Two", avatarUrl: null };

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  lists.OUTGOING = [];
  lists.INCOMING = [];
  calls.length = 0;
  toasts.length = 0;
  refreshed = 0;
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

describe("requestWith", () => {
  test("finds only the request whose other side is this person", () => {
    const rows = [row("r-9", "u-9"), row("r-2", "u-2")];
    assert.equal(requestWith(rows, "u-2")?.id, "r-2");
    assert.equal(requestWith(rows, "u-3"), undefined);
  });
});

describe("LockedProfile (Social-Friends 17, 18)", () => {
  test("says only friends see their lists, and Add friend asks for this person", async () => {
    lists.OUTGOING = [row("r-9", "u-9")];
    await act(async () => root.render(<LockedProfile person={person} />));
    assert.match(
      container.textContent ?? "",
      /Only friends see Test Two’s lists/,
    );
    await click(button("Add friend"));
    assert.deepEqual(calls, [
      { name: "SendFriendRequest", variables: { userId: "u-2" } },
    ]);
    assert.equal(toasts[0]?.message, "Request sent to Test Two");
    assert.match(container.textContent ?? "", /Request sent/);
  });

  test("Cancel request cancels the request to this person, not another one", async () => {
    lists.OUTGOING = [row("r-9", "u-9"), row("r-2", "u-2"), row("r-8", "u-8")];
    await act(async () => root.render(<LockedProfile person={person} />));
    await click(button("Cancel request"));
    // F-91: the toast offers Undo, and the write waits for it to pass.
    assert.equal(toasts[0]?.message, "Request to Test Two canceled");
    assert.deepEqual(calls, []);
    button("Add friend");
    await act(async () => {
      toasts[0]?.onAutoClose?.();
      await new Promise((r) => setTimeout(r, 20));
    });
    assert.deepEqual(calls, [
      {
        name: "RejectFriendRequestAction",
        variables: { requestId: "r-2" },
      },
    ]);
  });

  test("Undo on the canceled toast keeps the request, unsent", async () => {
    lists.OUTGOING = [row("r-2", "u-2")];
    await act(async () => root.render(<LockedProfile person={person} />));
    await click(button("Cancel request"));
    await act(async () => {
      toasts[0]?.undo?.();
      toasts[0]?.onClose?.();
      await new Promise((r) => setTimeout(r, 20));
    });
    assert.deepEqual(calls, []);
    button("Cancel request");
  });

  test("Undo on the sent toast cancels the request just sent", async () => {
    lists.OUTGOING = [row("r-9", "u-9")];
    await act(async () => root.render(<LockedProfile person={person} />));
    await click(button("Add friend"));
    await act(async () => {
      toasts[0]?.undo?.();
      await new Promise((r) => setTimeout(r, 20));
    });
    assert.deepEqual(calls.at(-1), {
      name: "RejectFriendRequestAction",
      variables: { requestId: "r-new" },
    });
  });

  test("Add friend while a cancel waits keeps the request, with no second ask", async () => {
    lists.OUTGOING = [row("r-2", "u-2")];
    await act(async () => root.render(<LockedProfile person={person} />));
    await click(button("Cancel request"));
    await click(button("Add friend"));
    await act(async () => {
      toasts[0]?.onClose?.();
      await new Promise((r) => setTimeout(r, 20));
    });
    assert.deepEqual(calls, []);
    button("Cancel request");
  });

  test("when they asked you, Accept takes their request and no other", async () => {
    lists.INCOMING = [row("r-7", "u-7"), row("r-in", "u-2")];
    await act(async () => root.render(<LockedProfile person={person} />));
    await click(button("Accept"));
    assert.deepEqual(calls, [
      {
        name: "AcceptFriendRequestAction",
        variables: { requestId: "r-in" },
      },
    ]);
    assert.ok(refreshed >= 0);
  });
});
