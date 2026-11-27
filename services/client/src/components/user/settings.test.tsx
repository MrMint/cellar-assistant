/**
 * Settings (Shell-Me): Appearance writes the theme through MC-theme — the
 * `theme` cookie the pre-paint script reads (L45) and `<html data-theme>` at
 * once — and Sound and haptics write MC-feedback's device settings. Driven
 * through the real controls, so a control wired to the wrong setter fails.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/me/settings" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, refresh: () => {}, push: () => {} }),
  usePathname: () => "/me/settings",
}));
mock.module("@/components/map/hooks/useGeolocation", () => ({
  useGeolocation: () => ({
    permission: "prompt",
    request: () => {},
    dismiss: () => {},
  }),
}));
mock.module("./SignOutButton", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { SettingsView } = await import("./SettingsView");
const { feedbackSettings } = await import("@/lib/feedback/settings");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

const radio = (group: string, name: string): HTMLElement => {
  const groupEl = container.querySelector(`[aria-label="${group}"]`);
  assert.ok(groupEl, `no ${group} group`);
  const found = [
    ...groupEl.querySelectorAll<HTMLElement>('[role="radio"]'),
  ].find((el) => el.textContent?.trim() === name);
  assert.ok(found, `no ${name} in ${group}`);
  return found;
};

const press = async (el: HTMLElement) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

beforeEach(async () => {
  // biome-ignore lint/suspicious/noDocumentCookie: clearing what setThemeChoice wrote.
  document.cookie = "theme=; max-age=0; path=/";
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme-choice");
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <SettingsView profile={{ displayName: "Test One", avatarUrl: null }} />,
    );
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("Appearance (MC-theme)", () => {
  test("Light writes the theme cookie and paints light at once", async () => {
    await press(radio("Appearance", "Light"));
    assert.match(document.cookie, /(?:^|; )theme=light(?:;|$)/);
    assert.equal(document.documentElement.getAttribute("data-theme"), "light");
    assert.equal(
      radio("Appearance", "Light").getAttribute("aria-checked"),
      "true",
    );
  });

  test("Dark and Phone are written as chosen", async () => {
    await press(radio("Appearance", "Dark"));
    assert.match(document.cookie, /(?:^|; )theme=dark(?:;|$)/);
    await press(radio("Appearance", "Phone"));
    assert.match(document.cookie, /(?:^|; )theme=phone(?:;|$)/);
    assert.equal(
      document.documentElement.getAttribute("data-theme-choice"),
      "phone",
    );
  });
});

describe("Sound and haptics (MC-feedback)", () => {
  test("the Sounds switch turns sounds off on this device, and only sounds", async () => {
    const sounds = container.querySelector<HTMLElement>("#settings-sounds");
    assert.ok(sounds);
    assert.equal(sounds.getAttribute("aria-checked"), "true");
    await press(sounds);
    assert.equal(feedbackSettings().sounds, false);
    assert.equal(feedbackSettings().haptics, true);
  });

  test("Haptics Off turns haptics off, and On back on", async () => {
    await press(radio("Haptics", "Off"));
    assert.equal(feedbackSettings().haptics, false);
    assert.equal(feedbackSettings().sounds, true);
    await press(radio("Haptics", "On"));
    assert.equal(feedbackSettings().haptics, true);
  });
});

describe("rows", () => {
  test("Edit profile, Use my location and Sign out are there; Install only when offered", () => {
    const text = container.textContent ?? "";
    for (const label of [
      "Edit profile",
      "Name and picture",
      "Use my location",
      "Sign out",
    ]) {
      assert.ok(text.includes(label), label);
    }
    // happy-dom is no iPhone and has no install prompt: nothing to offer.
    assert.ok(!text.includes("Install the app"));
  });
});
