import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { createCellar, unique } from "../../fixtures/data.ts";
import {
  deleteCellarWithContents,
  deletePlace,
  insertPlace,
} from "../../fixtures/db.ts";
import { expect, test } from "../../fixtures/mobile.ts";
import { Gql, settleNetwork } from "../../fixtures/test.ts";

/**
 * X21 · the accessibility baseline, gated at 390x844 on touch.
 *
 * Every main route, signed in (and the two auth pages signed out), must have:
 *
 * - **no serious or critical axe violation** (WCAG 2.0/2.1/2.2 A and AA plus
 *   axe's best practices; moderate and minor ones are attached to the test as
 *   annotations, not failed on);
 * - **exactly one h1**;
 * - **a title of its own** — not the root layout's bare default;
 * - **one `<main>`**, the skip link's target.
 *
 * Plus two open overlays (the capture chooser, an AppBar's ⋯ sheet), the skip
 * link itself, and a keyboard walk over the main routes in which every stop
 * must draw a focus indicator.
 *
 * Data: one PRIVATE cellar holding one tea (with a text review, so the
 * read-only review renderer is on the page), a PRIVATE tier list ranking it,
 * a recipe group with one recipe, and **one** place inserted straight into
 * the database (no `createPlace`, so no AI review and no 25/day quota). The
 * cellar, list, recipe and place are deleted afterwards; the tea, like every
 * spec's items, has no delete and outlives the run.
 */
test.describe.configure({ mode: "serial" });

const TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
];
const GATING = new Set(["serious", "critical"]);
/** What the root layout's title is when a page names nothing. */
const BARE_TITLE = "Cellar Assistant";

const ids = {
  cellar: "",
  tea: "",
  bottle: "",
  tierList: "",
  group: "",
  recipe: "",
  place: randomUUID(),
};
const placeName = unique("E2 Axe Place").replace(/[^A-Za-z0-9 ]/g, "");

test.beforeAll(async () => {
  const api = await Gql.forAccount("primary");
  try {
    ids.cellar = await createCellar(api, unique("E2 Axe"), "PRIVATE");

    const ref = await api.query(
      `query { referenceData(kind: TEA_CATEGORY, first: 1) {
         __typename ... on ReferenceRowConnection { edges { node { value } } }
       } }`,
    );
    const category = ref.referenceData.edges[0]?.node.value;
    expect(category, "no tea categories seeded").toBeTruthy();
    const created = await api.query(
      `mutation C($input: CreateItemInput!, $id: ID) {
         createItem(type: TEA, itemId: $id, input: $input) {
           __typename
           ... on MutationCreateItemSuccess { data { id } }
           ... on Error { message }
         }
       }`,
      {
        id: randomUUID(),
        input: { name: unique("E2 Axe Tea"), tea: { category } },
      },
    );
    expect(created.createItem.__typename, JSON.stringify(created)).toBe(
      "MutationCreateItemSuccess",
    );
    ids.tea = created.createItem.data.id;

    const added = await api.query(
      `mutation A($cellarId: ID!, $input: AddCellarItemInput!) {
         addItemToCellar(cellarId: $cellarId, input: $input) {
           __typename ... on CellarItem { id } ... on Error { message }
         }
       }`,
      {
        cellarId: ids.cellar,
        input: {
          cellarItemId: randomUUID(),
          item: { id: ids.tea, type: "TEA" },
        },
      },
    );
    expect(added.addItemToCellar.__typename, JSON.stringify(added)).toBe(
      "CellarItem",
    );
    ids.bottle = added.addItemToCellar.id;

    const review = await api.query(
      `mutation R($itemId: ID!, $input: AddItemReviewInput!) {
         addItemReview(itemId: $itemId, type: TEA, input: $input) {
           __typename ... on Error { message }
         }
       }`,
      {
        itemId: ids.tea,
        input: { score: 4, text: { body: "Malty, a little smoke." } },
      },
    );
    expect(review.addItemReview.__typename, JSON.stringify(review)).toBe(
      "ItemReview",
    );

    const list = await api.query(
      `mutation T($input: CreateTierListInput!) {
         createTierList(input: $input) {
           __typename ... on TierList { id } ... on Error { message }
         }
       }`,
      { input: { name: unique("E2 Axe List"), privacy: "PRIVATE" } },
    );
    expect(list.createTierList.__typename, JSON.stringify(list)).toBe(
      "TierList",
    );
    ids.tierList = list.createTierList.id;
    const ranked = await api.query(
      `mutation A($id: ID!, $input: AddTierListItemInput!) {
         addTierListItem(tierListId: $id, input: $input) {
           __typename ... on Error { message }
         }
       }`,
      {
        id: ids.tierList,
        input: { entry: { id: ids.tea, type: "TEA" }, band: 4 },
      },
    );
    expect(ranked.addTierListItem.__typename, JSON.stringify(ranked)).toBe(
      "TierListItem",
    );

    const group = await api.query(
      `mutation G($input: CreateRecipeGroupInput!) {
         createRecipeGroup(input: $input) {
           __typename ... on RecipeGroup { id } ... on Error { message }
         }
       }`,
      { input: { name: unique("E2 Axe Group"), category: "cocktail" } },
    );
    expect(group.createRecipeGroup.__typename, JSON.stringify(group)).toBe(
      "RecipeGroup",
    );
    ids.group = group.createRecipeGroup.id;
    const recipe = await api.query(
      `mutation R($input: CreateRecipeInput!) {
         createRecipe(input: $input) {
           __typename ... on Recipe { id } ... on Error { message }
         }
       }`,
      {
        input: {
          name: unique("E2 Axe Recipe"),
          type: "cocktail",
          recipeGroupId: ids.group,
        },
      },
    );
    expect(recipe.createRecipe.__typename, JSON.stringify(recipe)).toBe(
      "Recipe",
    );
    ids.recipe = recipe.createRecipe.id;
  } finally {
    await api.dispose();
  }
  insertPlace({
    id: ids.place,
    name: placeName,
    lng: -89.3842,
    lat: 43.0747,
    category: "bar",
  });
});

