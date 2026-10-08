/**
 * The bottle page's check-ins (X24): "Check In" draws the viewer's avatar
 * under today before the write answers, keeps it (as the same row) once the
 * write is confirmed and until the refreshed page carries it, and takes it
 * away with a message when the write is refused. "Bulk Check In" closes its
 * picker on submit and draws everyone picked. happy-dom, with `useMutation`
 * answering by hand and `router.refresh` counted.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/cellars/c1/wines/b1" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let refreshes = 0;
mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    back: () => {},
    prefetch: () => {},
    refresh: () => {
      refreshes += 1;
    },
  }),
  usePathname: () => "/cellars/c1/wines/b1",
  useSearchParams: () => new URLSearchParams(),
}));

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

type Write = {
  operation: string;
  variables: Record<string, unknown>;
  resolve: (answer: { data?: unknown; error?: Error }) => void;
};
let writes: Write[];
const realUrql = await import("urql");
mock.module("urql", () => ({
  ...realUrql,
  useMutation: (document: { definitions: { name?: { value: string } }[] }) => [
    { fetching: false, stale: false },
    (variables: Record<string, unknown>) =>
      new Promise((resolve) => {
        writes.push({
          operation: document.definitions[0]?.name?.value ?? "",
          variables,
          resolve,
        });
      }),
  ],
}));

let notes: string[];
mock.module("@/components/app/notify", () => ({
  notify: (message: string) => {
    notes.push(message);
    return message;
  },
  dismissNotification: () => {},
}));

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { ItemCheckIns } = await import("./ItemCheckIns");
const { mergeHeldRows } = await import("./useOptimisticRows");

const me = { id: "me", displayName: "Riley Park", avatarUrl: "" };
const sam = { id: "sam", displayName: "Sam Okafor", avatarUrl: "" };
const earlier = {
  id: "old",
  createdAt: "2026-01-02T10:00:00Z",
  user: me,
};

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  writes = [];
  notes = [];
  refreshes = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    for (const w of writes) w.resolve({ error: new Error("test over") });
    await new Promise((r) => setTimeout(r, 0));
  });
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const render = async (checkIns = [earlier]) => {
  await act(async () =>
    root.render(
      <ItemCheckIns
        checkIns={checkIns}
        itemId="b1"
        cellarId="c1"
        friends={[sam]}
        user={me}
      />,
    ),
  );
};
const button = (name: string) => {
  const found = [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === name,
  );
  assert.ok(found, `a "${name}" button`);
  return found;
};
const avatars = () => [
  ...container.querySelectorAll('[aria-label="Check-ins"] li > span > span'),
];
const pendingAvatars = () =>
  avatars().filter((a) => a.hasAttribute("data-pending"));
const answer = async (i: number, data: unknown) => {
  await act(async () => {
    writes[i]?.resolve({ data });
    await new Promise((r) => setTimeout(r, 0));
  });
};

describe("ItemCheckIns, optimistic (X24)", () => {
  test("Check In draws the viewer under today before the write answers", async () => {
    await render();
    assert.equal(avatars().length, 1);

    await act(async () => button("Check In").click());

    assert.equal(avatars().length, 2, "a second avatar at once");
    assert.equal(pendingAvatars().length, 1, "dimmed until confirmed");
    assert.equal(button("Check In").disabled, true, "no double check-in");
    assert.equal(writes[0]?.operation, "CheckIn");
    // The drawn row's id is the id the write carries: the server's row is
    // the same row.
    const checkInId = writes[0]?.variables.checkInId;
    assert.equal(typeof checkInId, "string");
  });

  test("a confirmed check-in stays, as the same row, until the refreshed page has it", async () => {
    await render();
    await act(async () => button("Check In").click());
    const checkInId = String(writes[0]?.variables.checkInId);
    await answer(0, {
      checkIn: {
        __typename: "CheckIn",
        id: checkInId,
        userId: "me",
        cellarItemId: "b1",
        createdAt: new Date().toISOString(),
      },
    });
    assert.equal(avatars().length, 2, "held after the write");
    assert.equal(pendingAvatars().length, 0, "and no longer dimmed");
    assert.equal(refreshes, 1, "the page is asked for its own copy");
    assert.equal(button("Check In").disabled, false);

    // The refreshed page carries the row: still two avatars, not three.
    await render([
      { id: checkInId, createdAt: new Date().toISOString(), user: me },
      earlier,
    ]);
    assert.equal(avatars().length, 2);
    assert.deepEqual(notes, []);
  });

  test("a refused check-in is taken away, and says why", async () => {
    await render();
    await act(async () => button("Check In").click());
    await answer(0, {
      checkIn: {
        __typename: "ForbiddenError",
        message: "Not your cellar",
        code: "FORBIDDEN",
      },
    });
    assert.equal(avatars().length, 1);
    assert.equal(
      container.querySelector('[role="alert"]')?.textContent,
      "Not your cellar",
    );
    assert.deepEqual(notes, ["Couldn't check in"]);
    assert.equal(refreshes, 0);
  });

  test("Bulk Check In closes the picker on submit and draws everyone picked", async () => {
    await render([]);
    await act(async () => button("Bulk Check In").click());
    const samBox = document.getElementById("bulk-check-in-sam");
    const meBox = document.getElementById("bulk-check-in-me");
    assert.ok(samBox && meBox, "the picker lists the viewer and friends");
    await act(async () => {
      meBox.click();
    });
    await act(async () => {
      samBox.click();
    });
    const submit = [
      ...document.querySelectorAll('[role="dialog"] button'),
    ].find((b) => b.textContent?.trim() === "Check In") as
      | HTMLButtonElement
      | undefined;
    assert.ok(submit, "the picker's Check In");
    assert.ok(
      document.querySelector('[role="dialog"][data-state="open"]'),
      "the picker is open before submit",
    );
    await act(async () => submit.click());

    assert.equal(
      document.querySelector('[role="dialog"][data-state="open"]'),
      null,
      "the picker closed on submit, before the write answered",
    );
    assert.equal(avatars().length, 2);
    assert.equal(pendingAvatars().length, 2);
    assert.equal(writes[0]?.operation, "BulkCheckIn");
    assert.deepEqual(writes[0]?.variables.userIds, ["me", "sam"]);

    await answer(0, {
      bulkCheckIn: {
        __typename: "BulkCheckInPayload",
        cellarItemId: "b1",
        checkIns: {
          totalCount: 2,
          edges: [
            {
              node: {
                __typename: "CheckIn",
                id: "s1",
                userId: "me",
                cellarItemId: "b1",
                createdAt: new Date().toISOString(),
              },
            },
            {
              node: {
                __typename: "CheckIn",
                id: "s2",
                userId: "sam",
                cellarItemId: "b1",
                createdAt: new Date().toISOString(),
              },
            },
          ],
        },
      },
    });
    assert.equal(avatars().length, 2);
    assert.equal(pendingAvatars().length, 0);
    assert.equal(refreshes, 1);
  });
});

describe("mergeHeldRows", () => {
  test("held rows lead, and drop out once the page's rows carry them", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    const c = { id: "c" };
    assert.deepEqual(mergeHeldRows([a], [b, c]), [a, b, c]);
    assert.deepEqual(mergeHeldRows([a, b], [b, c]), [a, b, c]);
    assert.deepEqual(mergeHeldRows([], [c]), [c]);
  });
});
