import type { Page } from "@playwright/test";
import { createCellar, unique } from "../../fixtures/data.ts";
import { deleteCellarWithContents } from "../../fixtures/db.ts";
import { expect, test } from "../../fixtures/mobile.ts";
import { Gql, settleNetwork } from "../../fixtures/test.ts";

/**
 * X04 + D3 · the cellar home, at 390x844: the overview merged into the
 * cellar page, with a dashboard on top of the collection.
 *
 * Two cellars, five bottles of three teas:
 *
 * - **Home** — two bottles of one Lapsang (one open at 20%, logged once),
 *   one sealed Jasmine, one Sencha logged with a score and a note and then
 *   finished;
 * - **Cart** — a third bottle of the same Lapsang, for the fan-out.
 *
 * Read the way a thumb would: the dashboard (Open now with Pour, the four
 * tiles, the pours trend), the grid's ×2, the Finished diary with your log,
 * then a search that narrows and says where else the Lapsang is. Pouring
 * from the shelf moves the trend.
 *
 * Teas, because `createItem` writes one without the onboarding flow; items
 * have no delete, so the three teas outlive the run, the cellars and their
 * bottles and logs do not. No places are created.
 */
test.describe.configure({ mode: "serial" });

const prefix = unique("E2 CH");
const names = {
  lapsang: `${prefix} Lapsang Souchong`,
  jasmine: `${prefix} Jasmine Pearl`,
  sencha: `${prefix} Sencha`,
};
const cartName = unique("E2 Cart");
let homeId: string | undefined;
let cartId: string | undefined;

const mutate = async (
  api: Gql,
  query: string,
  variables: Record<string, unknown>,
  field: string,
  typename: string,
) => {
  const data = await api.query(query, variables);
  expect(data[field].__typename, JSON.stringify(data[field])).toBe(typename);
  return data[field];
};

test.beforeAll(async () => {
  const api = await Gql.forAccount("primary");
  try {
    homeId = await createCellar(api, unique("E2 Home"), "PRIVATE");
    cartId = await createCellar(api, cartName, "PRIVATE");
    const ref = await api.query(
      `query { referenceData(kind: TEA_CATEGORY, first: 1) {
         __typename ... on ReferenceRowConnection { edges { node { value } } }
       } }`,
    );
    const category = ref.referenceData.edges[0]?.node.value;
    expect(category, "no tea categories seeded").toBeTruthy();

    const itemIds: Record<keyof typeof names, string> = {
      lapsang: "",
      jasmine: "",
      sencha: "",
    };
    for (const key of Object.keys(names) as (keyof typeof names)[]) {
      const created = await mutate(
        api,
        `mutation C($input: CreateItemInput!, $id: ID) {
           createItem(type: TEA, itemId: $id, input: $input) {
             __typename
             ... on MutationCreateItemSuccess { data { id } }
             ... on Error { message }
           }
         }`,
        {
          id: crypto.randomUUID(),
          input: { name: names[key], tea: { category } },
        },
        "createItem",
        "MutationCreateItemSuccess",
      );
      itemIds[key] = created.data.id;
    }

    const add = async (cellarId: string, key: keyof typeof names) =>
      (
        await mutate(
          api,
          `mutation A($cellarId: ID!, $input: AddCellarItemInput!) {
             addItemToCellar(cellarId: $cellarId, input: $input) {
               __typename ... on CellarItem { id } ... on Error { message }
             }
           }`,
          {
            cellarId,
            input: {
              cellarItemId: crypto.randomUUID(),
              item: { id: itemIds[key], type: "TEA" },
            },
          },
          "addItemToCellar",
          "CellarItem",
        )
      ).id as string;
    const home = homeId;
    const cart = cartId;
    if (home === undefined || cart === undefined) throw new Error("no cellars");

    const lapsangOpen = await add(home, "lapsang");
    await add(home, "lapsang");
    await add(home, "jasmine");
    const sencha = await add(home, "sencha");
    await add(cart, "lapsang");

    await mutate(
      api,
      `mutation P($cellarId: ID!, $id: ID!) {
         setCellarItemPercentage(cellarId: $cellarId, cellarItemId: $id, percentageRemaining: 20) {
           __typename ... on Error { message }
         }
       }`,
      { cellarId: home, id: lapsangOpen },
      "setCellarItemPercentage",
      "CellarItem",
    );
    await mutate(
      api,
      `mutation O($cellarId: ID!, $id: ID!) {
         openCellarItem(cellarId: $cellarId, cellarItemId: $id) {
           __typename ... on Error { message }
         }
       }`,
      { cellarId: home, id: lapsangOpen },
      "openCellarItem",
      "CellarItem",
    );
    const log = (cellarItemId: string, extra: Record<string, unknown>) =>
      mutate(
        api,
        `mutation L($id: ID, $input: LogDrinkInput!) {
           logDrink(id: $id, input: $input) {
             __typename ... on Error { message }
           }
         }`,
        {
          id: crypto.randomUUID(),
          input: { bottle: { cellarId: home, cellarItemId }, ...extra },
        },
        "logDrink",
        "LoggedDrinkPayload",
      );
    await log(lapsangOpen, {});
    await log(sencha, { score: 4.5, note: "Grassy, then sweet" });
    await mutate(
      api,
      `mutation E($cellarId: ID!, $id: ID!) {
         emptyCellarItem(cellarId: $cellarId, cellarItemId: $id) {
           __typename ... on Error { message }
         }
       }`,
      { cellarId: home, id: sencha },
      "emptyCellarItem",
      "CellarItem",
    );
  } finally {
    await api.dispose();
  }
});

