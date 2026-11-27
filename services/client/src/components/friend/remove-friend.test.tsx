/**
 * Removing a friend (X23; Social-Friends 05, 07, 15) lives at the foot of
 * their profile and asks first: being friends again takes a new request the
 * other person must accept, so Undo could not bring it back. Only the
 * confirm's button calls `removeFriend`, and only for the person the profile
 * is of. urql and the router are stood in for; the sheet is the real one.
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

const removed: unknown[] = [];
const toasts: string[] = [];
const pushed: string[] = [];

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
        if (name === "RemoveFriendAction") {
          removed.push(variables);
          return {
            data: {
              removeFriend: {
                __typename: "RemoveFriendPayload",
                userId: "u-2",
                removed: true,
              },
            },
          };
        }
        return { data: undefined };
      },
    ];
  },
}));
mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: (href: string) => pushed.push(href),
    replace: () => {},
    refresh: () => {},
    back: () => {},
    prefetch: () => {},
  }),
  usePathname: () => "/users/u-2",
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

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { RemoveFriend } = await import("../profile/RemoveFriend");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  removed.length = 0;
  toasts.length = 0;
  pushed.length = 0;
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

describe("removing a friend (X23, Social-Friends 07)", () => {
  test("Remove friend asks first; only the confirm removes, and only this person", async () => {
    await act(async () =>
      root.render(<RemoveFriend userId="u-2" name="Test Two" />),
    );
    await click(button("Remove friend"));
    assert.deepEqual(removed, []);
    const sheet = document.querySelector('[role="alertdialog"]');
    assert.ok(sheet, "no confirm sheet");
    assert.match(sheet?.textContent ?? "", /Remove Test Two\?/);

    await click(button("Remove"));
    assert.deepEqual(removed, [{ userId: "u-2" }]);
    assert.deepEqual(toasts, ["You and Test Two are no longer friends"]);
    assert.deepEqual(pushed, ["/friends"]);
  });

  test("Keep it leaves the friendship alone", async () => {
    await act(async () =>
      root.render(<RemoveFriend userId="u-2" name="Test Two" />),
    );
    await click(button("Remove friend"));
    await click(button("Keep it"));
    assert.deepEqual(removed, []);
    assert.deepEqual(pushed, []);
  });

  test("in the desktop pane, onRemoved runs instead of leaving the page", async () => {
    let done = 0;
    await act(async () =>
      root.render(
        <RemoveFriend
          userId="u-3"
          name="Sam"
          onRemoved={() => {
            done += 1;
          }}
        />,
      ),
    );
    await click(button("Remove friend"));
    await click(button("Remove"));
    assert.deepEqual(removed, [{ userId: "u-3" }]);
    assert.equal(done, 1);
    assert.deepEqual(pushed, []);
  });
});
