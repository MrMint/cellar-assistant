import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cachesToPurge, purgeUserCaches } from "./purge-caches";

/** Every cache name serwist's `defaultCache` and our own rules create. */
const VIEWER_SPECIFIC = [
  "pages",
  "pages-rsc",
  "pages-rsc-prefetch",
  "others",
  "apis",
  "next-image",
  "next-data",
  "static-data-assets",
  "cross-origin",
];
const SHARED = [
  "serwist-precache-v2-https://cellar.example/",
  "static-font-assets",
  "static-image-assets",
  "next-static-js-assets",
  "static-js-assets",
  "static-style-assets",
  "google-fonts-webfonts",
  "static-wasm",
  "map-tiles",
];

describe("cachesToPurge", () => {
  test("purges every cache that holds what one viewer saw", () => {
    assert.deepEqual(cachesToPurge(VIEWER_SPECIFIC), VIEWER_SPECIFIC);
  });

  test("keeps the precache and the static assets every viewer shares", () => {
    assert.deepEqual(cachesToPurge(SHARED), []);
  });

  test("purges a cache it has never heard of", () => {
    // The allowlist is of what to keep: a runtime rule added later is
    // purged until someone decides it is safe to share.
    assert.deepEqual(cachesToPurge(["some-new-cache"]), ["some-new-cache"]);
  });
});

describe("purgeUserCaches", () => {
  const fakeStorage = (names: string[]) => {
    const deleted: string[] = [];
    return {
      deleted,
      storage: {
        keys: async () => [...names],
        delete: async (name: string) => {
          deleted.push(name);
          return true;
        },
      },
    };
  };

  test("deletes only the viewer-specific caches", async () => {
    const { storage, deleted } = fakeStorage([...SHARED, ...VIEWER_SPECIFIC]);
    const result = await purgeUserCaches(storage);
    assert.deepEqual(result, VIEWER_SPECIFIC);
    assert.deepEqual([...deleted].sort(), [...VIEWER_SPECIFIC].sort());
  });

  test("is a no-op without CacheStorage (an insecure origin)", async () => {
    assert.deepEqual(await purgeUserCaches(undefined), []);
  });

  test("never throws: sign-out must not fail on a cache", async () => {
    const original = console.error;
    console.error = () => {};
    try {
      const result = await purgeUserCaches({
        keys: async () => {
          throw new Error("SecurityError");
        },
        delete: async () => true,
      });
      assert.deepEqual(result, []);
    } finally {
      console.error = original;
    }
  });
});
