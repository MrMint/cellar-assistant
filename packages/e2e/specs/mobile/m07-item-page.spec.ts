import { createCellar, unique } from "../../fixtures/data.ts";
import { deleteCellarWithContents } from "../../fixtures/db.ts";
import { bottomNav, edgesOf, expect, test } from "../../fixtures/mobile.ts";
import { Gql } from "../../fixtures/test.ts";

/**
 * X09 · one item page, at 390×844 with a thumb.
 *
 * 1. The taste header's three cells (You · Friends · Everyone) and the
 *    ActionBar (Log a drink · Add to cellar · Want to try · ⋯) fit the
 *    phone: nothing clips, the bar rides above the tab bar inside the
 *    viewport, and every control is a 44 pt target.
 * 2. "Your bottles": Pour opens the level in a sheet, and the row's Log
 *    opens "Log a drink" for that bottle.
 * 3. The bottle URL is the same page with that bottle selected.
 *
 * Creates one cellar (deleted after) and one tea; no places.
 */
test.describe.configure({ mode: "serial" });

let api: Gql;
let cellarId: string | undefined;
let cellarName: string;
let teaId: string;
let teaName: string;
let bottleId: string;

test.beforeAll(async () => {
  api = await Gql.forAccount("primary");
  cellarName = unique("E2 Item Cellar");
  cellarId = await createCellar(api, cellarName, "PRIVATE");
  const ref = await api.query(
    `query { referenceData(kind: TEA_CATEGORY, first: 1) {
       __typename ... on ReferenceRowConnection { edges { node { value } } }
     } }`,
  );
  const category = ref.referenceData.edges[0]?.node.value;
  expect(category, "no tea categories seeded").toBeTruthy();

  teaName = unique("E2 Item Tea");
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
      input: {
        name: teaName,
        description: "An e2e tea for the item page.",
        tea: { category, steepingTemperature: "80°C" },
      },
    },
  );
  expect(
    created.createItem.__typename,
    JSON.stringify(created.createItem),
  ).toBe("MutationCreateItemSuccess");
  teaId = created.createItem.data.id;

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
        item: { id: teaId, type: "TEA" },
        openAt: new Date().toISOString(),
      },
    },
  );
  expect(added.addItemToCellar.__typename).toBe("CellarItem");
  bottleId = added.addItemToCellar.id;
});

test.afterAll(async () => {
  // Leave no logs behind on the shared account; the cellar takes its bottle.
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
  if (cellarId !== undefined) deleteCellarWithContents(cellarId);
  await api.dispose();
});

test("the taste header and the ActionBar fit the phone, above the tab bar", async ({
  page,
  noise,
}) => {
  await page.goto(`/teas/${teaId}`);
  await expect(page.getByRole("heading", { name: teaName })).toBeVisible();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const width = viewport?.width ?? 390;
  const height = viewport?.height ?? 844;

  // You · Friends · Everyone: three cells in a row, none clipped.
  const ratings = page.getByRole("navigation", { name: "Ratings" });
  const cells = ratings.getByRole("link");
  await expect(cells).toHaveCount(3);
  await expect(cells.nth(0)).toHaveAccessibleName("You: Rate it");
  const rows = new Set<number>();
  for (let index = 0; index < 3; index += 1) {
    const cell = cells.nth(index);
    const edges = await edgesOf(cell);
    rows.add(Math.round(edges.top));
    expect(edges.left).toBeGreaterThanOrEqual(0);
    expect(edges.right).toBeLessThanOrEqual(width);
    expect(edges.bottom - edges.top).toBeGreaterThanOrEqual(44);
  }
  expect(rows.size, "the three cells share one row").toBe(1);

  // The ActionBar sits inside the viewport, above the tab bar.
  const bar = page.getByRole("toolbar", { name: "Item actions" });
  await expect(bar).toBeVisible();
  const barEdges = await edgesOf(bar);
  const tabs = await edgesOf(await bottomNav(page));
  expect(barEdges.bottom).toBeLessThanOrEqual(tabs.top + 1);
  expect(barEdges.top).toBeGreaterThan(height / 2);
  expect(barEdges.left).toBeGreaterThanOrEqual(0);
  expect(barEdges.right).toBeLessThanOrEqual(width);

  // Each control: a 44 pt target whose words are not clipped.
  for (const name of [
    "Log a drink",
    "Add to cellar",
    `Want to try ${teaName}`,
    "More actions",
  ]) {
    const control = bar.getByRole("button", { name, exact: true });
    await expect(control, name).toBeVisible();
    const edges = await edgesOf(control);
    expect(edges.bottom - edges.top, name).toBeGreaterThanOrEqual(44);
    expect(edges.right - edges.left, name).toBeGreaterThanOrEqual(44);
    const clipped = await control.evaluate(
      (el) => el.scrollWidth > el.clientWidth + 1,
    );
    expect(clipped, `${name} is clipped`).toBe(false);
  }
  // No sideways scroll anywhere on the page.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(noise.pageErrors).toEqual([]);
});

