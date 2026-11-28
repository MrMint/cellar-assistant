/**
 * The Made it screen rates in place (Recipes-Make board, F-120): five stars
 * in the "Rate it" card, a tap saves the score as the viewer's review (one
 * per viewer per recipe), and "Add a note" sits beside them. No "Write a
 * review" detour.
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

type Notice = { message: string; tone?: string };
let notices: Notice[] = [];
mock.module("@/components/app/notify", () => ({
  notify: (message: string, options: Omit<Notice, "message"> = {}) => {
    notices.push({ message, ...options });
  },
}));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { Client, Provider, fetchExchange } = await import("urql");
const { MadeIt } = await import("./MadeIt");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
let bodies: { query: string; variables: Record<string, unknown> }[] = [];
let refuse = false;

beforeEach(() => {
  bodies = [];
  notices = [];
  refuse = false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

/** Answers every review write as saved, unless `refuse` is set. */
const capturingFetch = async (_url: unknown, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body));
  bodies.push(body);
  const field = /addRecipeReview/.test(body.query)
    ? "addRecipeReview"
    : "updateRecipeReview";
  const payload = refuse
    ? {
        __typename: "ValidationError",
        message: "Nope",
        reason: "INVALID",
        code: "INVALID",
      }
    : { __typename: "RecipeReview", id: "rv1" };
  return new Response(JSON.stringify({ data: { [field]: payload } }), {
    headers: { "content-type": "application/json" },
  });
};

const render = async (
  reviews: { id: string; userId: string; score?: number }[] = [],
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
        <MadeIt
          viewerId="me"
          recipe={
            {
              id: "r1",
              name: "Negroni",
              type: "cocktail",
              serving_size: 1,
              instructions: [],
              ingredients: [],
              recipe_reviews: reviews,
            } as unknown as Parameters<typeof MadeIt>[0]["recipe"]
          }
          onRecipe={() => {}}
          onDone={() => {}}
        />
      </Provider>,
    );
  });
};

const star = (n: number) => {
  const found = container.querySelector<HTMLElement>(
    `[data-slot="made-it"] section[aria-label="Rate it"] [data-star="${n}"]`,
  );
  if (found === null) throw new Error(`no star ${n} in the Rate it card`);
  return found;
};

const tap = async (el: HTMLElement) => {
  await act(async () => {
    el.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
};

const buttonNamed = (name: string) =>
  [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === name,
  );

describe("Made it: Rate it in place (F-120)", () => {
  test("five stars and Add a note, no Write a review", async () => {
    await render();
    for (const n of [1, 2, 3, 4, 5]) assert.ok(star(n));
    assert.ok(buttonNamed("Add a note"));
    assert.equal(buttonNamed("Write a review"), undefined);
  });

  test("a tap saves the score as a new review; the next tap updates that one", async () => {
    await render();
    await tap(star(4));
    assert.equal(bodies.length, 1);
    assert.match(bodies[0]?.query ?? "", /addRecipeReview/);
    const input = bodies[0]?.variables.input as Record<string, unknown>;
    assert.equal(input.score, 4);
    assert.equal(bodies[0]?.variables.recipeId, "r1");

    await tap(star(5));
    assert.equal(bodies.length, 2);
    assert.match(bodies[1]?.query ?? "", /updateRecipeReview/);
    assert.equal(bodies[1]?.variables.reviewId, input.reviewId);
    const second = bodies[1]?.variables.input as
      | Record<string, unknown>
      | undefined;
    assert.equal(second?.score, 5);
  });

  test("an existing review is updated, its stars shown", async () => {
    await render([{ id: "mine", userId: "me", score: 3 }]);
    assert.ok(container.querySelector('[data-slot="rating-score"]'));
    await tap(star(2));
    assert.match(bodies[0]?.query ?? "", /updateRecipeReview/);
    assert.equal(bodies[0]?.variables.reviewId, "mine");
  });

  test("a refused save says so and puts the stars back", async () => {
    refuse = true;
    await render();
    await tap(star(4));
    assert.ok(notices.some((n) => n.tone === "error"));
    assert.equal(container.querySelector('[data-slot="rating-score"]'), null);
  });
});
