import { createCellar, unique } from "../../fixtures/data.ts";
import { deleteCellarWithContents } from "../../fixtures/db.ts";
import { expect, stubCamera, test } from "../../fixtures/mobile.ts";
import { Gql } from "../../fixtures/test.ts";

/**
 * X05 · N21 — adding a bottle at 390x844, thumb-first.
 *
 * 1. The cellar's add page opens straight on the one camera (no type cards,
 *    no steps): a type picker that remembers, "Type it in instead", and —
 *    after the draft is saved — the success sheet's "+1 bottle", whose
 *    "Snap another" puts the camera back with the same type chosen.
 * 2. `/add` (no cellar pinned) defaults the draft card's "Into" row to the
 *    cellar last filed into.
 * 3. The item page's Add to Cellar is a sheet (cellar, quantity, "Already
 *    open?") and ends in a toast whose Undo takes the bottles back out.
 *
 * The camera is refused (`stubCamera`), so nothing is photographed and no
 * model is asked anything; the draft is typed. One cellar and one tea are
 * created through the API and removed afterwards; no places are created.
 */

test.describe.configure({ mode: "serial" });

let cellarId = "";
let cellarName = "";
let teaId = "";
let teaName = "";

const bottlesIn = async (api: Gql, id: string): Promise<string[]> => {
  const data = await api.query(
    `query C($id: ID!) { cellar(id: $id) {
       __typename
       ... on Cellar { items(first: 50) { edges { node { id item { id name } } } } }
     } }`,
    { id },
  );
  return data.cellar.items.edges.map(
    (edge: { node: { item: { name: string } } }) => edge.node.item.name,
  );
};

test.beforeAll(async () => {
  const api = await Gql.forAccount("primary");
  try {
    cellarName = unique("E2 Capture");
    cellarId = await createCellar(api, cellarName, "PRIVATE");
    const ref = await api.query(
      `query { referenceData(kind: TEA_CATEGORY, first: 1) {
         __typename ... on ReferenceRowConnection { edges { node { value } } }
       } }`,
    );
    const category = ref.referenceData.edges[0]?.node.value;
    teaName = unique("E2 Capture Tea");
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
    teaId = created.createItem.data.id;
  } finally {
    await api.dispose();
  }
});

test.afterAll(() => {
  if (cellarId !== "") deleteCellarWithContents(cellarId);
});

test("the cellar's add page: one camera, a remembered type, a draft, +1 bottle", async ({
  page,
  context,
  noise,
}) => {
  test.setTimeout(150_000);
  await stubCamera(context, "denied");
  await page.goto(`/cellars/${cellarId}/items/add`);

  await expect(
    page.getByRole("heading", { name: "Add a bottle" }),
  ).toBeVisible();
  const types = page.getByRole("radiogroup", { name: "What are you adding?" });
  await expect(types.getByRole("radio")).toHaveCount(6);
  await types.getByRole("radio", { name: "Tea" }).tap();
  await expect(types.getByRole("radio", { name: "Tea" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  // N04 holds: a refused camera still offers the library.
  await expect(
    page.getByRole("button", { name: /library/i }).first(),
  ).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Type it in instead" }).tap();
  const draft = page.locator('[data-slot="draft-card"]');
  await expect(draft).toBeVisible({ timeout: 45_000 });
  await expect(draft.getByText("Tea", { exact: true })).toBeVisible();

  const name = unique("E2 Capture Draft");
  await page.getByLabel("Name").fill(name);
  await page.getByRole("combobox", { name: /Category/ }).tap();
  await page.getByRole("option").first().tap();
  await page
    .getByRole("main")
    .getByRole("button", { name: "Add", exact: true })
    .tap();

  const sheet = page.getByRole("dialog", { name: "+1 bottle" });
  await expect(sheet).toBeVisible({ timeout: 60_000 });
  await expect(sheet).toContainText(`${name} is in ${cellarName}.`);
  await expect(
    sheet.getByRole("button", { name: "Open it now" }),
  ).toBeVisible();
  await sheet.getByRole("button", { name: "Snap another" }).tap();

  // Back on the camera, the type still Tea — the last used.
  await expect(
    page.getByRole("button", { name: "Type it in instead" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("radiogroup", { name: "What are you adding?" })
      .getByRole("radio", { name: "Tea" }),
  ).toHaveAttribute("aria-checked", "true");

  const api = await Gql.forAccount("primary");
  try {
    expect(await bottlesIn(api, cellarId)).toContain(name);
  } finally {
    await api.dispose();
  }
  expect(noise.pageErrors).toEqual([]);
});

test("/add defaults the draft's cellar to the last one filed into", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await stubCamera(context, "denied");
  // The cellar the previous test filed into is remembered per browser; this
  // context is fresh, so file the preference the way the app does.
  await page.goto(`/cellars/${cellarId}/items/add`);
  await page.evaluate((id) => {
    window.localStorage.setItem(
      "ca.capture.v1",
      JSON.stringify({ cellarId: id, itemType: "TEA" }),
    );
  }, cellarId);
  await page.goto("/add?mode=bottle");
  await page.getByRole("button", { name: "Type it in instead" }).tap();
  const draft = page.locator('[data-slot="draft-card"]');
  await expect(draft).toBeVisible({ timeout: 45_000 });
  await expect(
    draft.getByRole("combobox", { name: "Into" }),
    "the draft card did not default to the last cellar used",
  ).toContainText(cellarName);
});

test("item page: Add to Cellar is a sheet, and Undo takes the bottles back out", async ({
  page,
  noise,
}) => {
  test.setTimeout(90_000);
  const api = await Gql.forAccount("primary");
  try {
    const before = (await bottlesIn(api, cellarId)).filter(
      (n) => n === teaName,
    );
    await page.goto(`/teas/${teaId}`);
    await page.getByRole("button", { name: "Add to Cellar" }).tap();
    const sheet = page.getByRole("dialog", { name: "Add to cellar" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("radio", { name: cellarName }).tap();
    await sheet.getByRole("button", { name: "One more" }).tap();
    await expect(sheet.getByRole("switch")).toBeVisible();
    await sheet.getByRole("button", { name: "Add 2 bottles" }).tap();

    const toast = page.getByText(`Added 2 bottles to ${cellarName}`);
    await expect(toast).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(
        async () =>
          (await bottlesIn(api, cellarId)).filter((n) => n === teaName).length,
      )
      .toBe(before.length + 2);

    await page.getByRole("button", { name: "Undo" }).tap();
    await expect(page.getByText("Removed again")).toBeVisible({
      timeout: 20_000,
    });
    await expect
      .poll(
        async () =>
          (await bottlesIn(api, cellarId)).filter((n) => n === teaName).length,
      )
      .toBe(before.length);
  } finally {
    await api.dispose();
  }
  expect(noise.pageErrors).toEqual([]);
});
