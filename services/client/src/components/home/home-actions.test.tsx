/**
 * Home's writes, in a DOM (fix-b12): Accept answers a friend request once
 * however fast it is tapped (F-124); Drink soon's Open takes the row and its
 * count away and refreshes however the toast closes (F-125, F-128); its Undo
 * is heard once and says so when the write back is refused (F-126). urql,
 * the router, the toasts and the cues are stood in for.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/" });
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

type Toast = {
  message: string;
  options: {
    undo?: () => void | Promise<void>;
    onAutoClose?: () => void;
    onClose?: () => void;
    tone?: string;
  };
};

const calls: { name: string; variables: unknown }[] = [];
const toasts: Toast[] = [];
const cues: string[] = [];
let refreshes = 0;
/** Each operation's answer; a pending promise holds the request open. */
const answers: Record<string, () => Promise<unknown>> = {};

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
        calls.push({ name, variables });
        return (await answers[name]?.()) ?? { data: undefined };
      },
    ];
  },
}));
mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    refresh: () => {
      refreshes += 1;
    },
    back: () => {},
    prefetch: () => {},
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
mock.module("next/image", () => ({
  default: () => null,
}));
mock.module("@/components/app/notify", () => ({
  notify: (message: string, options: Toast["options"] = {}) => {
    toasts.push({ message, options });
    return message;
  },
  dismissNotification: () => {},
  pauseToasts: () => () => {},
  UNDO_TOAST_MS: 5000,
}));
const realFeedback = await import("@/lib/feedback");
mock.module("@/lib/feedback", () => ({
  ...realFeedback,
  feedback: (name: string) => {
    cues.push(name);
  },
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { HomeInbox } = await import("./HomeInbox");
const { ContinueSection } = await import("./ContinueShelf");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  calls.length = 0;
  toasts.length = 0;
  cues.length = 0;
  refreshes = 0;
  for (const key of Object.keys(answers)) delete answers[key];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const settle = async (ms = 20) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};

const render = async (node: React.ReactNode) => {
  await act(async () => root.render(node));
  await settle(10);
};

const buttonNamed = (name: string): HTMLElement => {
  const found = [...container.querySelectorAll("button")].find(
    (button) =>
      button.getAttribute("aria-label") === name ||
      button.textContent?.trim() === name,
  );
  if (!(found instanceof HTMLElement)) throw new Error(`no "${name}" button`);
  return found;
};

const sectionCount = (headingId: string): string =>
  container.querySelector(`#${headingId}`)?.parentElement?.textContent ?? "";

describe("HomeInbox Accept (F-124)", () => {
  test("a double tap sends one acceptFriendRequest and one toast", async () => {
    let release: (value: unknown) => void = () => {};
    answers.AcceptFriendRequestAction = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    await render(
      <HomeInbox
        initialJobs={[]}
        suggestions={[]}
        requests={[
          {
            id: "r1",
            status: "PENDING",
            user: { id: "u2", displayName: "Demo Two", avatarUrl: null },
          },
        ]}
        initialSeen={[]}
      />,
    );
    const accept = buttonNamed("Accept");
    await act(async () => {
      accept.click();
      accept.click();
    });
    release({
      data: {
        acceptFriendRequest: { __typename: "AcceptFriendRequestPayload" },
      },
    });
    await settle();
    assert.equal(
      calls.filter((call) => call.name === "AcceptFriendRequestAction").length,
      1,
    );
    assert.deepEqual(
      toasts.map((toast) => toast.message),
      ["Demo Two is your friend"],
    );
  });
});

const sealedRow = (id: string) => ({
  id,
  cellarId: "c1",
  href: `/cellars/c1/beers/${id}`,
  type: "BEER" as const,
  title: `Hazy ${id}`,
  name: `Hazy ${id}`,
  photoUrl: null,
  past: true,
  line: "Sealed · ended Jan 2026",
  typical: "Typical for IPA",
});
const opened = {
  data: { openCellarItem: { __typename: "CellarItem", id: "s1" } },
};

describe("Drink soon", () => {
  test("the head counts the rows the list can reach, not the server's mixed total (F-128)", async () => {
    await render(
      <ContinueSection
        bottles={[]}
        sealed={["s1", "s2", "s3", "s4", "s5", "s6"].map(sealedRow)}
        serverNow={Date.parse("2026-10-09T12:00:00.000Z")}
      />,
    );
    assert.match(sectionCount("soon-heading"), /Drink soon\s*6/);
    await act(async () => buttonNamed("Show more · 2").click());
    assert.equal(
      container.querySelectorAll('[data-kind="drink-soon-sealed"]').length,
      6,
    );
  });

  test("Open drops the count at once and refreshes when the toast is swiped away (F-125)", async () => {
    answers.OpenCellarItem = async () => opened;
    await render(
      <ContinueSection
        bottles={[]}
        sealed={["s1", "s2", "s3"].map(sealedRow)}
        serverNow={Date.parse("2026-10-09T12:00:00.000Z")}
      />,
    );
    await act(async () => buttonNamed("Open Hazy s1").click());
    await settle();
    assert.match(sectionCount("soon-heading"), /Drink soon\s*2/);
    const toast = toasts.at(-1);
    assert.equal(toast?.message, "Hazy s1 opened");
    toast?.options.onClose?.();
    assert.equal(refreshes, 1, "a dismissed toast still refreshes Home");
  });

  test("Undo is heard once, and a refused write back says so (F-126)", async () => {
    answers.OpenCellarItem = async () => opened;
    answers.UpdateCellarItem = async () => ({
      data: {
        updateCellarItem: {
          __typename: "ForbiddenError",
          code: "FORBIDDEN",
          message: "no",
        },
      },
    });
    await render(
      <ContinueSection
        bottles={[]}
        sealed={["s1", "s2"].map(sealedRow)}
        serverNow={Date.parse("2026-10-09T12:00:00.000Z")}
      />,
    );
    await act(async () => buttonNamed("Open Hazy s1").click());
    await settle();
    cues.length = 0;
    // notify plays the undo cue for an "Undo" action itself (notify.ts).
    cues.push("undo");
    await act(async () => {
      await toasts.at(-1)?.options.undo?.();
    });
    await settle();
    assert.equal(cues.filter((cue) => cue === "undo").length, 1);
    assert.ok(cues.includes("refuse"), "a refused Undo is felt");
    assert.equal(toasts.at(-1)?.message, "Hazy s1 is still open");
    assert.equal(toasts.at(-1)?.options.tone, "error");
    assert.equal(
      container.querySelectorAll('[data-kind="drink-soon-sealed"]').length,
      1,
      "the bottle stays opened, so its row stays away",
    );
  });
});
