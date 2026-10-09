/**
 * X01: every landing goes to `/`, and the submit spinner persists until the
 * navigation is under way — no frame where a successful sign-in shows an idle
 * "Sign in" button again.
 *
 * Driven through happy-dom with `next/navigation` stood in for: the form's
 * busy flag is recorded on every render, together with whether the router
 * has been asked to leave yet.
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost/sign-in" });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const replaced: string[] = [];
let refreshed = 0;
const router = {
  push: () => {},
  replace: (href: string) => {
    replaced.push(href);
  },
  refresh: () => {
    refreshed += 1;
  },
  back: () => {},
  forward: () => {},
  prefetch: () => {},
};
mock.module("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/sign-in",
  useSearchParams: () => new URLSearchParams(),
}));

// `useAuthAction` re-reads the session after a success; answer "signed in".
globalThis.fetch = (async () =>
  new Response(JSON.stringify(null), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as unknown as typeof fetch;

const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { useAuthAction } = await import("@/lib/api/auth-client");
const { useLanding } = await import("./useLanding");
const { HOME_PATH } = await import("@/utilities/sanitize-return-to");

type Frame = { busy: boolean; left: boolean };

function Form({
  action,
  destination,
  frames,
  expose,
}: {
  action: () => Promise<{ data: unknown; error: { message: string } | null }>;
  destination: string;
  frames: Frame[];
  expose: (submit: () => Promise<boolean>) => void;
}) {
  const { run, pending } = useAuthAction(action);
  const { land, landing } = useLanding(destination);
  frames.push({ busy: pending || landing, left: replaced.length > 0 });
  expose(() => run(undefined, land));
  return null;
}

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  replaced.length = 0;
  refreshed = 0;
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const mount = async (
  action: () => Promise<{ data: unknown; error: { message: string } | null }>,
  destination = HOME_PATH,
) => {
  const frames: Frame[] = [];
  let submit: () => Promise<boolean> = async () => false;
  await act(async () =>
    root.render(
      <Form
        action={action}
        destination={destination}
        frames={frames}
        expose={(fn) => {
          submit = fn;
        }}
      />,
    ),
  );
  return { frames, submit: () => submit() };
};

describe("landing (X01)", () => {
  test("a sign-in with nowhere else to go lands on Home, /", () => {
    assert.equal(HOME_PATH, "/");
  });

  test("busy from the tap until the router is asked to leave — never idle between", async () => {
    let resolve: (value: { data: unknown; error: null }) => void = () => {};
    const { frames, submit } = await mount(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    let ok: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      ok = submit();
    });
    await act(async () => {
      resolve({ data: {}, error: null });
      await ok;
    });

    assert.equal(await ok, true);
    assert.deepEqual(replaced, ["/"]);
    assert.equal(refreshed, 1);
    const firstBusy = frames.findIndex((frame) => frame.busy);
    assert.ok(firstBusy > 0, "the form went busy on submit");
    const idleBeforeLeaving = frames
      .slice(firstBusy)
      .filter((frame) => !frame.busy && !frame.left);
    assert.deepEqual(
      idleBeforeLeaving,
      [],
      "a frame showed an idle button after a successful sign-in",
    );
  });

  test("a returnTo is where it lands instead", async () => {
    const { submit } = await mount(
      async () => ({ data: {}, error: null }),
      "/cellars/abc/items",
    );
    await act(async () => {
      await submit();
    });
    assert.deepEqual(replaced, ["/cellars/abc/items"]);
  });

  test("a refused sign-in goes idle again and goes nowhere", async () => {
    const { frames, submit } = await mount(async () => ({
      data: null,
      error: { message: "Invalid email or password" },
    }));
    let ok = true;
    await act(async () => {
      ok = await submit();
    });
    assert.equal(ok, false);
    assert.deepEqual(replaced, []);
    assert.equal(frames.at(-1)?.busy, false);
  });
});
