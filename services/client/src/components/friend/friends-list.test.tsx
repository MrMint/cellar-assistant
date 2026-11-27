/**
 * `/friends` (Social-Friends 01, 16, 19, empty): Requests, Friends and Sent,
 * each write on its own row's request or person and no other's — Accept and
 * Decline the request on that row, Cancel the request you sent on that row
 * (L2: `rejectFriendRequest`), Add the person on that search row. Remove is
 * not here any more: it lives on the profile. urql, the list walker, the
 * router and the search field are stood in for.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { useEffect } from "react";

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

type Person = { id: string; displayName: string; avatarUrl: null };
const person = (id: string, displayName: string): Person => ({
  id,
  displayName,
  avatarUrl: null,
});
const lists = {
  friends: [] as { since: string; user: Person }[],
  INCOMING: [] as { id: string; status: string; user: Person }[],
  OUTGOING: [] as { id: string; status: string; user: Person }[],
};
let searchTerm = "";
const calls: { name: string; variables: unknown }[] = [];
const toasts: string[] = [];

const ok: Record<string, unknown> = {
  SendFriendRequest: {
    sendFriendRequest: { __typename: "FriendRequest", id: "r-new" },
  },
  AcceptFriendRequestAction: {
    acceptFriendRequest: { __typename: "AcceptFriendRequestPayload" },
  },
  RejectFriendRequestAction: {
    rejectFriendRequest: { __typename: "RejectFriendRequestPayload" },
  },
};

mock.module("urql", () => ({
  useQuery: (args: { pause?: boolean }) => [
    {
      fetching: false,
      data: args.pause
        ? undefined
        : {
            userSearch: {
              __typename: "UserSearchConnection",
              edges: [
                {
                  node: {
                    userId: "u-5",
                    displayName: "Demo Five",
                    avatarUrl: null,
                  },
                },
                {
                  node: {
                    userId: "u-6",
                    displayName: "Demo Six",
                    avatarUrl: null,
                  },
                },
              ],
            },
          },
    },
    () => {},
  ],
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
mock.module("@/lib/paging/use-whole-connection", () => ({
  useWholeConnection: (options: { variables: (after: null) => object }) => {
    const { direction } = options.variables(null) as {
      direction?: "INCOMING" | "OUTGOING";
    };
    return {
      rows: direction === undefined ? lists.friends : lists[direction],
      loading: false,
      failure: null,
      refresh: () => {},
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
  usePathname: () => "/friends",
  useSearchParams: () => new URLSearchParams(),
}));
mock.module("@/components/app/notify", () => ({
  notify: (message: string) => {
    toasts.push(message);
    return message;
  },
  dismissNotification: () => {},
  pauseToasts: () => () => {},
  UNDO_TOAST_MS: 5000,
}));
mock.module("@/components/shell/SearchField", () => ({
  SearchField: ({ onDebounced }: { onDebounced: (v: string) => void }) => {
    useEffect(() => {
      if (searchTerm !== "") onDebounced(searchTerm);
    }, [onDebounced]);
    return null;
  },
}));
mock.module("@/components/share/InviteFriendsCard", () => ({
  InviteSheet: () => null,
}));
mock.module("./FriendPane", () => ({ FriendPane: () => null }));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { FriendsClient } = await import("./FriendsClient");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  lists.friends = [];
  lists.INCOMING = [];
  lists.OUTGOING = [];
  searchTerm = "";
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

const byLabel = (label: string) => {
  const found = container.querySelector(`button[aria-label="${label}"]`);
  if (!(found instanceof HTMLElement)) throw new Error(`no "${label}"`);
  return found;
};

const click = async (el: HTMLElement) => {
  await act(async () => {
    el.click();
    await new Promise((r) => setTimeout(r, 20));
  });
};

const render = async () => {
  await act(async () => root.render(<FriendsClient />));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
};

describe("/friends", () => {
  test("nobody yet: one solid Invite", async () => {
    await render();
    assert.match(container.textContent ?? "", /No friends yet/);
    assert.equal(
      [...container.querySelectorAll("button")].filter(
        (b) => b.textContent?.trim() === "Invite",
      ).length,
      2,
    );
  });

  test("sections with counts; friends link to their profiles; no Remove on the list", async () => {
    lists.friends = [
      { since: "2026-10-01T00:00:00Z", user: person("u-2", "Test Two") },
    ];
    lists.INCOMING = [
      { id: "r-in", status: "PENDING", user: person("u-3", "Demo Three") },
    ];
    lists.OUTGOING = [
      { id: "r-out", status: "PENDING", user: person("u-4", "Demo Four") },
    ];
    await render();
    const headings = [...container.querySelectorAll("h2")].map(
      (h) => h.textContent,
    );
    assert.deepEqual(headings, ["Requests", "Friends", "Sent"]);
    assert.ok(container.querySelector('a[href="/users/u-2"]'));
    assert.doesNotMatch(container.textContent ?? "", /Remove/);
  });

  test("Accept and Decline act on their own row's request", async () => {
    lists.INCOMING = [
      { id: "r-a", status: "PENDING", user: person("u-3", "Demo Three") },
      { id: "r-b", status: "PENDING", user: person("u-4", "Demo Four") },
    ];
    await render();
    await click(byLabel("Accept Demo Four"));
    await click(byLabel("Decline Demo Three"));
    assert.deepEqual(calls, [
      { name: "AcceptFriendRequestAction", variables: { requestId: "r-b" } },
      { name: "RejectFriendRequestAction", variables: { requestId: "r-a" } },
    ]);
    assert.deepEqual(toasts, ["Demo Four is your friend"]);
  });

  test("Cancel on a sent request cancels that one only", async () => {
    lists.OUTGOING = [
      { id: "r-1", status: "PENDING", user: person("u-7", "Demo Seven") },
      { id: "r-2", status: "PENDING", user: person("u-8", "Demo Eight") },
    ];
    await render();
    await click(byLabel("Cancel request to Demo Eight"));
    assert.deepEqual(calls, [
      { name: "RejectFriendRequestAction", variables: { requestId: "r-2" } },
    ]);
  });

  test("Add on a search row asks for that person", async () => {
    searchTerm = "Demo";
    await render();
    await click(byLabel("Add Demo Six"));
    assert.deepEqual(calls, [
      { name: "SendFriendRequest", variables: { userId: "u-6" } },
    ]);
    assert.deepEqual(toasts, ["Request sent to Demo Six"]);
  });
});
