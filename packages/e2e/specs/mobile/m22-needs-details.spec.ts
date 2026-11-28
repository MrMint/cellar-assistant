import { unique } from "../../fixtures/data.ts";
import { edgesOf, expect, test } from "../../fixtures/mobile.ts";
import { Gql } from "../../fixtures/test.ts";

/**
 * K2 · Needs details on a phone (390x844, Capture-Place 08 to 15): a saved
 * draft is listed with what it still needs, the chips filter by that, the
 * finish-one sheet says how many are left, a Save that completes the draft
 * takes it off the list with an Undo, and Undo puts it back.
 *
 * The draft is made through the API: `startItemOnboarding` with no photo
 * leaves an open session (refused, nothing to read), and `saveDraft` files
 * it as Needs details — but only while it is below the server's floor
 * (`draftMeetsFloor`): a name alone meets a beer's, so a named beer keeps
 * its open status and is never listed. The draft is a wine with no style,
 * which the floor refuses. There is no draft delete, so the draft outlives the
 * run; its name is unique, and the spec only ever looks for its own row.
 */

let api: Gql;
const name = unique("M22 draft wine");

test.beforeAll(async () => {
  api = await Gql.forAccount("primary");
  const onboardingId = crypto.randomUUID();
  await api.query(
    `mutation S($id: ID!) {
       startItemOnboarding(input: { itemType: WINE }, onboardingId: $id) {
         __typename
       }
     }`,
    { id: onboardingId },
  );
  const saved = await api.query(
    `mutation D($input: SaveDraftInput!) {
       saveDraft(input: $input) {
         __typename
         ... on ItemOnboarding { status }
         ... on Error { message }
       }
     }`,
    {
      input: {
        onboardingId,
        fields: { name },
        confirmedFields: ["name"],
        vintageAnswer: "UNANSWERED",
      },
    },
  );
  if (saved.saveDraft.__typename.endsWith("Error")) {
    throw new Error(`saveDraft refused: ${JSON.stringify(saved.saveDraft)}`);
  }
  // Only a draft below the floor is listed; say so here, not as a missing row.
  if (saved.saveDraft.status !== "NEEDS_DETAILS") {
    throw new Error(
      `the draft is ${saved.saveDraft.status}, not NEEDS_DETAILS: it would not be listed`,
    );
  }
});

test.afterAll(async () => {
  await api.dispose();
});

test("Needs details lists the draft, filters it, and finishes it with an Undo", async ({
  page,
  noise,
}) => {
  await page.goto("/needs-details");
  await expect(
    page.getByRole("heading", { name: "Needs details" }),
  ).toBeVisible();

  const row = page.locator('[data-slot="draft-row"]', { hasText: name });
  await expect(row).toBeVisible();
  await expect(row).toContainText(/Needs winery/);

  // The chips filter by what is missing; the draft needs a maker.
  const maker = page.getByRole("button", { name: /^Maker/ });
  await maker.click();
  await expect(row).toBeVisible();

  const viewport = page.viewportSize();
  const edges = await edgesOf(row);
  expect(edges.left).toBeGreaterThanOrEqual(0);
  expect(edges.right).toBeLessThanOrEqual(viewport?.width ?? 390);

  await row.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText(/\d+ left/);
  await expect(sheet.getByRole("button", { name: "Not now" })).toBeVisible();

  // Every need filled, so the Save completes the draft.
  await sheet.getByRole("combobox", { name: "Brand" }).fill("M22 Cellars");
  await sheet.getByLabel("Style").selectOption({ index: 1 });
  await sheet.getByLabel("Strength").fill("13.5");
  await sheet.getByRole("button", { name: "No vintage" }).click();
  await sheet.getByRole("button", { name: "Save", exact: true }).click();

  // Complete: the row leaves, and the toast offers Undo before it is filed.
  const toast = page
    .locator("[data-sonner-toast]")
    .filter({ hasText: "Saved" });
  await expect(toast).toBeVisible();
  await expect(row).toHaveCount(0);
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(row).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  expect(noise.pageErrors).toEqual([]);
});
