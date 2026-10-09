import { unique } from "../../fixtures/data.ts";
import { edgesOf, expect, test } from "../../fixtures/mobile.ts";
import { Gql } from "../../fixtures/test.ts";

/**
 * X02 · the drink log, at 390×844 with a thumb.
 *
 * The item page's "Your log" (D8) starts empty with one action; "Log a drink"
 * opens a sheet whose primary action sits inside the viewport; a score, a note
 * and a typed tag log in one tap; the toast's Undo takes it back; logging
 * again and deleting it from the row's ⋯ empties the log at once — its toast's
 * Undo brings the same entry back (X03) — and a second delete empties it. The
 * review is never touched by a log's score (D5), which is asserted through
 * the API at the end.
 *
 * No bottle, no place, no friends: this is the bottle-less path the migration
 * exists for. Creates one catalog item and nothing else (no places).
 */
test.describe.configure({ mode: "serial" });

let api: Gql;
let teaId: string;
let teaName: string;

test.beforeAll(async () => {
  api = await Gql.forAccount("primary");
  const ref = await api.query(
    `query { referenceData(kind: TEA_CATEGORY, first: 1) {
       __typename ... on ReferenceRowConnection { edges { node { value } } }
     } }`,
  );
  const category = ref.referenceData.edges[0]?.node.value;
  expect(category, "no tea categories seeded").toBeTruthy();

  teaName = unique("E2 Log Tea");
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
        description: "An e2e tea for the drink log.",
        tea: { category },
      },
    },
  );
  expect(
    created.createItem.__typename,
    JSON.stringify(created.createItem),
  ).toBe("MutationCreateItemSuccess");
  teaId = created.createItem.data.id;
});

test.afterAll(async () => {
  // Leave no logs behind on the shared account.
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
  await api.dispose();
});

test("log a drink from the item page, undo it, log again, delete it", async ({
  page,
  noise,
}) => {
  await page.goto(`/teas/${teaId}`);
  await expect(page.getByRole("heading", { name: teaName })).toBeVisible();

  const log = page.locator("section", {
    has: page.getByRole("heading", { name: "Your log" }),
  });
  await log.scrollIntoViewIfNeeded();
  await expect(log.getByText("Nothing logged yet.")).toBeVisible({
    timeout: 20_000,
  });

  // ── Log one ──────────────────────────────────────────────────────────────
  await log.getByRole("button", { name: "Log a drink" }).click();
  const sheet = page.getByRole("dialog", { name: "Log a drink" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(teaName).first()).toBeVisible();

  // The primary action is reachable without scrolling the sheet — once the
  // sheet has finished sliding up (measured mid-animation it sits ~1400px
  // down, which says nothing about where it lands).
  const logIt = sheet.getByRole("button", { name: "Log it" });
  await expect(logIt).toBeVisible();
  const viewport = page.viewportSize();
  await expect
    .poll(async () => (await edgesOf(logIt)).bottom, { timeout: 5_000 })
    .toBeLessThanOrEqual(viewport?.height ?? 844);

  // The stars are visually-hidden radios (RatingInput); `check({ force })`
  // refuses an sr-only input inside the sheet as "outside of the viewport",
  // so pick one the way a keyboard user does.
  const fourStars = sheet.getByRole("radio", { name: /^4 stars/ });
  await fourStars.focus();
  await page.keyboard.press("Space");
  await expect(fourStars).toBeChecked();
  await sheet
    // The note's <section> is labelled by the same <label>, so name the
    // textbox rather than the label.
    .getByRole("textbox", { name: "Tasting note" })
    .fill("Grassy, a little smoky, long finish");
  await sheet.getByPlaceholder("Add a flavour").fill("Grassy");
  await sheet.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    sheet.getByRole("list", { name: "Your tags" }).getByText("grassy"),
  ).toBeVisible();
  await logIt.click();

  await expect(page.getByText(`Logged ${teaName}`)).toBeVisible({
    timeout: 20_000,
  });
  const entry = log.locator('[data-slot="drink-log-entry"]');
  await expect(entry).toHaveCount(1, { timeout: 20_000 });
  await expect(entry.first()).toContainText("Grassy, a little smoky");
  await expect(entry.first()).toContainText("grassy");

  // ── Undo ─────────────────────────────────────────────────────────────────
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(log.getByText("Nothing logged yet.")).toBeVisible({
    timeout: 20_000,
  });

  // ── Log again (nothing filled in: "I had this, today"), then delete ─────
  await log.getByRole("button", { name: "Log a drink" }).click();
  await page
    .getByRole("dialog", { name: "Log a drink" })
    .getByRole("button", { name: "Log it" })
    .click();
  await expect(entry).toHaveCount(1, { timeout: 20_000 });

  await entry
    .first()
    .getByRole("button", { name: "More for this log" })
    .click();
  // X03: no confirm — it goes at once, and the toast's Undo restores the
  // same entry; then delete it for good.
  await page.getByRole("button", { name: "Delete" }).first().click();
  await expect(log.getByText("Nothing logged yet.")).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(entry).toHaveCount(1, { timeout: 20_000 });
  await entry
    .first()
    .getByRole("button", { name: "More for this log" })
    .click();
  await page.getByRole("button", { name: "Delete" }).first().click();
  await expect(log.getByText("Nothing logged yet.")).toBeVisible({
    timeout: 20_000,
  });

  expect(noise.pageErrors).toEqual([]);
});

test("D5: a log's score is not the review", async () => {
  const id = crypto.randomUUID();
  const logged = await api.query(
    `mutation L($id: ID!, $input: LogDrinkInput!) {
       logDrink(id: $id, input: $input) {
         __typename
         ... on LoggedDrinkPayload { entry { id score } }
         ... on Error { message }
       }
     }`,
    { id, input: { item: { type: "TEA", id: teaId }, score: 2 } },
  );
  expect(logged.logDrink.__typename, JSON.stringify(logged.logDrink)).toBe(
    "LoggedDrinkPayload",
  );
  const data = await api.query(
    `query R($id: ID!) {
       item(type: TEA, id: $id) {
         __typename
         ... on QueryItemSuccess { data { score { average count } } }
       }
     }`,
    { id: teaId },
  );
  expect(data.item.data.score).toEqual({ average: null, count: 0 });
});
