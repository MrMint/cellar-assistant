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
 * 1. The bottle URL (X09's item page with that bottle selected) offers Pour
 *    **before** the bottle is opened, as the ActionBar's primary inside the
 *    viewport. Dragging the liquid moves the level (a
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

/** The tea's band on the test's list. */
const bandOnList = async (): Promise<number | undefined> => {
  const data = await api.query(
    `query L($id: ID!) { item(type: TEA, id: $id) { __typename
       ... on QueryItemSuccess { data {
         tierListEntries(first: 10) { edges { node { band tierList { id } } } } } } } }`,
    { id: teaId },
  );
  return (
    data.item.data.tierListEntries.edges as {
      node: { band: number; tierList: { id: string } | null };
    }[]
  ).find((edge) => edge.node.tierList?.id === tierListId)?.node.band;
};

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

  // The item page has no bottom bar now: Pour is the bottle row's own
  // action ("Steep from <cellar>"), before the bottle is opened too, since
  // the first pour opens it. Scrolled to, it is on screen above the tab bar.
  const pour = page.getByRole("button", { name: /^Steep from /, exact: false });
  await pour.scrollIntoViewIfNeeded();
  await expect(pour).toBeVisible({ timeout: 20_000 });
  const viewport = page.viewportSize();
  expect((await edgesOf(pour)).bottom).toBeLessThanOrEqual(
    viewport?.height ?? 844,
  );
  await expect(
    page.getByRole("button", { name: "Mark as opened" }),
  ).toBeVisible();

  await pour.click();
  const sheet = page.getByRole("dialog", { name: "Steep" });
  await expect(sheet).toBeVisible();
  const level = sheet.getByRole("slider", { name: "Level" });
  // A pot of tea is 8 g of a 100 g tin.
  await expect(level).toHaveAttribute("aria-valuenow", "92");

  // The level is the control: drag it down inside the bottle. The sheet
  // slides up from below the screen as it opens, so measure the bottle once
  // it is on screen and has stopped moving — measured mid-slide, the drag
  // lands on the overlay and closes the sheet instead.
  let settled = await level.boundingBox();
  await expect
    .poll(async () => {
      const now = await level.boundingBox();
      const still =
        now !== null &&
        settled !== null &&
        now.y === settled.y &&
        now.y + now.height <= (viewport?.height ?? 844);
      settled = now;
      return still;
    })
    .toBe(true);
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

  // A preset puts it exactly: a cup is 3 g (an option row, a radio).
  await sheet.getByRole("radio", { name: /^Cup/ }).click();
  await expect(level).toHaveAttribute("aria-valuenow", "97");
  const submit = sheet.getByRole("button", { name: "Steep 3 g" });
  await expect
    .poll(async () => (await edgesOf(submit)).bottom, { timeout: 5_000 })
    .toBeLessThanOrEqual(viewport?.height ?? 844);
  await submit.click();

  await expect(page.getByText("Steeped 3 g · 97% left")).toBeVisible({
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
  // The pour logged the drink: it is in "Your log".
  const log = page
    .locator("section", {
      has: page.getByRole("heading", { name: "Your log" }),
    })
    .locator('[data-slot="drink-log-entry"]');
  await expect(log).toHaveCount(1, { timeout: 20_000 });

  // Undo: the log goes, the level comes back, the seal too.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect
    .poll(async () => await bottleState(), { timeout: 20_000 })
    .toMatchObject({ openAt: null, percentageRemaining: 100 });
  await expect(
    page.getByRole("button", { name: "Mark as opened" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(log).toHaveCount(0, { timeout: 20_000 });

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
  await page.getByRole("button", { name: /^Steep from / }).click();
  const sheet = page.getByRole("dialog", { name: "Steep" });
  await sheet.getByRole("radio", { name: /^The rest/ }).click();
  await sheet.getByRole("button", { name: "Steep the last of it" }).click();

  const last = page.getByRole("dialog", { name: "That’s the last of it" });
  await expect(last).toBeVisible({ timeout: 20_000 });
  await last.getByRole("button", { name: "Finished" }).click();
  await expect(
    page.getByText("Finished. Moved out of the cellar."),
  ).toBeVisible({ timeout: 20_000 });

  const rate = page.getByRole("dialog", { name: "How was it?" });
  await expect(rate).toBeVisible({ timeout: 20_000 });
  // Save stays disabled until there is a score, and a trial click waits for
  // an enabled button, so pick the score before the hit test below.
  // The stars are visually-hidden radios: pick one as a keyboard does.
  const four = rate.getByRole("radio", { name: /^4\.5 stars/ });
  await four.focus();
  await page.keyboard.press("Space");
  await expect(four).toBeChecked();
  // Leftovers 3: the "Finished" Undo toast sits above the open sheet (M5's
  // `--sheet-inset`), so it never covers the sheet's action area. Prove it
  // while the toast is still showing: Save takes a hit-tested tap (a trial
  // click fails when another element would receive it) and the two boxes do
  // not overlap.
  const finished = page
    .locator("[data-sonner-toast]")
    .filter({ hasText: "Finished. Moved out of the cellar." });
  const save = rate.getByRole("button", { name: "Save 4.5" });
  await expect(page.locator("html[data-sheet-open]")).toHaveCount(1);
  await expect(finished).toBeVisible();
  await save.click({ trial: true });
  const [toastBox, saveBox] = await Promise.all([
    finished.boundingBox(),
    save.boundingBox(),
  ]);
  expect(toastBox, "the toast has a box").not.toBeNull();
  expect(saveBox, "Save has a box").not.toBeNull();
  if (toastBox !== null && saveBox !== null) {
    const overlaps =
      toastBox.x < saveBox.x + saveBox.width &&
      saveBox.x < toastBox.x + toastBox.width &&
      toastBox.y < saveBox.y + saveBox.height &&
      saveBox.y < toastBox.y + toastBox.height;
    expect(overlaps, "the toast covers the rating sheet's Save").toBe(false);
  }
  await save.click();

  // F2b's band sheet for the list it is on, showing where it really sits
  // (ruling 3): its title is the drink, its header the rank, band and list.
  const bands = page.getByRole("dialog", { name: teaName });
  await expect(bands).toBeVisible({ timeout: 20_000 });
  await expect(bands.getByText(`#1 · Good · ${listName}`)).toBeVisible();
  await expect(bands.getByRole("radio", { name: /^Good/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await bands.getByRole("radio", { name: /^Outstanding/ }).click();
  const moved = page
    .locator("[data-sonner-toast]")
    .filter({ hasText: `Moved to Outstanding · #1 · ${teaName}` });
  await expect(moved).toBeVisible({ timeout: 20_000 });
  await expect(bands).toBeHidden();
  await expect.poll(bandOnList, { timeout: 20_000 }).toBe(5);

  // The toast's Undo takes back this move, through the list's history.
  await moved.getByRole("button", { name: "Undo" }).click();
  await expect.poll(bandOnList, { timeout: 20_000 }).toBe(3);

  const state = await bottleState();
  expect(state.emptyAt, "the bottle is finished").not.toBeNull();
  const review = await api.query(
    `query R($id: ID!) { item(type: TEA, id: $id) { __typename
       ... on QueryItemSuccess { data { myReview { score }
         tierListEntries(first: 10) { edges { node { band tierList { id } } } } } } } }`,
    { id: teaId },
  );
  expect(review.item.data.myReview?.score).toBe(4.5);

  expect(noise.pageErrors).toEqual([]);
});
