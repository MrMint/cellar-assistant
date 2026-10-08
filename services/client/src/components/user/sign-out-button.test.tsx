/**
 * `SignOutButton`'s failure modes. The one that matters: once better-auth has
 * cleared the cookie, `completeSignOut` (a server action) is answered by the
 * proxy's redirect and rejects — and the viewer must still land on /sign-in.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/me" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const calls: string[] = [];
let signOutError: { message: string } | null = null;
let completeRejects = false;

mock.module("next/navigation", () => ({
  useRouter: () => ({
    replace: (href: string) => calls.push(`replace ${href}`),
    refresh: () => calls.push("refresh"),
    push: () => {},
  }),
}));
mock.module("@/lib/api/auth-client", () => ({
  authClient: {
    signOut: async () => {
      calls.push("signOut");
      return { error: signOutError };
    },
  },
}));
mock.module("@/lib/pwa/purge-caches", () => ({
  purgeUserCaches: async () => {
    calls.push("purge");
  },
}));
mock.module("@/lib/auth/sign-out", () => ({
  completeSignOut: async () => {
    calls.push("complete");
    if (completeRejects) {
      throw new Error("An unexpected response was received from the server.");
    }
  },
}));
mock.module("@/components/app/notify", () => ({
  notify: (message: string) => calls.push(`notify ${message}`),
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { SignOutButton } = await import("./SignOutButton");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
const quiet = { warn: console.warn, error: console.error };

beforeEach(() => {
  calls.length = 0;
  signOutError = null;
  completeRejects = false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  console.warn = () => {};
  console.error = () => {};
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  console.warn = quiet.warn;
  console.error = quiet.error;
});

const signOut = async () => {
  await act(async () => root.render(<SignOutButton />));
  await act(async () => {
    container.querySelector("button")?.click();
    await new Promise((r) => setTimeout(r, 0));
  });
};

describe("SignOutButton", () => {
  test("signs out, purges, completes, then replaces with /sign-in", async () => {
    await signOut();
    assert.deepEqual(calls, [
      "signOut",
      "purge",
      "complete",
      "replace /sign-in",
      "refresh",
    ]);
  });

  test("a rejected completeSignOut (proxy redirect) still lands on /sign-in", async () => {
    completeRejects = true;
    await signOut();
    assert.deepEqual(calls, [
      "signOut",
      "purge",
      "complete",
      "replace /sign-in",
      "refresh",
    ]);
  });

  test("a failed better-auth sign-out stays put, says so and keeps the cache", async () => {
    signOutError = { message: "network" };
    await signOut();
    assert.deepEqual(calls, [
      "signOut",
      "notify Couldn't sign out. Try again.",
    ]);
  });
});
