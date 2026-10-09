import { createCellar, unique } from "../../fixtures/data.ts";
import { deleteCellarWithContents } from "../../fixtures/db.ts";
import { edgesOf, expect, test } from "../../fixtures/mobile.ts";
import { Gql } from "../../fixtures/test.ts";

/**
 * X03 · the Pour sheet, at 390x844 with a thumb.
 *
 * One sealed tea in a fresh private cellar, and a tier list it sits on in
 * Good:
 *
 * 1. The bottle page offers Pour **before** the bottle is opened, in the
 *    ActionBar inside the viewport. Dragging the liquid moves the level (a
 *    slider); a preset sets it exactly; the pour logs a drink, opens the
 *    bottle and sets the level in one tap; the toast's Undo seals it again
 *    and takes the log back.
 * 2. The last pour asks "Finished?" in the sheet; Finished empties the
 *    bottle (N13a's toast), then the sheet asks for the item's rating (the
 *    review) and offers the band that rating reads as on the tier list.
 *
 * Teas, because `createItem` writes a tea without the onboarding flow.
 * Items have no delete, so the tea (and the review step 2 gives it) outlive
 * the run; the cellar, its bottle, its logs and the tier list do not. No
 * places are created.
 */
test.describe.configure({ mode: "serial" });

let api: Gql;
let cellarId: string | undefined;
let tierListId: string | undefined;
let bottleId: string;
let teaId: string;
const teaName = unique("E2 Pour Tea");
const listName = unique("E2 Pour List");

test.beforeAll(async () => {
  api = await Gql.forAccount("primary");
  cellarId = await createCellar(api, unique("E2 Pour Cellar"), "PRIVATE");
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
    { id: crypto.randomUUID(), input: { name: teaName, tea: { category } } },
  );
  expect(
    created.createItem.__typename,
    JSON.stringify(created.createItem),
  ).toBe("MutationCreateItemSuccess");
  teaId = created.createItem.data.id;

  bottleId = crypto.randomUUID();
  const added = await api.query(
    `mutation A($cellarId: ID!, $input: AddCellarItemInput!) {
       addItemToCellar(cellarId: $cellarId, input: $input) {
         __typename ... on CellarItem { id } ... on Error { message }
       }
     }`,
    {
      cellarId,
      input: { cellarItemId: bottleId, item: { id: teaId, type: "TEA" } },
    },
  );
  expect(added.addItemToCellar.__typename).toBe("CellarItem");

  const list = await api.query(
    `mutation T($input: CreateTierListInput!) {
       createTierList(input: $input) { __typename ... on TierList { id } ... on Error { message } }
     }`,
    { input: { name: listName, privacy: "PRIVATE", listType: "tea" } },
  );
  expect(list.createTierList.__typename).toBe("TierList");
  tierListId = list.createTierList.id;
  const entry = await api.query(
    `mutation E($id: ID!, $input: AddTierListItemInput!) {
       addTierListItem(tierListId: $id, input: $input) { __typename }
     }`,
    { id: tierListId, input: { entry: { id: teaId, type: "TEA" }, band: 3 } },
  );
  expect(entry.addTierListItem.__typename).toBe("TierListItem");
});

test.afterAll(async () => {
  try {
    if (tierListId !== undefined) {
      await api.query(
        `mutation D($id: ID!) { deleteTierList(tierListId: $id) { __typename } }`,
        { id: tierListId },
      );
    }
  } finally {
    // The cellar, its bottle and the logs poured from it.
    if (cellarId !== undefined) deleteCellarWithContents(cellarId);
    await api.dispose();
  }
});

const bottleState = async () => {
  const data = await api.query(
    `query B($cellarId: ID!, $id: ID!) {
       cellar(id: $cellarId) { __typename ... on Cellar {
         item(id: $id) { openAt emptyAt percentageRemaining } } }
     }`,
    { cellarId, id: bottleId },
  );
  return data.cellar.item as {
    openAt: string | null;
    emptyAt: string | null;
    percentageRemaining: number;
  };
};

