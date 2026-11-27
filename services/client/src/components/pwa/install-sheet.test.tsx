/**
 * The install sheet (Shell-Entry): Later puts it off for a while, Stop
 * asking puts it off for good and says where it went ("it's in Settings")
 * with Undo, and Settings' row opens it whatever was said before. Each
 * answer writes one device setting and only that one. urql, analytics and
 * the toast are stood in for; the sheet is the real one.
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

const toasts: { message: string; undo?: () => void }[] = [];

mock.module("urql", () => ({
  useQuery: () => [{ data: undefined, fetching: false }, () => {}],
}));
mock.module("@vercel/analytics/react", () => ({ track: () => {} }));
mock.module("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
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
const { InstallPwaDialog } = await import(
  "@/components/common/InstallPwaDialog"
);
const { openInstallSheet, resetInstallOfferForTests } = await import(
  "./install-offer"
);
const { PWA_DISMISS_KEY, PWA_DISMISS_PERMANENT_KEY } = await import(
  "./install-prompt"
);

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

const button = (name: string): HTMLButtonElement => {
  const found = [...document.body.querySelectorAll("button")].find(
    (el) => el.textContent?.trim() === name,
  );
  assert.ok(found, `a ${name} button`);
  return found;
};

const open = async () => {
  await act(async () => {
    openInstallSheet();
  });
  assert.ok(
    document.body.textContent?.includes("Install the app"),
    "the sheet is open",
  );
};

beforeEach(async () => {
  resetInstallOfferForTests();
  localStorage.clear();
  toasts.length = 0;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<InstallPwaDialog />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("the install sheet", () => {
  test("Settings' row opens it, with its line", async () => {
    await open();
    assert.ok(
      document.body.textContent?.includes(
        "It opens full screen, like any app.",
      ),
    );
  });

  test("Later puts it off for a while, and only that", async () => {
    await open();
    await act(async () => button("Later").click());
    assert.ok(localStorage.getItem(PWA_DISMISS_KEY));
    assert.equal(localStorage.getItem(PWA_DISMISS_PERMANENT_KEY), null);
    assert.equal(toasts.length, 0);
  });

  test("Stop asking puts it off for good, says where it went, and Undo takes it back", async () => {
    await open();
    await act(async () => button("Stop asking").click());
    assert.equal(localStorage.getItem(PWA_DISMISS_PERMANENT_KEY), "true");
    assert.equal(localStorage.getItem(PWA_DISMISS_KEY), null);
    assert.equal(toasts[0]?.message, "Won't ask again · it's in Settings");
    await act(async () => toasts[0]?.undo?.());
    assert.equal(localStorage.getItem(PWA_DISMISS_PERMANENT_KEY), null);
  });
});