test("Your bottles: Pour opens the level, Log opens the sheet for that bottle", async ({
  page,
  noise,
}) => {
  await page.goto(`/teas/${teaId}`);
  const bottles = page.locator("section", {
    has: page.getByRole("heading", { name: "Your bottles" }),
  });
  await bottles.scrollIntoViewIfNeeded();
  await expect(bottles.getByText("Open · 100% left")).toBeVisible();

  await bottles
    .getByRole("button", { name: `Pour from ${cellarName}` })
    .click();
  const pour = page.getByRole("dialog", { name: "Pour" });
  await expect(pour.getByText("Remaining: 100%")).toBeVisible();
  const slider = pour.getByRole("slider", { name: "Remaining" });
  await slider.focus();
  // Ten steps down, from the keyboard: the level writes after its debounce.
  for (let step = 0; step < 10; step += 1) await slider.press("ArrowLeft");
  await expect(pour.getByText("Remaining: 90%")).toBeVisible();
  await expect
    .poll(
      async () => {
        const data = await api.query(
          `query B($c: ID!, $b: ID!) { cellar(id: $c) { __typename ... on Cellar { item(id: $b) { percentageRemaining } } } }`,
          { c: cellarId, b: bottleId },
        );
        return data.cellar?.item?.percentageRemaining;
      },
      { timeout: 20_000 },
    )
    .toBe(90);

  // "Log this drink" closes Pour and opens the log sheet.
  await pour.getByRole("button", { name: "Log this drink" }).click();
  const sheet = page.getByRole("dialog", { name: "Log a drink" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Log it" }).click();
  await expect(page.getByText(`Logged ${teaName}`)).toBeVisible({
    timeout: 20_000,
  });

  // The row's own Log, too.
  await bottles
    .getByRole("button", { name: `Log a drink from ${cellarName}` })
    .click();
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Log it" }).click();

  const log = page.locator("section", {
    has: page.getByRole("heading", { name: "Your log" }),
  });
  await expect(log.locator('[data-slot="drink-log-entry"]')).toHaveCount(2, {
    timeout: 20_000,
  });
  expect(noise.pageErrors).toEqual([]);
});

test("the bottle URL is this page with that bottle selected", async ({
  page,
  noise,
}) => {
  await page.goto(`/cellars/${cellarId}/teas/${bottleId}`);
  await expect(page.getByRole("heading", { name: teaName })).toBeVisible();
  await expect(page.getByTestId("selected-bottle")).toContainText(cellarName);
  const bottles = page.locator("section", {
    has: page.getByRole("heading", { name: "Your bottles" }),
  });
  await expect(bottles.locator('[aria-current="page"]')).toHaveText(cellarName);
  // Its level is inline on its own URL.
  await expect(
    bottles.getByRole("slider", { name: "Remaining" }),
  ).toBeVisible();
  // Delete bottle is in ⋯, last.
  await page
    .getByRole("toolbar", { name: "Item actions" })
    .getByRole("button", { name: "More actions" })
    .click();
  const sheet = page.getByRole("dialog");
  await expect(
    sheet.getByRole("button", { name: "Delete bottle" }),
  ).toBeVisible();
  const labels = (await sheet.getByRole("button").allTextContents())
    .map((label) => label.trim())
    .filter((label) => label !== "");
  expect(labels.at(-1)).toBe("Delete bottle");
  expect(noise.pageErrors).toEqual([]);
});
