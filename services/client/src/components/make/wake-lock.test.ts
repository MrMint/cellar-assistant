import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { acquireWakeLock, wakeLockSupported } from "./wake-lock";

describe("screen wake lock (ux-c L08), feature-detected", () => {
  test("without navigator.wakeLock: unsupported, and acquiring is a quiet null", async () => {
    assert.equal(wakeLockSupported({}), false);
    assert.equal(wakeLockSupported(undefined), false);
    assert.equal(await acquireWakeLock({}), null);
    assert.equal(await acquireWakeLock(undefined), null);
  });

  test("with navigator.wakeLock: asks for the screen, and release releases it", async () => {
    const asked: string[] = [];
    let released = 0;
    const nav = {
      wakeLock: {
        request: async (type: "screen") => {
          asked.push(type);
          return {
            release: async () => {
              released += 1;
            },
          };
        },
      },
    };
    assert.equal(wakeLockSupported(nav), true);
    const release = await acquireWakeLock(nav);
    assert.deepEqual(asked, ["screen"]);
    assert.notEqual(release, null);
    await release?.();
    assert.equal(released, 1);
  });

  test("a refused request (low battery, hidden tab) is a null, not a throw", async () => {
    const nav = {
      wakeLock: {
        request: async () => {
          throw new DOMException("not allowed", "NotAllowedError");
        },
      },
    };
    assert.equal(await acquireWakeLock(nav), null);
  });

  test("a release the browser already did is swallowed", async () => {
    const nav = {
      wakeLock: {
        request: async () => ({
          release: async () => {
            throw new Error("already released");
          },
        }),
      },
    };
    const release = await acquireWakeLock(nav);
    await release?.();
  });
});
