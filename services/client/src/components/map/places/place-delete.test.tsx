/**
 * Delete on a place under review lands on /map (m06-place-under-review).
 *
 * The confirm sheet is an overlay layer: opening it pushes a history entry,
 * and closing it takes that entry back off with `history.back()`
 * (`overlays/layers.ts`). The delete used to close the sheet and replace to
 * /map in the same tick, so the sheet's Back landed after the router's
 * replace and undid it: the place was gone and the page stayed (F-45's
 * shape). The replace has to wait for the sheet's own Back.
 *
 * happy-dom, the real sheet and layers; the router is a stub in Next's own
 * context (no `mock.module`, which outlives the file), and `history.back`
 * answers with a `popstate` the way a browser does, a task later.
 */
import { spyOn } from "bun:test";
import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!GlobalRegistrator.isRegistered) {
  GlobalRegistrator.register({ url: "http://localhost/places/p1" });
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
const { PlaceReviewPanel } = await import("./PlaceReviewPanel");

const answer: typeof fetch = async () =>
  new Response(
    JSON.stringify({
      data: { deletePlace: { __typename: "DeletedPlace", id: "p1" } },
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

test("Delete lands on /map after the confirm sheet has taken its entry off", async () => {
  root.render(
    <AppRouterContext.Provider value={router as never}>
      <Provider value={client}>
        <PlaceReviewPanel
          placeId="p1"
          placeName="Corner Wine Room"
          status="PENDING"
          rejectionReason={null}
          categories={[]}
          description={null}
          suggestedCategories={[]}
          suggestedDescription={null}
          refetch={() => {}}
        />
      </Provider>
    </AppRouterContext.Provider>,
  );
  await wait(20);
  click(buttonNamed(container, "Delete"), "the panel's Delete");
  await wait(50);
  const sheet = document.querySelector('[role="alertdialog"]');
  click(sheet && buttonNamed(sheet, "Delete"), "the sheet's Delete");
  await wait(200);

  assert.ok(
    log.includes("notify:Deleted Corner Wine Room"),
    `the toast says what went: ${log.join(", ")}`,
  );
  const back = log.indexOf("back");
  const replace = log.indexOf("replace:/map");
  assert.notEqual(replace, -1, `it navigates to /map: ${log.join(", ")}`);
  assert.ok(
    back === -1 || back < replace,
    `the sheet's Back lands before the replace, not after it: ${log.join(", ")}`,
  );
});
