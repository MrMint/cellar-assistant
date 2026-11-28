import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  CAPTURE_PREFS_KEY,
  defaultCaptureMode,
  defaultCellarId,
  defaultItemType,
  type PrefsStorage,
  readCapturePrefs,
  rememberCapturePrefs,
} from "./capture-prefs.ts";

const memory = (
  initial: Record<string, string> = {},
): PrefsStorage & {
  data: Record<string, string>;
} => {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
};

const throwing: PrefsStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("capture prefs storage", () => {
  test("remembers and merges", () => {
    const storage = memory();
    rememberCapturePrefs({ itemType: "BEER" }, storage);
    rememberCapturePrefs({ cellarId: "c1", mode: "menu" }, storage);
    assert.deepEqual(readCapturePrefs(storage), {
      itemType: "BEER",
      cellarId: "c1",
      mode: "menu",
    });
  });

  test("drops values this build does not know, and junk", () => {
    const storage = memory({
      [CAPTURE_PREFS_KEY]: JSON.stringify({
        mode: "shelf",
        itemType: "CIDER",
        cellarId: "",
      }),
    });
    assert.deepEqual(readCapturePrefs(storage), {});
    assert.deepEqual(
      readCapturePrefs(memory({ [CAPTURE_PREFS_KEY]: "{not json" })),
      {},
    );
  });

  test("a storage that throws, or none at all, is the defaults", () => {
    assert.deepEqual(readCapturePrefs(throwing), {});
    assert.doesNotThrow(() =>
      rememberCapturePrefs({ mode: "bottle" }, throwing),
    );
    assert.deepEqual(readCapturePrefs(null), {});
  });
});

describe("defaults (X05: last used, never a classifier)", () => {
  test("mode: the entry's, else the last used, else Bottle", () => {
    assert.equal(defaultCaptureMode("recipe", { mode: "menu" }), "recipe");
    assert.equal(defaultCaptureMode(undefined, { mode: "menu" }), "menu");
    assert.equal(defaultCaptureMode(null, {}), "bottle");
  });

  test("type: the route's, else the last used, else wine", () => {
    assert.equal(defaultItemType("SAKE", { itemType: "BEER" }), "SAKE");
    assert.equal(defaultItemType(null, { itemType: "BEER" }), "BEER");
    assert.equal(defaultItemType(undefined, {}), "WINE");
  });

  test("cellar: pinned, else remembered if still addable, else the first", () => {
    const addable = [{ id: "recent" }, { id: "home" }];
    assert.equal(
      defaultCellarId("pinned", { cellarId: "home" }, addable),
      "pinned",
    );
    assert.equal(defaultCellarId(null, { cellarId: "home" }, addable), "home");
    // Remembered, but no longer one the viewer may add to.
    assert.equal(
      defaultCellarId(null, { cellarId: "gone" }, addable),
      "recent",
    );
    assert.equal(defaultCellarId(null, {}, []), null);
  });
});
