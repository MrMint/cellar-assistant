import type { Page } from "@playwright/test";
import { createCellar, unique } from "../../fixtures/data.ts";
import { deleteCellarWithContents } from "../../fixtures/db.ts";
import { expect, test } from "../../fixtures/mobile.ts";
import { Gql, settleNetwork } from "../../fixtures/test.ts";

/**
 * The cellar home at 390x844, as C1 redrew it (combined-01, -05; Shelves):
 * the overview merged into the cellar list, no dashboard (Pour trend moved
 * to Me), the count strip, tiles, Arrange, the Finished diary.
 *
 * Two cellars, five bottles of three teas:
 *
 * - **Home** — two bottles of one Lapsang (one open at 20%, logged once),
 *   one sealed Jasmine, one Sencha logged with a score and a note and then
 *   finished;
 * - **Cart** — a third bottle of the same Lapsang, for the fan-out.
 *
 * Read the way a thumb would: the count strip and Open only, the tile's ×2
 * and Arrange's least-left sort, the Finished diary with your log, then a
 * search that narrows and says where else the Lapsang is.
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

const tiles = (page: Page) =>
  page.locator('[data-slot="cellar-grid"] [data-slot="cellar-list-tile"]');
const openArrange = async (page: Page) => {
  await page.getByRole("button", { name: /^Arrange: / }).click();
  return page.getByRole("dialog", { name: "Arrange" });
};

test("the old overview lands on the cellar list: name, count, strip, tiles", async ({
  page,
  noise,
}) => {
  await page.goto(`/cellars/${homeId}`);
  await expect(page).toHaveURL(new RegExp(`/cellars/${homeId}/items$`));

  // C1 (combined-01): no dashboard; the count strip leads with Open.
  await expect(tiles(page)).toHaveCount(2, { timeout: 30_000 });
  await expect(page.locator('[data-slot="cellar-dashboard"]')).toHaveCount(0);
  await expect(page.getByText("3 bottles").first()).toBeVisible();
  const strip = page.getByRole("group", { name: "Show only" });
  await expect(strip.getByRole("button", { name: /Open/ })).toContainText("1");
  await expect(strip.getByRole("button", { name: /Tea/ })).toContainText("3");

  // Open only: the open Lapsang, badged with what is left.
  await strip.getByRole("button", { name: /Open/ }).click();
  await expect(page).toHaveURL(/[?&]open=1/);
  await expect(tiles(page)).toHaveCount(1);
  await expect(tiles(page).first()).toContainText(names.lapsang);
  await expect(tiles(page).first()).toContainText(/Open · \d+%/);

  // Nothing scrolls sideways.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBe(0);
  expect(noise.pageErrors, noise.pageErrors.join("\n")).toEqual([]);
});

test("identical bottles are one tile with ×2; Arrange sorts least left first", async ({
  page,
}) => {
  await page.goto(`/cellars/${homeId}/items`);
  await expect(tiles(page)).toHaveCount(2, { timeout: 30_000 });
  const lapsang = tiles(page).filter({ hasText: names.lapsang });
  await expect(lapsang.locator('[data-slot="cellar-list-count"]')).toHaveText(
    "×2",
  );

  const sheet = await openArrange(page);
  await sheet.getByRole("menuitemradio", { name: "Least left first" }).click();
  await expect(page).toHaveURL(/[?&]sort=least-left/);
  await expect(
    page.getByRole("button", { name: "Arrange: Least left first" }),
  ).toBeVisible({ timeout: 20_000 });
  // The Lapsang at 20 % leads the Jasmine at 100 %.
  await expect(tiles(page).first()).toContainText(names.lapsang);
});

test("Finished is a diary: the date, how long, your log and your note", async ({
  page,
}) => {
  await page.goto(`/cellars/${homeId}/items`);
  const sheet = await openArrange(page);
  const finished = sheet
    .getByRole("radiogroup", { name: "Show" })
    .getByRole("radio", { name: /^Finished/ });
  await expect(finished).toHaveText(/Finished\s*1/, { timeout: 30_000 });
  await finished.click();
  await expect(page).toHaveURL(/[?&]status=finished/);
  await page.keyboard.press("Escape");

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
  await expect(tiles(page)).toHaveCount(2, { timeout: 30_000 });

  await page
    .getByRole("searchbox", { name: "Search this cellar" })
    .fill("lapsang souchong");
  await expect(page).toHaveURL(/[?&]search=lapsang/, { timeout: 20_000 });
  await settleNetwork(page);

  // The name match leads; anything found by meaning sits under "Similar".
  await expect(tiles(page).first()).toContainText(names.lapsang, {
    timeout: 20_000,
  });
  await expect(
    page.getByRole("button", { name: /^Arrange: / }),
    "a search orders by match",
  ).toContainText("Match");

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
