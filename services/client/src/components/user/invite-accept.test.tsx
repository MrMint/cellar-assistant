/**
 * `/invite/<token>` signed in (Shell-Entry): Accept makes the friendship and
 * says so with Undo. Undo is a write too — `removeFriend` — so it must only
 * ever take back the friendship this tap made: the id the API returned for
 * it, and nothing when the two of you were already friends (an Undo there
 * would end a friendship that predates the tap). urql and the toast are
 * stood in for; the view is the real one.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/invite/tok" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const removed: unknown[] = [];
const accepted: unknown[] = [];
const toasts: { message: string; undo?: () => void }[] = [];
let becameFriends = true;

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
      async (variables: unknown) => {
        if (name === "AcceptFriendInvite") {
          accepted.push(variables);
          return {
            data: {
              acceptFriendInvite: {
                __typename: "AcceptFriendInvitePayload",
                friendId: "u-from-the-api",
                becameFriends,
              },
            },
          };
        }
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
mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/invite/tok",
}));
mock.module("@/components/app/notify", () => ({
  notify: (message: string, options?: { undo?: () => void }) => {
    toasts.push({ message, undo: options?.undo });
    return message;
  },
  dismissNotification: () => {},
  UNDO_TOAST_MS: 5000,
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { InviteView } = await import("@/components/share/InviteView");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(async () => {
  removed.length = 0;
  accepted.length = 0;
  toasts.length = 0;
  becameFriends = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <InviteView
        token="tok"
        inviterDisplayName="Test One"
        inviterAvatarUrl={null}
        status="CAN_ACCEPT"
      />,
    );
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const accept = async () => {
  const button = [...container.querySelectorAll("button")].find(
    (el) => el.textContent?.trim() === "Accept",
  );
  assert.ok(button, "an Accept button");
  await act(async () => {
    button.click();
  });
};

describe("Accept an invite", () => {
  test("sends only the token, and says so with Undo", async () => {
    await accept();
    assert.deepEqual(accepted, [{ token: "tok" }]);
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0]?.message, "You and Test One are friends");
    assert.ok(toasts[0]?.undo, "an Undo");
  });

  test("Undo removes the friend the API made, by the id it returned", async () => {
    await accept();
    await act(async () => {
      toasts[0]?.undo?.();
    });
    assert.deepEqual(removed, [{ userId: "u-from-the-api" }]);
    // And the page offers Accept again.
    assert.ok(
      [...container.querySelectorAll("button")].some(
        (el) => el.textContent?.trim() === "Accept",
      ),
    );
  });

  test("already friends before the tap: no Undo, so nothing to remove", async () => {
    becameFriends = false;
    await accept();
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0]?.undo, undefined);
    assert.deepEqual(removed, []);
  });
});