test.afterAll(async () => {
  const api = await Gql.forAccount("primary");
  try {
    if (ids.tierList !== "") {
      await api.query(
        `mutation D($id: ID!) { deleteTierList(tierListId: $id) { __typename } }`,
        { id: ids.tierList },
      );
    }
    if (ids.recipe !== "") {
      await api.query(
        `mutation D($id: ID!) { deleteRecipe(recipeId: $id) { __typename } }`,
        { id: ids.recipe },
      );
    }
    if (ids.group !== "") {
      await api.query(
        `mutation D($id: ID!) { deleteRecipeGroup(recipeGroupId: $id) { __typename } }`,
        { id: ids.group },
      );
    }
  } finally {
    await api.dispose();
  }
  if (ids.cellar !== "") deleteCellarWithContents(ids.cellar);
  await deletePlace(ids.place);
});

/** The main routes, signed in. Built after `beforeAll` has made the data. */
const signedInRoutes = (): string[] => [
  "/",
  "/search",
  "/search?q=tea",
  "/cellars",
  "/cellars/add",
  `/cellars/${ids.cellar}`,
  `/cellars/${ids.cellar}/items`,
  `/cellars/${ids.cellar}/edit`,
  `/cellars/${ids.cellar}/teas/${ids.bottle}`,
  `/teas/${ids.tea}`,
  `/teas/${ids.tea}/edit`,
  "/add",
  "/map",
  `/places/${ids.place}`,
  "/me",
  "/friends",
  "/want-to-try",
  "/favorites",
  "/rankings",
  "/users/edit",
  "/recipes",
  `/recipes/${ids.recipe}`,
  `/recipes/groups/${ids.group}`,
  "/recipes/bar",
  "/tier-lists",
  "/tier-lists/add",
  `/tier-lists/${ids.tierList}`,
  `/tier-lists/${ids.tierList}/edit`,
];

/** Past the route's loading shell, with the network quiet (or 4 s spent). */
async function settled(page: Page): Promise<void> {
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("[data-loading-shell]")).toHaveCount(0);
  await settleNetwork(page, 4_000);
}

type Finding = { impact: string; id: string; help: string; nodes: string[] };

/** axe's findings on the page as it stands, the dev overlay excluded. */
async function axe(page: Page): Promise<Finding[]> {
  const results = await new AxeBuilder({ page })
    .withTags(TAGS)
    .exclude("nextjs-portal")
    .analyze();
  return results.violations.map((v) => ({
    impact: v.impact ?? "unknown",
    id: v.id,
    help: v.help,
    nodes: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
  }));
}

/** Fail on serious/critical; record the rest on the test. */
async function expectNoGatingViolations(page: Page, where: string) {
  const findings = await axe(page);
  for (const f of findings.filter((f) => !GATING.has(f.impact))) {
    test.info().annotations.push({
      type: `axe ${f.impact}`,
      description: `${where}: ${f.id} — ${f.help} (${f.nodes.join(", ")})`,
    });
  }
  expect
    .soft(
      findings.filter((f) => GATING.has(f.impact)),
      `${where}: serious/critical axe violations`,
    )
    .toEqual([]);
}

