import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { pinnedLine } from "@/components/capture/new-place";
import {
  createGeolocationStore,
  type GeolocationDeps,
  locationButtonAction,
  locationPrePromptVisible,
  type PermissionLike,
} from "./geolocation-store";

type Callback = (position: GeolocationPosition) => void;
type ErrorCallback = (error: GeolocationPositionError) => void;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A fake browser: records every prompt-raising call, answers on demand. */
function fakeBrowser(permission: string | null) {
  const calls: string[] = [];
  let success: Callback | null = null;
  let failure: ErrorCallback | null = null;
  let dismissed = false;
  const status: PermissionLike | null =
    permission === null ? null : { state: permission, onchange: null };
  const deps: GeolocationDeps = {
    geolocation: {
      getCurrentPosition: (ok, err) => {
        calls.push("getCurrentPosition");
        success = ok;
        failure = err ?? null;
      },
      watchPosition: (ok, err) => {
        calls.push("watchPosition");
        success = ok;
        failure = err ?? null;
        return 1;
      },
    },
    queryPermission: async () => status,
    readDismissed: () => dismissed,
    writeDismissed: () => {
      dismissed = true;
    },
    onFix: () => calls.push("cookie"),
    timeoutMs: 10_000,
  };
  return {
    deps,
    calls,
    status,
    fix: (latitude: number, longitude: number, accuracy?: number) =>
      success?.({
        coords: { latitude, longitude, accuracy },
      } as GeolocationPosition),
    deny: () =>
      failure?.({
        code: 1,
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError),
  };
}

describe("geolocation store (D14)", () => {
  test("a person not yet asked: the map does not wait, our one line shows, and nothing prompts until they tap", async () => {
    const browser = fakeBrowser("prompt");
    const store = createGeolocationStore(browser.deps);
    store.subscribe(() => {});
    assert.equal(
      store.getSnapshot().loading,
      true,
      "while permission is looked up",
    );
    await flush();

    const state = store.getSnapshot();
    assert.equal(state.loading, false);
    assert.equal(state.permission, "prompt");
    assert.equal(locationPrePromptVisible(state), true);
    assert.deepEqual(browser.calls, [], "the OS prompt is not raised on open");

    store.request();
    assert.deepEqual(browser.calls, ["getCurrentPosition", "watchPosition"]);
    assert.equal(locationPrePromptVisible(store.getSnapshot()), false);

    browser.fix(43.07, -89.38);
    assert.deepEqual(store.getSnapshot().location, {
      latitude: 43.07,
      longitude: -89.38,
      accuracy: null,
    });
    assert.equal(store.getSnapshot().permission, "granted");
    assert.ok(browser.calls.includes("cookie"));
  });

  test("no Permissions API is treated as not yet asked", async () => {
    const browser = fakeBrowser(null);
    const store = createGeolocationStore(browser.deps);
    store.subscribe(() => {});
    await flush();
    assert.equal(locationPrePromptVisible(store.getSnapshot()), true);
    assert.deepEqual(browser.calls, []);
  });

  test("already allowed: watch at once, no explanation", async () => {
    const browser = fakeBrowser("granted");
    const store = createGeolocationStore(browser.deps);
    store.subscribe(() => {});
    await flush();
    assert.deepEqual(browser.calls, ["getCurrentPosition", "watchPosition"]);
    assert.equal(locationPrePromptVisible(store.getSnapshot()), false);
    assert.equal(store.getSnapshot().loading, true, "until the first fix");
    browser.fix(1, 2);
    assert.equal(store.getSnapshot().loading, false);
  });

  test("refused before: nothing is asked and the button explains", async () => {
    const browser = fakeBrowser("denied");
    const store = createGeolocationStore(browser.deps);
    store.subscribe(() => {});
    await flush();
    const state = store.getSnapshot();
    assert.equal(state.loading, false);
    assert.equal(locationPrePromptVisible(state), false);
    assert.equal(locationButtonAction(state), "explain-denied");
    assert.deepEqual(browser.calls, []);
  });

  test("'Not now' hides the line for the session and asks nothing", async () => {
    const browser = fakeBrowser("prompt");
    const store = createGeolocationStore(browser.deps);
    store.subscribe(() => {});
    await flush();
    store.dismiss();
    assert.equal(locationPrePromptVisible(store.getSnapshot()), false);
    assert.equal(locationButtonAction(store.getSnapshot()), "request");
    assert.deepEqual(browser.calls, []);

    const again = createGeolocationStore(browser.deps);
    again.subscribe(() => {});
    await flush();
    assert.equal(locationPrePromptVisible(again.getSnapshot()), false);
  });

  test("a no at the OS prompt becomes denied, and the map stops waiting", async () => {
    const browser = fakeBrowser("prompt");
    const store = createGeolocationStore(browser.deps);
    store.subscribe(() => {});
    await flush();
    store.request();
    browser.deny();
    const state = store.getSnapshot();
    assert.equal(state.permission, "denied");
    assert.equal(state.loading, false);
    assert.equal(locationButtonAction(state), "explain-denied");
  });

  test("a no reported through onchange after the position error still stops the wait", async () => {
    const browser = fakeBrowser("prompt");
    const store = createGeolocationStore(browser.deps);
    store.subscribe(() => {});
    await flush();
    store.request();
    browser.deny();
    const status = browser.status;
    assert.ok(status);
    (status as { state: string }).state = "denied";
    status.onchange?.call(status, new Event("change"));
    assert.equal(store.getSnapshot().loading, false);
    assert.equal(store.getSnapshot().permission, "denied");
  });

  test("a no at the OS prompt, then allowed in site settings, starts a fresh watch", async () => {
    const browser = fakeBrowser("prompt");
    const store = createGeolocationStore(browser.deps);
    store.subscribe(() => {});
    await flush();
    store.request();
    browser.deny();
    const status = browser.status;
    assert.ok(status);
    (status as { state: string }).state = "granted";
    status.onchange?.call(status, new Event("change"));
    assert.deepEqual(browser.calls, [
      "getCurrentPosition",
      "watchPosition",
      "getCurrentPosition",
      "watchPosition",
    ]);
    browser.fix(1, 2);
    assert.deepEqual(store.getSnapshot().location, {
      latitude: 1,
      longitude: 2,
      accuracy: null,
    });
  });

  test("a permission granted elsewhere (site settings) starts the watch", async () => {
    const browser = fakeBrowser("prompt");
    const store = createGeolocationStore(browser.deps);
    store.subscribe(() => {});
    await flush();
    const status = browser.status;
    assert.ok(status);
    (status as { state: string }).state = "granted";
    status.onchange?.call(status, new Event("change"));
    assert.deepEqual(browser.calls, ["getCurrentPosition", "watchPosition"]);
  });

  test("no geolocation at all is unsupported, never loading", () => {
    const browser = fakeBrowser("prompt");
    const store = createGeolocationStore({
      ...browser.deps,
      geolocation: null,
    });
    store.subscribe(() => {});
    const state = store.getSnapshot();
    assert.equal(state.permission, "unsupported");
    assert.equal(state.loading, false);
    assert.equal(locationButtonAction(state), "unsupported");
  });

  test("H-22: the fix keeps its accuracy, through to the new-place sheet's line", async () => {
    const browser = fakeBrowser("granted");
    const store = createGeolocationStore(browser.deps);
    store.subscribe(() => {});
    await flush();
    browser.fix(51.5, -0.12, 12.4);
    const location = store.getSnapshot().location;
    assert.deepEqual(location, {
      latitude: 51.5,
      longitude: -0.12,
      accuracy: 12.4,
    });
    assert.equal(
      pinnedLine(location?.accuracy),
      "Pinned at your location, about 12 m accurate",
    );
  });

  test("H-22: a sharper fix at the same spot updates the accuracy without a second cookie write", async () => {
    const browser = fakeBrowser("granted");
    const store = createGeolocationStore(browser.deps);
    store.subscribe(() => {});
    await flush();
    browser.fix(51.5, -0.12, 80);
    browser.fix(51.5, -0.12, 9);
    assert.equal(store.getSnapshot().location?.accuracy, 9);
    assert.equal(
      browser.calls.filter((call) => call === "cookie").length,
      1,
      "the position did not move",
    );
  });

  test("H-22: a fix without an accuracy is null, and the line says so plainly", async () => {
    const browser = fakeBrowser("granted");
    const store = createGeolocationStore(browser.deps);
    store.subscribe(() => {});
    await flush();
    browser.fix(51.5, -0.12);
    assert.equal(store.getSnapshot().location?.accuracy, null);
  });
});
