/**
 * The remembered "who with" is per account and forgotten on sign-out
 * (F-57, FR-9): a shared phone never offers one account another's friend.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { purgeUserCaches } from "@/lib/pwa/purge-caches";
import {
  companionsKey,
  forgetRememberedCompanions,
  readRememberedCompanions,
  rememberCompanions,
} from "./remembered-companions";

const memoryStore = (seed: Record<string, string> = {}) => {
  const data = new Map(Object.entries(seed));
  return {
    data,
    get length() {
      return data.size;
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
};

const SAM = { id: "sam", displayName: "Sam", avatarUrl: null };

describe("remembered companions", () => {
  test("a second account never reads the first one's companions", () => {
    const store = memoryStore();
    rememberCompanions("alice", [SAM], store);
    assert.deepEqual(readRememberedCompanions("alice", store), [SAM]);
    assert.deepEqual(readRememberedCompanions("bob", store), []);
  });

  test("nobody signed in reads and writes nothing", () => {
    const store = memoryStore({
      "ca.pour.lastCompanions": JSON.stringify([SAM]),
    });
    assert.deepEqual(readRememberedCompanions(null, store), []);
    rememberCompanions(null, [SAM], store);
    assert.equal(store.data.size, 1);
  });

  test("forgetting clears every account and the old per-device key, nothing else", () => {
    const store = memoryStore({
      "ca.pour.lastCompanions": "[]",
      [companionsKey("alice")]: "[]",
      [companionsKey("bob")]: "[]",
      "ca.theme": "dark",
    });
    forgetRememberedCompanions(store);
    assert.deepEqual([...store.data.keys()], ["ca.theme"]);
  });

  test("blocked storage never throws", () => {
    const broken = {
      length: 1,
      key: () => {
        throw new Error("blocked");
      },
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    assert.deepEqual(readRememberedCompanions("alice", broken), []);
    rememberCompanions("alice", [SAM], broken);
    forgetRememberedCompanions(broken);
  });

  test("sign-out's purge forgets them", async () => {
    const store = memoryStore({
      [companionsKey("alice")]: JSON.stringify([SAM]),
    });
    const previous = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );
    Object.defineProperty(globalThis, "localStorage", {
      value: store,
      configurable: true,
    });
    try {
      await purgeUserCaches(undefined);
      assert.equal(store.data.size, 0);
    } finally {
      if (previous === undefined) {
        delete (globalThis as { localStorage?: unknown }).localStorage;
      } else {
        Object.defineProperty(globalThis, "localStorage", previous);
      }
    }
  });
});
