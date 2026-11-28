/**
 * Edit profile's Save (F-131, CE-6): a refused save is never silent, the
 * sheet stays open while a save runs, and a Save after a partial failure
 * (the photo landed, the name was refused) does not upload the photo again.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!GlobalRegistrator.isRegistered)
  GlobalRegistrator.register({ url: "http://localhost/me/settings" });
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
URL.createObjectURL = () => "blob:photo";
URL.revokeObjectURL = () => {};

mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    back: () => {},
    refresh: () => {},
    prefetch: () => {},
  }),
  usePathname: () => "/me/settings",
  useSearchParams: () => new URLSearchParams(),
}));

type Notice = { message: string; tone?: string };
let notices: Notice[] = [];
mock.module("@/components/app/notify", () => ({
  notify: (message: string, options: Omit<Notice, "message"> = {}) => {
    notices.push({ message, ...options });
  },
}));

let uploads = 0;
let releaseUpload: (() => void) | null = null;
let holdUpload = false;
// Without --isolate, Bun's module mocks leak into avatar.test.ts, which
// tests the real saveAvatar: this one counts and holds the upload only inside
// this file's tests (`fake`), and is the real function everywhere else.
let fake = false;
const realAvatar = { ...(await import("./avatar")) };
mock.module("./avatar", () => ({
  ...realAvatar,
  saveAvatar: async (...args: Parameters<typeof realAvatar.saveAvatar>) => {
    if (!fake) return realAvatar.saveAvatar(...args);
    uploads += 1;
    if (holdUpload) await new Promise<void>((r) => (releaseUpload = r));
    return "file1";
  },
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { Client, Provider, fetchExchange } = await import("urql");
const { ProfileEditor } = await import("./ProfileEditor");
const { EditProfileSheet } = await import("./EditProfileSheet");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
let nameWrites = 0;
let refuseName = 0;

beforeEach(() => {
  notices = [];
  uploads = 0;
  nameWrites = 0;
  refuseName = 0;
  holdUpload = false;
  releaseUpload = null;
  fake = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  fake = false;
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const fakeFetch = async (_url: unknown, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body));
  if (!/updateProfile/.test(body.query)) throw new Error("unexpected call");
  nameWrites += 1;
  const refused = refuseName > 0;
  if (refused) refuseName -= 1;
  const payload = refused
    ? {
        __typename: "ValidationError",
        message: "That name is taken",
        code: "INVALID",
        reason: null,
      }
    : { __typename: "UserProfile", id: "u1", displayName: "New" };
  return new Response(JSON.stringify({ data: { updateProfile: payload } }), {
    headers: { "content-type": "application/json" },
  });
};

const client = () =>
  new Client({
    url: "http://localhost/api/graphql",
    exchanges: [fetchExchange],
    fetch: fakeFetch as typeof fetch,
  });

const profile = { displayName: "Old", avatarUrl: null };

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

const typeName = async (value: string) => {
  const input = document.querySelector<HTMLInputElement>(
    'input[name="displayName"]',
  );
  if (input === null) throw new Error("no name field");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const pickPhoto = async () => {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error("no file input");
  await act(async () => {
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["x"], "me.jpg", { type: "image/jpeg" })],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

const save = async () => {
  const button = [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === "Save",
  );
  if (button === undefined) throw new Error("no Save button");
  await act(async () => {
    button.click();
    await settle();
  });
};

describe("ProfileEditor save (F-131)", () => {
  test("a refused name says so in a toast, not only in the form", async () => {
    refuseName = 1;
    await act(async () =>
      root.render(
        <Provider value={client()}>
          <ProfileEditor profile={profile} />
        </Provider>,
      ),
    );
    await typeName("New");
    await save();
    assert.ok(
      notices.some(
        (n) => n.tone === "error" && /That name is taken/.test(n.message),
      ),
      JSON.stringify(notices),
    );
  });

  test("the photo landed and the name was refused: Save again sends only the name", async () => {
    refuseName = 1;
    await act(async () =>
      root.render(
        <Provider value={client()}>
          <ProfileEditor profile={profile} />
        </Provider>,
      ),
    );
    await pickPhoto();
    await typeName("New");
    await save();
    assert.equal(uploads, 1);
    assert.equal(nameWrites, 1);
    await save();
    assert.equal(uploads, 1, "the photo is not uploaded twice");
    assert.equal(nameWrites, 2);
    assert.ok(notices.some((n) => n.message === "Profile saved"));
  });
});

describe("EditProfileSheet while saving (F-131)", () => {
  test("Escape does not close it mid-save; it closes once the save is done", async () => {
    holdUpload = true;
    const changes: boolean[] = [];
    await act(async () =>
      root.render(
        <Provider value={client()}>
          <EditProfileSheet
            open
            onOpenChange={(open) => changes.push(open)}
            profile={profile}
          />
        </Provider>,
      ),
    );
    await pickPhoto();
    await save();
    assert.equal(uploads, 1);
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      await settle();
    });
    assert.deepEqual(changes, [], "still open while saving");
    await act(async () => {
      releaseUpload?.();
      await settle();
    });
    assert.deepEqual(changes, [false], "closed by the finished save");
  });
});
