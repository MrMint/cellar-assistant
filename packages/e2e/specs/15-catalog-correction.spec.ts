import { firstReferenceValue, onboardItem } from "../fixtures/catalog.ts";
import { aiCapabilities, unique } from "../fixtures/data.ts";
import { bodyText, expect, test, watch } from "../fixtures/test.ts";

/**
 * X19 — the catalog correction loop, and D8's one-tap brand change.
 *
 * - A non-vintage wine can exist (`wines.vintage` NULL), reads "NV" wherever a
 *   year would be, and its edit form shows the NV chip pressed; a year and NV
 *   round-trip through Save in both directions.
 * - A coffee needs no description.
 * - The creator corrects the brand from the item page in one tap — "Wrong
 *   brand? Change it" (or "Add the brand") — and the toast's Undo puts the
 *   previous brand back.
 * - The edit form carries the brand, and offers the AI helpers only where
 *   they can work; a suggestion never fills a field by itself.
 *
 * Items are made through the API (`onboardItem`): a wine cannot be created
 * outside an onboarding. Items have no delete, so they outlive the run. No
 * places are created.
 */
test.describe.configure({ mode: "serial" });

let wineId: string;
let wineName: string;
const firstBrand = unique("E2 Wrong Brand");
const secondBrand = unique("E2 Right Brand");

test("fixtures: a non-vintage wine with no brand", async ({ api }) => {
  wineName = unique("E2 NV Cuvée");
  wineId = await onboardItem(api, {
    type: "WINE",
    name: wineName,
    // An explicit `null` is the answer "NV" (stored NULL). Leaving the key
    // out is refused: nobody said it was non-vintage.
    attributes: {
      vintage: null,
      style: await firstReferenceValue(api, "WINE_STYLE"),
    },
  });
  const read = await api.query(
    `query I($id: ID!) { item(id: $id, type: WINE) {
       __typename ... on QueryItemSuccess { data { ... on Wine { vintage } } }
     } }`,
    { id: wineId },
  );
  expect(read.item.data.vintage).toBeNull();
});

test("a coffee can be added without a description", async ({ api }) => {
  const coffeeId = await onboardItem(api, {
    type: "COFFEE",
    name: unique("E2 Coffee No Description"),
    attributes: {},
  });
  const read = await api.query(
    `query I($id: ID!) { item(id: $id, type: COFFEE) {
       __typename ... on QueryItemSuccess { data { description } }
     } }`,
    { id: coffeeId },
  );
  expect(read.item.data.description).toBeNull();
});

test("the item page says NV, and the creator can add the brand in one tap", async ({
  primary,
}) => {
  const noise = watch(primary);
  await primary.goto(`/wines/${wineId}`);
  await expect(primary.getByRole("heading", { name: wineName })).toBeVisible();
  expect(await bodyText(primary)).toMatch(/\bNV\b/);

  await primary.getByRole("button", { name: "Add the brand" }).click();
  const sheet = primary.getByRole("dialog", { name: "Add the brand" });
  await expect(sheet).toBeVisible();
  const save = sheet.getByRole("button", { name: "Save brand" });
  await expect(save).toBeDisabled();
  await sheet.getByRole("combobox", { name: "Brand" }).fill(firstBrand);
  await save.click();

  await expect(primary.getByText(`Brand changed to ${firstBrand}`)).toBeVisible(
    { timeout: 15_000 },
  );
  await expect(
    primary.getByRole("link", { name: firstBrand, exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  expect(noise.pageErrors).toEqual([]);
});

test("Wrong brand? Change it — and Undo puts it back", async ({ primary }) => {
  await primary.goto(`/wines/${wineId}`);
  await primary.getByRole("button", { name: "Wrong brand? Change it" }).click();
  const sheet = primary.getByRole("dialog", { name: "Change the brand" });
  await expect(sheet).toContainText(`filed under ${firstBrand}`);
  await sheet.getByRole("combobox", { name: "Brand" }).fill(secondBrand);
  await sheet.getByRole("button", { name: "Save brand" }).click();

  const toast = primary.getByText(`Brand changed to ${secondBrand}`);
  await expect(toast).toBeVisible({ timeout: 15_000 });
  await expect(
    primary.getByRole("link", { name: secondBrand, exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  // One brand, not two: the wrong one is gone, not demoted.
  await expect(
    primary.getByRole("link", { name: firstBrand, exact: true }),
  ).toHaveCount(0);

  await primary.getByRole("button", { name: "Undo" }).click();
  await expect(
    primary.getByRole("link", { name: firstBrand, exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    primary.getByRole("link", { name: secondBrand, exact: true }),
  ).toHaveCount(0);
});

test("the edit form: NV pressed, the brand in place, and a year round-trips", async ({
  primary,
}) => {
  await primary.goto(`/wines/${wineId}/edit`);
  const nv = primary.getByRole("button", { name: "NV", exact: true });
  await expect(nv).toHaveAttribute("aria-pressed", "true");
  await expect(primary.getByRole("combobox", { name: "Brand" })).toHaveValue(
    firstBrand,
  );

  await nv.click();
  await expect(nv).toHaveAttribute("aria-pressed", "false");
  await primary.getByLabel("Vintage").fill("2018");
  await primary.getByRole("button", { name: "Save", exact: true }).click();
  await expect(primary).toHaveURL(new RegExp(`/wines/${wineId}$`), {
    timeout: 15_000,
  });
  await expect(primary.getByText(/\b2018\b/).first()).toBeVisible();

  // And back to NV.
  await primary.goto(`/wines/${wineId}/edit`);
  await primary.getByRole("button", { name: "NV", exact: true }).click();
  await primary.getByRole("button", { name: "Save", exact: true }).click();
  await expect(primary).toHaveURL(new RegExp(`/wines/${wineId}$`), {
    timeout: 15_000,
  });
  expect(await bodyText(primary)).toMatch(/\bNV\b/);
});

test("the AI helpers are offered only where they can work, and only propose", async ({
  primary,
  api,
}) => {
  const capabilities = await aiCapabilities(api);
  await primary.goto(`/wines/${wineId}/edit`);
  await expect(primary.getByRole("combobox", { name: "Brand" })).toBeVisible();
  // This wine was onboarded with no photograph: nothing to re-read.
  await expect(
    primary.getByRole("button", { name: "Re-read label" }),
  ).toHaveCount(0);

  const suggest = primary.getByRole("button", { name: "Suggest details" });
  if (!capabilities.detailSuggestions) {
    await expect(suggest).toHaveCount(0);
    return;
  }
  await expect(suggest).toBeVisible();
  const region = primary.getByLabel("Region", { exact: true });
  const before = await region.inputValue();
  await suggest.click();
  // Whatever the model says — suggestions, an abstention, or a refusal —
  // the panel says something, and no field has changed by itself.
  await expect(
    primary
      .getByText(
        /suggestions? below|Nothing to suggest|Not sure what this is|didn't go through|Not available|limit|Taking a break/,
      )
      .first(),
  ).toBeVisible({ timeout: 90_000 });
  expect(await region.inputValue()).toBe(before);
});