test("a sealed bottle pours: the first pour opens it, and Undo seals it again", async ({
  page,
  noise,
}) => {
  await page.goto(`/cellars/${cellarId}/teas/${bottleId}`);
  await expect(page.getByRole("heading", { name: teaName })).toBeVisible();

  // Before the bottle is opened, Pour is the page's primary action — in the
  // thumb zone, above the tab bar, without scrolling.
  const bar = page.getByRole("toolbar", { name: "This bottle" });
  const pour = bar.getByRole("button", { name: "Pour", exact: true });
  await expect(pour).toBeVisible({ timeout: 20_000 });
  const viewport = page.viewportSize();
  expect((await edgesOf(pour)).bottom).toBeLessThanOrEqual(
    viewport?.height ?? 844,
  );
  await expect(
    page.getByRole("button", { name: "Mark as opened" }),
  ).toBeVisible();

  await pour.click();
  const sheet = page.getByRole("dialog", { name: "Pour" });
  await expect(sheet).toBeVisible();
  const level = sheet.getByRole("slider", { name: "Level" });
  // A pot of tea is 8 g of a 100 g tin.
  await expect(level).toHaveAttribute("aria-valuenow", "92");

  // The level is the control: drag it down inside the bottle.
  const box = await level.boundingBox();
  expect(box, "the bottle is drawn").not.toBeNull();
  if (box !== null) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.4);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.75, {
      steps: 6,
    });
    await page.mouse.up();
  }
  await expect
    .poll(async () => Number(await level.getAttribute("aria-valuenow")))
    .toBeLessThan(80);

  // A preset puts it exactly: a cup is 3 g.
  await sheet.getByRole("button", { name: /^Cup/ }).click();
  await expect(level).toHaveAttribute("aria-valuenow", "97");
  const submit = sheet.getByRole("button", { name: "Pour 3 g" });
  await expect
    .poll(async () => (await edgesOf(submit)).bottom, { timeout: 5_000 })
    .toBeLessThanOrEqual(viewport?.height ?? 844);
  await submit.click();

  await expect(page.getByText("Poured 3 g · 97% left")).toBeVisible({
    timeout: 20_000,
  });
  await expect
    .poll(async () => (await bottleState()).percentageRemaining)
    .toBe(97);
  expect(
    (await bottleState()).openAt,
    "the first pour opened it",
  ).not.toBeNull();
  await expect(page.getByText("Remaining: 97%")).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByRole("list", { name: "Check-ins" }).locator("time").first(),
  ).toBeVisible({ timeout: 20_000 });

  // Undo: the log goes, the level comes back, the seal too.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect
    .poll(async () => await bottleState(), { timeout: 20_000 })
    .toMatchObject({ openAt: null, percentageRemaining: 100 });
  await expect(
    page.getByRole("button", { name: "Mark as opened" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("list", { name: "Check-ins" })).toHaveCount(0);

  expect(noise.pageErrors).toEqual([]);
});

test("the last pour: Finished, then the rating, then the band it reads as", async ({
  page,
  noise,
}) => {
  // A bottle with a little left.
  const set = await api.query(
    `mutation U($cellarId: ID!, $id: ID!, $input: UpdateCellarItemInput!) {
       updateCellarItem(cellarId: $cellarId, cellarItemId: $id, input: $input) { __typename }
     }`,
    {
      cellarId,
      id: bottleId,
      input: { percentageRemaining: 6, openAt: new Date().toISOString() },
    },
  );
  expect(set.updateCellarItem.__typename).toBe("CellarItem");

  await page.goto(`/cellars/${cellarId}/teas/${bottleId}`);
  await page
    .getByRole("toolbar", { name: "This bottle" })
    .getByRole("button", { name: "Pour", exact: true })
    .click();
  const sheet = page.getByRole("dialog", { name: "Pour" });
  await sheet.getByRole("button", { name: "The rest" }).click();
  await sheet.getByRole("button", { name: "Pour the last of it" }).click();

  const last = page.getByRole("dialog", { name: "That's the last of it" });
  await expect(last).toBeVisible({ timeout: 20_000 });
  await last.getByRole("button", { name: "Finished" }).click();
  await expect(
    page.getByText("Finished. Moved out of the cellar."),
  ).toBeVisible({ timeout: 20_000 });

  const rate = page.getByRole("dialog", { name: "How was it?" });
  await expect(rate).toBeVisible({ timeout: 20_000 });
  // The stars are visually-hidden radios: pick one as a keyboard does.
  const four = rate.getByRole("radio", { name: /^4\.5 stars/ });
  await four.focus();
  await page.keyboard.press("Space");
  await expect(four).toBeChecked();
  await rate.getByRole("button", { name: "Save rating" }).click();

  const lists = page.getByRole("dialog", { name: "On your lists" });
  await expect(lists).toBeVisible({ timeout: 20_000 });
  await expect(lists.getByText(listName)).toBeVisible();
  await lists.getByRole("button", { name: "Move to Outstanding" }).click();
  await expect(
    page.getByText(`Moved ${teaName} to Outstanding on ${listName}`),
  ).toBeVisible({ timeout: 20_000 });
  await lists.getByRole("button", { name: "Done" }).click();

  const state = await bottleState();
  expect(state.emptyAt, "the bottle is finished").not.toBeNull();
  const review = await api.query(
    `query R($id: ID!) { item(type: TEA, id: $id) { __typename
       ... on QueryItemSuccess { data { myReview { score }
         tierListEntries(first: 10) { edges { node { band tierList { id } } } } } } } }`,
    { id: teaId },
  );
  expect(review.item.data.myReview?.score).toBe(4.5);
  const onList = (
    review.item.data.tierListEntries.edges as {
      node: { band: number; tierList: { id: string } | null };
    }[]
  ).find((edge) => edge.node.tierList?.id === tierListId);
  expect(onList?.node.band, "moved to Outstanding").toBe(5);

  expect(noise.pageErrors).toEqual([]);
});
