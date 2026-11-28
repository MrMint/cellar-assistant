/**
 * Delete on your own recipe lands on /recipes with its toast
 * (m06-recipe-editor "its author deletes it from the ⋯ menu").
 *
 * The confirm sheet is an overlay layer: opening it pushes a history entry,
 * and closing it takes that entry back off with `history.back()`
 * (`overlays/layers.ts`). `remove()` used to close the sheet and replace to
 * /recipes in the same tick, so the sheet's Back landed after the router's
 * replace and undid it: the recipe was gone and the page stayed (F-45's
 * shape). The replace has to wait for the sheet's own Back.
 *
 * happy-dom, the real page, sheets and layers; the router is a stub in Next's
 * own context (no `mock.module`, which outlives the file), and `history.back`
 * answers with a `popstate` the way a browser does, a task later.
 */
import { spyOn } from "bun:test";
import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!GlobalRegistrator.isRegistered) {
  GlobalRegistrator.register({ url: "http://localhost/recipes/r1" });
}
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = false;

let log: string[];
const notifyModule = await import("@/components/app/notify");
const notifySpy = spyOn(notifyModule, "notify").mockImplementation(
  (message: string) => {
    log.push(`notify:${message}`);
    return message;
  },
);
after(() => notifySpy.mockRestore());

const backSpy = spyOn(window.history, "back").mockImplementation(() => {
  log.push("back");
  setTimeout(() => {
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
  }, 5);
});
after(() => backSpy.mockRestore());

const { createRoot } = await import("react-dom/client");
const { Client, Provider, fetchExchange } = await import("urql");
const { AppRouterContext } = await import(
  "next/dist/shared/lib/app-router-context.shared-runtime"
);
const { resetLayers } = await import("@/components/app/overlays/layers");
const { RecipeDetails } = await import("./RecipeDetails");

const answer: typeof fetch = async () =>
  new Response(
    JSON.stringify({
      data: { deleteRecipe: { __typename: "DeletedRecipe", id: "r1" } },
    }),
    { headers: { "content-type": "application/json" } },
  );
const client = new Client({
  url: "http://test.invalid/graphql",
  exchanges: [fetchExchange],
  fetch: answer,
});

const router = {
  push: (href: string) => log.push(`push:${href}`),
  replace: (href: string) => log.push(`replace:${href}`),
  back: () => log.push("router.back"),
  forward: () => {},
  refresh: () => {},
  prefetch: () => {},
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  log = [];
  resetLayers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  root.unmount();
  await wait(20);
  document.body.innerHTML = "";
});

const click = (element: Element | null | undefined, what: string) => {
  assert.ok(element, `${what} renders`);
  (element as HTMLElement).click();
};

const buttonNamed = (scope: ParentNode, name: string) =>
  [...scope.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === name,
  );

type Recipe = Parameters<typeof RecipeDetails>[0]["recipe"];
const recipe: Recipe = {
  id: "r1",
  name: "Negroni",
  description: "Bitter and sweet.",
  type: "cocktail",
  difficulty_level: 2,
  prep_time_minutes: 5,
  serving_size: 1,
  image_url: null,
  version: 1,
  instructions: [],
  ingredients: [],
  recipe_reviews: [],
  created_by_id: "me",
  privacy: "PRIVATE",
  is_draft: false,
};

const byLabel = (label: string) =>
  document.querySelector(`[aria-label="${label}"]`);
const byText = (scope: ParentNode, text: string) =>
  [...scope.querySelectorAll("button, [role='menuitem']")].find((element) =>
    element.textContent?.includes(text),
  );

test("Delete recipe lands on /recipes after the confirm sheet has taken its entry off", async () => {
  root.render(
    <AppRouterContext.Provider value={router as never}>
      <Provider value={client}>
        <RecipeDetails recipe={recipe} viewerId="me" titleLevel="h1" />
      </Provider>
    </AppRouterContext.Provider>,
  );
  await wait(30);
  // happy-dom is 1024 wide, so ⋯ is the desktop menu, which opens on the
  // press (Radix), not on the click.
  const more = byLabel("More actions");
  assert.ok(more, "the ⋯ button renders");
  more.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      pointerType: "mouse",
    }),
  );
  await wait(80);
  click(byText(document, "Delete recipe"), "Delete recipe in the ⋯ sheet");
  await wait(500);
  const sheet = document.querySelector('[role="alertdialog"]');
  click(sheet && buttonNamed(sheet, "Delete"), "the sheet's Delete");
  await wait(300);

  assert.ok(
    log.includes("notify:Deleted Negroni"),
    `the toast says what went: ${log.join(", ")}`,
  );
  const replace = log.indexOf("replace:/recipes");
  assert.notEqual(replace, -1, `it navigates to /recipes: ${log.join(", ")}`);
  assert.equal(
    log.slice(replace).includes("back"),
    false,
    `no sheet's Back lands after the replace: ${log.join(", ")}`,
  );
});