/** The structural half of the baseline: one h1, a title, one main. */
async function expectStructure(page: Page, where: string) {
  await expect
    .soft(page.locator("h1"), `${where}: exactly one h1`)
    .toHaveCount(1);
  const title = await page.title();
  expect
    .soft(title, `${where}: names itself in the title`)
    .toMatch(/^.+ · Cellar Assistant$/);
  expect
    .soft(title, `${where}: names itself in the title`)
    .not.toBe(BARE_TITLE);
  await expect
    .soft(page.locator("main#main-content"), `${where}: one main landmark`)
    .toHaveCount(1);
}

test("every main route at 390: no serious or critical axe violation, one h1, a title, one main", async ({
  page,
}) => {
  test.setTimeout(10 * 60_000);
  for (const route of signedInRoutes()) {
    await test.step(route, async () => {
      await page.goto(route);
      await settled(page);
      await expectStructure(page, route);
      await expectNoGatingViolations(page, route);
    });
  }
});

test("signed out: sign-in and sign-up", async ({ browser }) => {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  try {
    const page = await context.newPage();
    for (const route of ["/sign-in", "/sign-up"]) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(`${route}$`));
      await settled(page);
      await expectStructure(page, route);
      await expectNoGatingViolations(page, route);
    }
  } finally {
    await context.close();
  }
});

