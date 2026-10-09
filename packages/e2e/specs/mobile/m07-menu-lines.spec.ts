import { unique } from "../../fixtures/data.ts";
import {
  deletePlace,
  deleteScannedMenu,
  insertPlace,
  insertScannedMenu,
} from "../../fixtures/db.ts";
import { edgesOf, expect, test } from "../../fixtures/mobile.ts";
import { Gql } from "../../fixtures/test.ts";

/**
 * X07 · a place's menu lines, at 390×844 with a thumb.
 *
 * - Lines are grouped by type even with `menu_category` null (they all used
 *   to land under "Other"), shouted text is cased for reading, and a matched
 *   line carries the viewer's own grounded reason ("You ★4.5") — never a
 *   percentage.
 * - A line opens one sheet of actions; **I'm having this** is an X02 log at
 *   this place, with the place already filled in.
 * - **Not this** (the scanner's alone) unlinks a wrong match, and Undo puts it
 *   back.
 * - An unmatched line offers **Add to catalog** as a draft card that writes
 *   nothing until Add.
 *
 * The menu is seeded straight into the database (`insertScannedMenu`) rather
 * than read by a vision model, so this runs with no AI and spends no menu
 * budget. One place, inserted (not `createPlace`: no 25/day quota) and
 * removed in `afterAll`, with its scan and lines; one tea, created through
 * the API; every log the run writes is deleted.
 */
test.describe.configure({ mode: "serial" });

let api: Gql;
let teaId: string;
const teaName = unique("E2 Jasmine").replace(/[^A-Za-z0-9 ]/g, " ");
const placeId = crypto.randomUUID();
const placeName = unique("E2 Menu Bar").replace(/[^A-Za-z0-9 ]/g, " ");
const scanId = crypto.randomUUID();
const fileId = crypto.randomUUID();
const teaLine = crypto.randomUUID();
const cocktailLine = crypto.randomUUID();
const wineLine = crypto.randomUUID();
let seeded = false;

test.beforeAll(async () => {
  api = await Gql.forAccount("primary");
  const me = await api.query(`query { me { id } }`);
  const userId: string = me.me.id;

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
      id: crypto.randomUUID(),
      input: { name: teaName, tea: { category } },
    },
  );
  expect(
    created.createItem.__typename,
    JSON.stringify(created.createItem),
  ).toBe("MutationCreateItemSuccess");
  teaId = created.createItem.data.id;
  const review = await api.query(
    `mutation R($itemId: ID!) {
       addItemReview(itemId: $itemId, type: TEA, input: { score: 4.5 }) {
         __typename ... on Error { message }
       }
     }`,
    { itemId: teaId },
  );
  expect(review.addItemReview.__typename).toBe("ItemReview");

  insertPlace({
    id: placeId,
    name: placeName,
    lng: -89.3842,
    lat: 43.0747,
    category: "wine_bar",
  });
  insertScannedMenu({
    scanId,
    fileId,
    placeId,
    userId,
    lines: [
      {
        id: cocktailLine,
        name: "NEGRONI — gin, campari, sweet vermouth",
        price: 14,
        type: "cocktail",
      },
      {
        id: teaLine,
        name: teaName.toUpperCase(),
        price: 6.5,
        type: "tea",
        match: { type: "tea", id: teaId },
      },
      { id: wineLine, name: "HOUSE RED", price: 11, type: "wine" },
    ],
  });
  seeded = true;
});

test.afterAll(async () => {
  if (teaId !== undefined) {
    const data = await api.query(
      `query Mine($id: ID!) {
         item(type: TEA, id: $id) {
           __typename
           ... on QueryItemSuccess { data { checkIns(first: 50, scope: MINE) { edges { node { id } } } } }
         }
       }`,
      { id: teaId },
    );
    for (const edge of data.item?.data?.checkIns.edges ?? []) {
      await api.query(
        `mutation D($id: ID!) { deleteDrinkLog(id: $id) { __typename } }`,
        { id: edge.node.id },
      );
    }
  }
  if (seeded) {
    deleteScannedMenu(scanId, fileId);
    await deletePlace(placeId);
  }
  await api.dispose();
});

