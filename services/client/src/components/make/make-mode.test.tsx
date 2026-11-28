/**
 * L08 Make mode in a DOM: it is full screen inside the shell, not a second
 * `<main>` under the tab bar (CR-5), and its exits go back rather than
 * pushing the recipe again, so the next Back does not re-enter Make (CR-6).
 */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!GlobalRegistrator.isRegistered)
  GlobalRegistrator.register({ url: "http://localhost/recipes/r1/make" });
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

let calls: string[] = [];
mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: (href: string) => calls.push(`push ${href}`),
    replace: (href: string) => calls.push(`replace ${href}`),
    back: () => calls.push("back"),
    refresh: () => {},
    prefetch: () => {},
  }),
  usePathname: () => "/recipes/r1/make",
  useSearchParams: () => new URLSearchParams(),
}));

type Notice = { message: string; undo?: () => void; actionLabel?: string };
let notices: Notice[] = [];
mock.module("@/components/app/notify", () => ({
  notify: (message: string, options: Omit<Notice, "message"> = {}) => {
    notices.push({ message, ...options });
  },
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { Client, Provider, fetchExchange } = await import("urql");
const { MakeMode } = await import("./MakeMode");
const { recordNavigation } = await import("@/components/app/nav-history");
const { contentLayout, isFullScreenRoute } = await import(
  "@/components/app/AppShell"
);

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  calls = [];
  bodies = [];
  notices = [];
  failLogs = 0;
  window.sessionStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

let bodies: { query: string; variables: Record<string, unknown> }[] = [];
/** How many logDrink calls fail (the response is lost) before one lands. */
let failLogs = 0;

/** Answers every operation as a successful log, and keeps what was sent. */
const capturingFetch = async (_url: unknown, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body));
  bodies.push(body);
  if (failLogs > 0) {
    failLogs -= 1;
    throw new TypeError("Failed to fetch");
  }
  return new Response(
    JSON.stringify({
      data: {
        logDrink: {
          __typename: "LoggedDrinkPayload",
          drinkerCount: 1,
          entryIds: ["e1"],
          entry: { __typename: "ItemCheckIn", id: "e1" },
        },
      },
    }),
    { headers: { "content-type": "application/json" } },
  );
};

type Instruction = {
  id: string;
  step_number: number;
  instruction_text: string;
};

const render = async (
  instructions: Instruction[] = [
    { id: "i1", step_number: 1, instruction_text: "Stir with ice." },
    { id: "i2", step_number: 2, instruction_text: "Strain." },
  ],
) => {
  await act(async () => {
    root.render(
      <Provider
        value={
          new Client({
            url: "http://localhost/api/graphql",
            exchanges: [fetchExchange],
            fetch: capturingFetch as typeof fetch,
          })
        }
      >
        <MakeMode
          viewerId={null}
          recipe={{
            id: "r1",
            name: "Negroni",
            type: "cocktail",
            serving_size: 1,
            instructions,
            ingredients: [],
          }}
        />
      </Provider>,
    );
  });
};

const button = (name: string) => {
  const found = [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === name,
  );
  if (found === undefined) throw new Error(`no ${name} button`);
  return found;
};
const click = async (name: string) => {
  await act(async () => {
    button(name).click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
};

const leaveButton = () => {
  const button = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Leave Make mode"]',
  );
  if (button === null) throw new Error("no Leave button");
  return button;
};

describe("Make mode (L08)", () => {
  test("is not a second main landmark (CR-5)", async () => {
    await render();
    assert.equal(document.querySelectorAll("main").length, 0);
    assert.ok(document.querySelector('[data-slot="make-mode"]'));
    assert.doesNotMatch(container.innerHTML, /min-h-dvh/);
  });

  test("the shell gives it the whole screen: no tab bar, no padding (CR-5)", () => {
    assert.deepEqual(contentLayout("/recipes/r1/make"), {
      padded: false,
      scrolls: true,
      tabBar: false,
    });
    assert.equal(isFullScreenRoute("/recipes/r1/make"), true);
    assert.equal(isFullScreenRoute("/recap"), true);
    assert.equal(isFullScreenRoute("/recipes/r1"), false);
    assert.equal(contentLayout("/recipes/r1").tabBar, true);
  });

  test("Leave goes back when the recipe is behind it (CR-6)", async () => {
    recordNavigation("/recipes/r1");
    recordNavigation("/recipes/r1/make");
    await render();
    await act(async () => leaveButton().click());
    assert.deepEqual(calls, ["back"]);
  });

  test("Leave on a cold open replaces with the recipe, never pushes (CR-6)", async () => {
    await render();
    await act(async () => leaveButton().click());
    assert.deepEqual(calls, ["replace /recipes/r1"]);
  });

  test("opens on the ingredients, then one step at a time (ruling 2)", async () => {
    await render();
    assert.match(container.textContent ?? "", /Ingredients/);
    await click("Start");
    assert.match(container.textContent ?? "", /Step 1 of 2/);
    assert.match(container.textContent ?? "", /Stir with ice\./);
    await click("Next");
    assert.match(container.textContent ?? "", /Step 2 of 2/);
    assert.ok(button("Made it"));
    await click("Back");
    assert.match(container.textContent ?? "", /Step 1 of 2/);
  });

  test("a recipe with no steps says so and goes straight to Made it", async () => {
    await render([]);
    assert.ok(document.querySelector('[data-testid="no-steps"]'));
    assert.ok(button("Made it"));
  });

  test("a step timer keeps running on the next step, shown in the segment bar (ruling 4)", async () => {
    await render([
      { id: "i1", step_number: 1, instruction_text: "Shake for 12 seconds." },
      { id: "i2", step_number: 2, instruction_text: "Strain." },
    ]);
    await click("Start");
    await click("Start");
    assert.ok(button("Pause"));
    await click("Next");
    const chip = document.querySelector('button[aria-label$="left on step 1"]');
    assert.ok(chip, "the running timer shows beside the segments");
  });

  test("Made it logs the recipe and nothing else: no bottle, no person (#677)", async () => {
    await render([]);
    await click("Made it");
    assert.equal(bodies.length, 1);
    assert.match(bodies[0]?.query ?? "", /logDrink/);
    const input = bodies[0]?.variables.input as Record<string, unknown>;
    assert.deepEqual(input, { recipeId: "r1" });
    assert.match(container.textContent ?? "", /Made it/);
    assert.ok(document.querySelector('[data-slot="made-it"]'));
  });

  test("Try again re-sends the same log id, so a lost response logs once (F-119)", async () => {
    failLogs = 1;
    await render([]);
    await click("Made it");
    const failed = notices.find((n) => n.actionLabel === "Try again");
    assert.ok(failed, "the failure offers Try again");
    await act(async () => {
      failed.undo?.();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    assert.equal(bodies.length, 2);
    assert.equal(bodies[1]?.variables.id, bodies[0]?.variables.id);
    assert.ok(document.querySelector('[data-slot="made-it"]'));
  });
});
