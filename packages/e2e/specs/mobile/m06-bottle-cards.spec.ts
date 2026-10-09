import { createCellar, unique } from "../../fixtures/data.ts";
import { deleteCellarWithContents } from "../../fixtures/db.ts";
import { expect, test } from "../../fixtures/mobile.ts";
import { Gql, settleNetwork } from "../../fixtures/test.ts";

/**
 * N13b + N28 · the first cellar screen that visibly changes, at 390x844.
 *
 * A cellar of three teas — one sealed, one open at 40% that you rated 4.5,
 * one finished — read through the items page the way a thumb would:
 *
 * - BottleCards say "Sealed" / "Open · <1h" + 40% / "Finished", with your
 *   stars on the one you rated, and none of the catalog's "0 ♥ 0 💬";
 * - a bottle with no photo shows its LabelPlate, not the type's clip art;
 * - the sort chip (Open first by default → A–Z) reorders, through a sheet;
 * - the status segment hides finished bottles by default and shows them
 *   under Finished (the X04 diary) and All.
 *
 * Teas, because `createItem` writes a tea without the onboarding flow
 * (`11-items.spec.ts` says why). Items have no delete, so the three teas
 * outlive the run; the cellar and its bottles do not. No places are created.
 */
test.describe.configure({ mode: "serial" });

let cellarId: string | undefined;
const prefix = unique("E2 BC");
const names = {
  sealed: `${prefix} Alpha`,
  open: `${prefix} Bravo`,
  finished: `${prefix} Charlie`,
};

test.beforeAll(async () => {
  const api = await Gql.forAccount("primary");
  try {
    cellarId = await createCellar(api, unique("E2 Bottle Cards"), "PRIVATE");
    const ref = await api.query(
      `query { referenceData(kind: TEA_CATEGORY, first: 1) {
         __typename ... on ReferenceRowConnection { edges { node { value } } }
       } }`,
    );
    const category = ref.referenceData.edges[0]?.node.value;
    expect(category, "no tea categories seeded").toBeTruthy();

    const bottles: Record<keyof typeof names, string> = {
      sealed: "",
      open: "",
      finished: "",
    };
    for (const key of Object.keys(names) as (keyof typeof names)[]) {
      const created = await api.query(
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
      );
      expect(
        created.createItem.__typename,
        JSON.stringify(created.createItem),
      ).toBe("MutationCreateItemSuccess");
      const itemId = created.createItem.data.id;
      const added = await api.query(
        `mutation A($cellarId: ID!, $input: AddCellarItemInput!) {
           addItemToCellar(cellarId: $cellarId, input: $input) {
             __typename ... on CellarItem { id } ... on Error { message }
           }
         }`,
        {
          cellarId,
          input: {
            cellarItemId: crypto.randomUUID(),
            item: { id: itemId, type: "TEA" },
          },
        },
      );
      expect(added.addItemToCellar.__typename).toBe("CellarItem");
      bottles[key] = added.addItemToCellar.id;

      if (key === "open") {
        const review = await api.query(
          `mutation R($itemId: ID!) {
             addItemReview(itemId: $itemId, type: TEA, input: { score: 4.5 }) {
               __typename ... on Error { message }
             }
           }`,
          { itemId },
        );
        expect(review.addItemReview.__typename).toBe("ItemReview");
      }
    }

    const opened = await api.query(
      `mutation O($cellarId: ID!, $id: ID!) {
         openCellarItem(cellarId: $cellarId, cellarItemId: $id) {
           __typename ... on Error { message }
         }
       }`,
      { cellarId, id: bottles.open },
    );
    expect(opened.openCellarItem.__typename).toBe("CellarItem");
    const poured = await api.query(
      `mutation P($cellarId: ID!, $id: ID!) {
         setCellarItemPercentage(cellarId: $cellarId, cellarItemId: $id, percentageRemaining: 40) {
           __typename ... on Error { message }
         }
       }`,
      { cellarId, id: bottles.open },
    );
    expect(poured.setCellarItemPercentage.__typename).toBe("CellarItem");
    const emptied = await api.query(
      `mutation E($cellarId: ID!, $id: ID!) {
         emptyCellarItem(cellarId: $cellarId, cellarItemId: $id) {
           __typename ... on Error { message }
         }
       }`,
      { cellarId, id: bottles.finished },
    );
    expect(emptied.emptyCellarItem.__typename).toBe("CellarItem");
  } finally {
    await api.dispose();
  }
});

test.afterAll(() => {
  if (cellarId !== undefined) deleteCellarWithContents(cellarId);
});