test.afterAll(() => {
  for (const id of [homeId, cartId]) {
    if (id !== undefined) deleteCellarWithContents(id);
  }
});

const gridCards = (page: Page) =>
  page.locator('[data-slot="cellar-grid"] [data-slot="bottle-card"]');
const tile = (page: Page, key: string) =>
  page.locator(`[data-slot="stat-tile"][data-stat="${key}"]`);
const readout = (page: Page) =>
  page.locator('[data-slot="pour-trend-readout"]');

test("the old overview lands on the cellar home, and its top is a dashboard", async ({
  page,
  noise,
}) => {
  await page.goto(`/cellars/${homeId}`);
  await expect(page).toHaveURL(new RegExp(`/cellars/${homeId}/items$`));

  // Open now: the open Lapsang, with Pour.
  const shelf = page.locator('[data-slot="open-now-shelf"]');
  await expect(shelf.getByRole("heading", { name: "Open now" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(shelf.locator('[data-slot="bottle-card"]')).toHaveCount(1);
  await expect(shelf).toContainText(names.lapsang);
  await expect(shelf.getByRole("button", { name: "Pour" })).toBeVisible();

  // The tiles count bottles still in the cellar (D13): two Lapsangs and the
  // Jasmine; the finished Sencha is this month's.
  await expect(tile(page, "in-cellar")).toContainText("3");
  await expect(tile(page, "in-cellar")).toContainText("3 tea");
  await expect(tile(page, "open")).toContainText("1");
  await expect(tile(page, "open")).toContainText("2 sealed");
  await expect(tile(page, "almost-empty")).toContainText("1");
  await expect(tile(page, "finished")).toContainText("1");

  // Two logs this month, one series, a table for screen readers.
  await expect(readout(page)).toContainText(/^2\s*pours in this month/);
  await expect(
    page.locator('[data-slot="cellar-pour-trend"] table caption'),
  ).toHaveText(/2 pours in the last 12 months/);

  // Nothing scrolls sideways (the shelf scrolls inside itself).
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBe(0);
  expect(noise.pageErrors, noise.pageErrors.join("\n")).toEqual([]);
});

test("identical bottles are one card with ×2; the tile opens the collection sorted", async ({
  page,
}) => {
  await page.goto(`/cellars/${homeId}/items`);
  await expect(gridCards(page)).toHaveCount(2, { timeout: 30_000 });
  const lapsang = gridCards(page).filter({ hasText: names.lapsang });
  await expect(lapsang.locator('[data-slot="bottle-card-count"]')).toHaveText(
    "×2",
  );
  await expect(lapsang).toContainText(/2 bottles, 1 open/);

  await tile(page, "almost-empty").click();
  await expect(page).toHaveURL(/[?&]sort=almost-empty/);
  await expect(
    page.getByRole("button", { name: "Sort by: Almost empty" }),
  ).toBeVisible({ timeout: 20_000 });
});

test("Finished is a diary: the date, how long, your log and your note", async ({
  page,
}) => {
  await page.goto(`/cellars/${homeId}/items`);
  const finished = page
    .getByRole("radiogroup", { name: "Show" })
    .getByRole("radio", { name: /^Finished/ });
  await expect(finished).toHaveText(/Finished\s*1/, { timeout: 30_000 });
  await finished.click();
  await expect(page).toHaveURL(/[?&]status=finished/);

  const entry = page.locator('[data-slot="diary-entry"]');
  await expect(entry).toHaveCount(1, { timeout: 20_000 });
  await expect(entry).toContainText(names.sencha);
  await expect(entry).toContainText(/Finished \d{1,2} [A-Z][a-z]{2}/);
  await expect(entry).toContainText("Your log: 1 pour · last 4.5★");
  await expect(entry).toContainText("“Grassy, then sweet”");
  // Headed by the month, in the overline.
  await expect(
    page.locator('[data-slot="finished-diary"] h2').first(),
  ).toHaveText(/[A-Z][a-z]+ \d{4}/);
});

test("search narrows to the bottle, and says where else it is", async ({
  page,
}) => {
  await page.goto(`/cellars/${homeId}/items`);
  await expect(gridCards(page)).toHaveCount(2, { timeout: 30_000 });

  await page
    .getByRole("searchbox", { name: "Search this cellar" })
    .fill("lapsang souchong");
  await expect(page).toHaveURL(/[?&]search=lapsang/, { timeout: 20_000 });
  await settleNetwork(page);

  // The dashboard steps aside for the results.
  await expect(page.locator('[data-slot="cellar-dashboard"]')).toHaveCount(0);
  // The name match leads; anything after it is marked as only similar.
  await expect(gridCards(page).first()).toContainText(names.lapsang, {
    timeout: 20_000,
  });
  await expect(
    gridCards(page).first().locator('[data-slot="bottle-card-match"]'),
  ).toHaveCount(0);
  const rest = await gridCards(page).count();
  for (let index = 1; index < rest; index += 1) {
    await expect(
      gridCards(page).nth(index).locator('[data-slot="bottle-card-match"]'),
    ).toHaveText("Similar to your search");
  }
  await expect(
    page.locator('[data-slot="cellar-search-summary"]'),
  ).toContainText(/bottles? match/);

  // "Lapsang is in Cart": the other cellar's bottle, by name.
  const elsewhere = page.locator('[data-slot="cellar-search-elsewhere"]');
  await expect(elsewhere).toContainText("In your other cellars", {
    timeout: 20_000,
  });
  await expect(elsewhere).toContainText(names.lapsang);
  await expect(elsewhere).toContainText(`is in ${cartName}`);
  await elsewhere.getByRole("link", { name: names.lapsang }).click();
  await expect(page).toHaveURL(
    new RegExp(`/cellars/${cartId}/teas/[0-9a-f-]{36}`),
  );
});

test("Pour from the shelf logs a glass, and the trend counts it", async ({
  page,
}) => {
  await page.goto(`/cellars/${homeId}/items`);
  await expect(readout(page)).toContainText(/^2\s*pours/, { timeout: 30_000 });

  await page
    .locator('[data-slot="open-now-shelf"]')
    .getByRole("button", { name: "Pour" })
    .click();
  await page
    .getByRole("dialog", { name: "Log a drink" })
    .getByRole("button", { name: "Log it" })
    .click();
  await expect(page.getByText(/^Logged /).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(readout(page)).toContainText(/^3\s*pours in this month/, {
    timeout: 20_000,
  });
});
