import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  announceSave,
  detectPlatform,
  hasSeenFirstSave,
  isDismissedPermanently,
  isDismissedTemporarily,
  isPromptAllowed,
  PWA_DISMISS_KEY,
  PWA_DISMISS_PERMANENT_KEY,
  PWA_FIRST_SAVE_KEY,
  REMIND_LATER_DAYS,
  SAVED_EVENT,
} from "./install-prompt";

const store = (entries: Record<string, string> = {}) => ({
  getItem: (key: string) => entries[key] ?? null,
});
const throwing = {
  getItem: (): string | null => {
    throw new Error("SecurityError");
  },
};

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const CHROME_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";

describe("detectPlatform", () => {
  test("an iPhone is iOS, Safari", () => {
    assert.deepEqual(detectPlatform(IPHONE, 5), {
      ios: true,
      chromeIos: false,
    });
  });
  test("iPadOS reports a Mac; a touch screen gives it away (N15)", () => {
    assert.deepEqual(detectPlatform(IPAD_DESKTOP_UA, 5), {
      ios: true,
      chromeIos: false,
    });
    // A real Mac has no touch points.
    assert.equal(detectPlatform(IPAD_DESKTOP_UA, 0).ios, false);
  });
  test("Chrome on iOS gets the toolbar steps", () => {
    assert.deepEqual(detectPlatform(CHROME_IOS, 5), {
      ios: true,
      chromeIos: true,
    });
  });
  test("Android is not iOS (it gets the browser's own prompt)", () => {
    assert.deepEqual(detectPlatform(ANDROID, 5), {
      ios: false,
      chromeIos: false,
    });
  });
});

describe("dismissal", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  const daysAgo = (days: number) =>
    new Date(now.getTime() - days * 86_400_000).toISOString();

  test("nothing stored: the prompt may show", () => {
    assert.equal(isPromptAllowed(store(), now), true);
  });
  test("put off for good", () => {
    const s = store({ [PWA_DISMISS_PERMANENT_KEY]: "true" });
    assert.equal(isDismissedPermanently(s), true);
    assert.equal(isPromptAllowed(s, now), false);
  });
  test(`"Remind me later" holds for ${REMIND_LATER_DAYS} days`, () => {
    const recent = store({ [PWA_DISMISS_KEY]: daysAgo(REMIND_LATER_DAYS - 1) });
    assert.equal(isDismissedTemporarily(recent, now), true);
    assert.equal(isPromptAllowed(recent, now), false);
    const old = store({ [PWA_DISMISS_KEY]: daysAgo(REMIND_LATER_DAYS + 1) });
    assert.equal(isPromptAllowed(old, now), true);
  });
  test("storage that throws (private mode) never blocks or crashes", () => {
    assert.equal(isPromptAllowed(throwing, now), true);
    assert.equal(hasSeenFirstSave(throwing), false);
  });
});

describe("first save (N15)", () => {
  test("remembered once seen", () => {
    assert.equal(hasSeenFirstSave(store()), false);
    assert.equal(
      hasSeenFirstSave(store({ [PWA_FIRST_SAVE_KEY]: "true" })),
      true,
    );
  });
  test("a save announces itself on the given target", () => {
    const target = new EventTarget();
    let heard = 0;
    target.addEventListener(SAVED_EVENT, () => {
      heard += 1;
    });
    announceSave(target);
    assert.equal(heard, 1);
  });
});