// The collection's grid only: since X04 the dashboard's shelves above it
// draw BottleCards too.
const cards = (page: import("@playwright/test").Page) =>
  page.locator('[data-slot="cellar-grid"] [data-slot="bottle-card"]');
const titles = (page: import("@playwright/test").Page) =>
  cards(page).locator("a").allTextContents();

test("BottleCards: state, level, your stars and a LabelPlate — open first", async ({
  page,
  noise,
}) => {
  await page.goto(`/cellars/${cellarId}/items`);
  await expect(cards(page)).toHaveCount(2, { timeout: 30_000 });

  // Open first is the default order; the finished bottle is hidden.
  expect(await titles(page)).toEqual([names.open, names.sealed]);

  const open = cards(page).filter({ hasText: names.open });
  await expect(open).toHaveAttribute("data-state", "open");
  // Opened seconds ago: under a day, the age is in hours ("<1h", "3h").
  await expect(open).toContainText(/Open · (<1h|\d+h)/);
  await expect(open).toContainText("40%");
  await expect(
    open.getByRole("img", { name: "Rated 4.5 out of 5" }),
  ).toBeVisible();

  const sealed = cards(page).filter({ hasText: names.sealed });
  await expect(sealed).toHaveAttribute("data-state", "sealed");
  await expect(sealed).toContainText("Sealed");
  // No photo: the bottle's own plate, printing its name.
  await expect(
    sealed.locator('[data-slot="label-plate"][data-type="TEA"]'),
  ).toContainText(names.sealed);

  // The catalog's zero metrics are gone from the grid.
  const grid = await cards(page).allInnerTexts();
  for (const text of grid) {
    expect(text).not.toMatch(/favorites|reviews/i);
  }

  // Two columns on a phone, and nothing scrolls sideways.
  const [first, second] = await Promise.all([
    cards(page).nth(0).boundingBox(),
    cards(page).nth(1).boundingBox(),
  ]);
  expect(first?.y).toBe(second?.y);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBe(0);

  // The whole card is the target: it opens the bottle page.
  await open.locator("a").click();
  await expect(page).toHaveURL(/\/cellars\/[0-9a-f-]{36}\/teas\/[0-9a-f-]{36}/);
  expect(noise.pageErrors, noise.pageErrors.join("\n")).toEqual([]);
});

test("the sort chip reorders through a sheet, and the URL keeps it", async ({
  page,
}) => {
  await page.goto(`/cellars/${cellarId}/items`);
  await expect(cards(page)).toHaveCount(2, { timeout: 30_000 });

  const chip = page.getByRole("button", { name: "Sort by: Open first" });
  await chip.click();
  const sheet = page.getByRole("dialog", { name: "Sort by" });
  await expect(
    sheet.getByRole("radio", { name: "Open first" }),
  ).toHaveAttribute("aria-checked", "true");
  await sheet.getByRole("radio", { name: "A–Z" }).click();

  await expect(page).toHaveURL(/[?&]sort=a-z/);
  await expect(
    page.getByRole("button", { name: "Sort by: A–Z" }),
  ).toBeVisible();
  await expect
    .poll(() => titles(page), { timeout: 20_000 })
    .toEqual([names.sealed, names.open]);

  // A reload keeps the order.
  await page.reload();
  await settleNetwork(page);
  await expect
    .poll(() => titles(page), { timeout: 20_000 })
    .toEqual([names.sealed, names.open]);
});

test("the status segment: In cellar by default, then Finished, then All", async ({
  page,
}) => {
  await page.goto(`/cellars/${cellarId}/items`);
  const segment = page.getByRole("radiogroup", { name: "Show" });
  await expect(
    segment.getByRole("radio", { name: "In cellar" }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(cards(page)).toHaveCount(2, { timeout: 30_000 });

  // X04: Finished is a diary — a row per finished bottle, with its date —
  // and the segment carries the count.
  const finishedSegment = segment.getByRole("radio", { name: /^Finished/ });
  await expect(finishedSegment).toHaveText(/Finished\s*1/);
  await finishedSegment.click();
  await expect(page).toHaveURL(/[?&]status=finished/);
  const entries = page.locator('[data-slot="diary-entry"]');
  await expect(entries).toHaveCount(1, { timeout: 20_000 });
  await expect(entries.first()).toContainText(names.finished);
  await expect(entries.first()).toContainText(/Finished \d{1,2} [A-Z][a-z]{2}/);

  await segment.getByRole("radio", { name: "All" }).click();
  await expect(page).toHaveURL(/[?&]status=all/);
  await expect(cards(page)).toHaveCount(3, { timeout: 20_000 });
});