// The capture chooser sheet went with X06: ＋ opens the capture surface at
// `/add` (no overlay), which the route list above already scans.
test("an open overlay: an AppBar's ⋯ sheet", async ({ page }) => {
  await page.goto(`/teas/${ids.tea}`);
  await settled(page);
  await page.getByRole("button", { name: "More actions" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectNoGatingViolations(page, `/teas/${ids.tea} + ⋯ sheet`);
});

/**
 * axe's `target-size` over one region only. Leftovers 4 / L31: the page-level
 * pass on the item and bottle pages spans several batch-2 streams' files and
 * is the verify round's; each stream holds its own controls, so this scopes
 * to the ones leftovers owns (the Item actions toolbar and the Pour sheet).
 */
async function targetSizeIn(page: Page, selector: string): Promise<Finding[]> {
  const results = await new AxeBuilder({ page })
    .withRules(["target-size"])
    .include(selector)
    .analyze();
  return results.violations.map((v) => ({
    impact: v.impact ?? "unknown",
    id: v.id,
    help: v.help,
    nodes: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
  }));
}

test("touch targets: the item page's tins and the bottle page's Steep sheet pass target-size", async ({
  page,
}) => {
  // There is no Item actions bar any more: the actions are on each tin's row,
  // in the "Your tins" section.
  const tins = "[data-e2e-tins]";
  for (const route of [
    `/teas/${ids.tea}`,
    `/cellars/${ids.cellar}/teas/${ids.bottle}`,
  ]) {
    await test.step(route, async () => {
      await page.goto(route);
      await settled(page);
      // Axe takes a CSS selector, so tag the section by its heading first.
      await page
        .getByRole("heading", { name: "Your tins" })
        .evaluate((h) => h.closest("section")?.setAttribute("data-e2e-tins", ""));
      await expect(page.locator(tins).first()).toBeVisible();
      expect
        .soft(await targetSizeIn(page, tins), `${route}: Your tins`)
        .toEqual([]);
    });
  }
  // A tea's action reads "Steep" (W-20); its sheet is "Steep" too.
  await page
    .getByRole("button", { name: /^Steep from / })
    .first()
    .click();
  const sheet = page.getByRole("dialog", { name: "Steep" });
  await expect(sheet).toBeVisible();
  expect
    .soft(
      await targetSizeIn(page, '[role="dialog"]'),
      "the Steep sheet: target-size",
    )
    .toEqual([]);
});

test("the skip link is the first Tab stop and lands focus in main", async ({
  page,
}) => {
  await page.goto("/cellars");
  await settled(page);
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  // Shown while focused: a real box on screen, not the 1px sr-only clip.
  const box = await skip.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(40);
  expect(box?.height ?? 0).toBeGreaterThan(20);
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main-content")).toBeFocused();
});

/**
 * One step of the keyboard walk, run in the page after each Tab. Judges the
 * element focused **before** this Tab: its look while focused (stored on it
 * at the previous step) against its look now that focus has moved on. A
 * difference is its focus indicator; none means it has none.
 *
 * Comparing the element with itself is the point. Asking only "does it have
 * an outline or a box-shadow while focused?" passes nearly everything here:
 * Tailwind composes `box-shadow` from ring and shadow layers, so any control
 * with `shadow-xs` (most shadcn buttons and inputs) has a non-`none`
 * box-shadow whether it is focused or not.
 *
 * The look is the outline, box-shadow, border colour, background and text
 * decoration of the element and its ::before/::after (`app/Link`'s overlay
 * draws its ring on a pseudo-element), and of its three nearest ancestors
 * (`ui/input-group` rings the group, not the input, through `has-[…]`).
 * Runs in the page, from source: no
 * closures, no imports. Transitions are switched off first (`noMotion`), or
 * a ring still fading in would read as no change.
 */
function focusStep(): {
  judged: { what: string; shown: boolean } | null;
  current: { what: string; again: boolean } | null;
} {
  const own = (el: Element) =>
    [undefined, "::before", "::after"]
      .map((pseudo) => {
        const s = getComputedStyle(el, pseudo);
        return [
          s.outlineStyle,
          s.outlineWidth,
          s.outlineColor,
          s.outlineOffset,
          s.boxShadow,
          s.borderTopColor,
          s.borderBottomColor,
          s.backgroundColor,
          s.textDecorationLine,
        ].join("|");
      })
      .join("||");
  const look = (el: Element) => {
    const parts: string[] = [];
    for (let at: Element | null = el, i = 0; at !== null && i < 4; i++) {
      parts.push(own(at));
      at = at.parentElement;
    }
    return parts.join("|||");
  };

  let judged: { what: string; shown: boolean } | null = null;
  const prev = document.querySelector("[data-e2e-focus-look]");
  if (prev !== null) {
    if (prev !== document.activeElement) {
      judged = {
        what: prev.getAttribute("data-e2e-focus-what") ?? "?",
        shown: prev.getAttribute("data-e2e-focus-look") !== look(prev),
      };
    }
    prev.removeAttribute("data-e2e-focus-look");
  }

  const el = document.activeElement;
  if (el === null || el === document.body) return { judged, current: null };
  const again = el.hasAttribute("data-e2e-focus-seen");
  const name = (el.getAttribute("aria-label") ?? el.textContent ?? "")
    .trim()
    .slice(0, 40);
  const role = el.getAttribute("role");
  const what = `${el.tagName.toLowerCase()}${role === null ? "" : `[role=${role}]`} "${name}"`;
  el.setAttribute("data-e2e-focus-seen", "");
  el.setAttribute("data-e2e-focus-what", what);
  el.setAttribute("data-e2e-focus-look", look(el));
  return { judged, current: { what, again } };
}

/** Transitions and animations finish at once, so a look is its end state. */
const noMotion = `*, *::before, *::after {
  transition-duration: 0s !important; transition-delay: 0s !important;
  animation-duration: 0s !important; animation-delay: 0s !important;
}`;

test("focus is visible at every Tab stop on the main routes", async ({
  page,
}) => {
  test.setTimeout(5 * 60_000);
  const routes = [
    "/",
    "/search",
    "/cellars",
    `/cellars/${ids.cellar}/items`,
    `/teas/${ids.tea}`,
    `/places/${ids.place}`,
    "/me",
    "/recipes",
    `/recipes/${ids.recipe}`,
    `/tier-lists/${ids.tierList}`,
    "/map",
  ];
  for (const route of routes) {
    await test.step(route, async () => {
      await page.goto(route);
      await settled(page);
      await page.addStyleTag({ content: noMotion });
      // Until focus wraps round to a stop already seen or leaves the page,
      // or 40 stops. Each step judges the stop before it, so the last stop
      // is judged by the step that ends the walk.
      // A route that focuses a field on open (search, W-12) has its first
      // stop already: count it, since Tab starts from the second.
      let stops = (await page.evaluate(
        () =>
          document.activeElement !== null &&
          document.activeElement !== document.body,
      ))
        ? 1
        : 0;
      for (; stops <= 40; stops++) {
        await page.keyboard.press("Tab");
        const { judged, current } = await page.evaluate(focusStep);
        if (judged !== null) {
          expect
            .soft(
              judged.shown,
              `${route}: no focus indicator on ${judged.what}`,
            )
            .toBe(true);
        }
        if (current === null || current.again) break;
      }
      expect(stops, `${route}: Tab reached nothing`).toBeGreaterThan(2);
    });
  }
});