test("lines are grouped by type, cased, and carry your own reason", async ({
  page,
  noise,
}) => {
  await page.goto(`/places/${placeId}`);
  await expect(page.getByRole("heading", { name: placeName })).toBeVisible({
    timeout: 20_000,
  });
  const menu = page.getByRole("tabpanel");
  for (const group of ["Tea", "Cocktails", "Wine"]) {
    await expect(
      menu.getByRole("heading", { name: new RegExp(`^${group}`) }),
    ).toBeVisible();
  }
  // `menu_category` is null on every line: none of them is "Other" now.
  await expect(menu.getByRole("heading", { name: /^Other/ })).toHaveCount(0);
  await expect(
    menu.getByText("Negroni — Gin, Campari, Sweet Vermouth"),
  ).toBeVisible();
  await expect(menu.getByText("House Red")).toBeVisible();
  // The tea is yours at 4.5 — said as a fact, never as a percentage.
  const tea = menu.locator('[data-slot="menu-line"][data-group="TEA"]');
  await expect(tea.getByText("You ★4.5")).toBeVisible();
  await expect(menu).not.toContainText("%");
  // The price is the menu's number; no currency the read never saw.
  await expect(tea).toContainText("6.50");
  await expect(tea).not.toContainText("$");

  // Nothing runs off a 390 pt screen.
  const viewport = page.viewportSize();
  const edges = await edgesOf(tea);
  expect(edges.right).toBeLessThanOrEqual(viewport?.width ?? 390);
  expect(noise.pageErrors).toEqual([]);
});

test("I'm having this logs the drink at this place", async ({ page }) => {
  await page.goto(`/places/${placeId}`);
  const tea = page.locator('[data-slot="menu-line"][data-group="TEA"]');
  await tea.locator('button[data-slot="menu-line-open"]').click();

  const sheet = page.getByRole("dialog").filter({ hasText: "I'm having this" });
  await expect(sheet).toBeVisible();
  for (const name of [
    "Want to try",
    "Add to cellar",
    "Add to tier list",
    "Not this",
  ]) {
    await expect(sheet.getByRole("button", { name })).toBeVisible();
  }
  await sheet.getByRole("button", { name: "I'm having this" }).click();

  const log = page.getByRole("dialog", { name: "Log a drink" });
  await expect(log).toBeVisible();
  // The place is already filled in — that is the point of logging from here.
  await expect(log.getByText(placeName)).toBeVisible();
  await log.getByRole("button", { name: "Log it" }).click();
  await expect(page.getByText(`Logged ${teaName}`)).toBeVisible({
    timeout: 20_000,
  });

  const data = await api.query(
    `query Mine($id: ID!) {
       item(type: TEA, id: $id) {
         __typename
         ... on QueryItemSuccess { data { checkIns(first: 5, scope: MINE) {
           edges { node { id place { id } } }
         } } }
       }
     }`,
    { id: teaId },
  );
  const places = data.item.data.checkIns.edges.map(
    (edge: { node: { place: { id: string } | null } }) => edge.node.place?.id,
  );
  expect(places).toContain(placeId);
});

test("Not this unlinks a wrong match, and Undo puts it back", async ({
  page,
}) => {
  await page.goto(`/places/${placeId}`);
  const tea = page.locator('[data-slot="menu-line"][data-group="TEA"]');
  await tea.locator('button[data-slot="menu-line-open"]').click();
  const sheet = page.getByRole("dialog").filter({ hasText: "I'm having this" });
  await sheet.getByRole("button", { name: "Not this" }).click();
  await expect(page.getByText(/^Unlinked /)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Match restored")).toBeVisible({
    timeout: 20_000,
  });
  await page.keyboard.press("Escape");
  await expect(
    page
      .locator('[data-slot="menu-line"][data-group="TEA"]')
      .getByText("You ★4.5"),
  ).toBeVisible({ timeout: 20_000 });
});

test("an unmatched line drafts a catalog item and writes nothing until Add", async ({
  page,
}) => {
  await page.goto(`/places/${placeId}`);
  const wine = page.locator('[data-slot="menu-line"][data-group="WINE"]');
  await expect(wine.getByText("Not in the catalog yet")).toBeVisible();
  await wine.locator('button[data-slot="menu-line-open"]').click();
  const sheet = page.getByRole("dialog").filter({ hasText: "House Red" });
  await sheet.getByRole("button", { name: /Add to catalog/ }).click();

  const draft = page.getByRole("dialog", { name: "Add to catalog" });
  await expect(draft).toBeVisible();
  await expect(draft.getByRole("textbox", { name: /Name/ })).toHaveValue(
    "House Red",
  );
  await expect(
    draft.getByRole("button", { name: /Wine/, pressed: true }),
  ).toBeVisible();
  // Closing the card leaves the line exactly as it was.
  await page.keyboard.press("Escape");
  await expect(draft).toBeHidden();
  await expect(wine.getByText("Not in the catalog yet")).toBeVisible();
});
