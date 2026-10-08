import { firstReferenceValue, onboardItem } from "../../fixtures/catalog.ts";
import { unique } from "../../fixtures/data.ts";
import { edgesOf, expect, test } from "../../fixtures/mobile.ts";
import { Gql } from "../../fixtures/test.ts";

/**
 * X19 / D8 at 390x844, thumb-first: the brand correction is a bottom sheet
 * whose picker and Save sit on screen above the tab bar, and the wine
 * vintage's year field and NV chip share one row inside the gutter, the chip
 * a full touch target.
 *
 * One wine, made through the API with a brand (`onboardItem`); items have no
 * delete. No places are created.
 */
test.use({ viewport: { width: 390, height: 844 } });

let wineId: string;

test.beforeAll(async () => {
  const api = await Gql.forAccount("primary");
  try {
    wineId = await onboardItem(api, {
      type: "WINE",
      name: unique("E2 Mobile NV"),
      brandName: unique("E2 Mobile Brand"),
      attributes: { style: await firstReferenceValue(api, "WINE_STYLE") },
    });
  } finally {
    await api.dispose();
  }
});

test("Wrong brand? Change it opens a sheet with the picker and Save in reach", async ({
  page,
}) => {
  await page.goto(`/wines/${wineId}`);
  const change = page.getByRole("button", { name: "Wrong brand? Change it" });
  await change.scrollIntoViewIfNeeded();
  const trigger = await edgesOf(change);
  expect(trigger.bottom - trigger.top).toBeGreaterThanOrEqual(44);

  await change.click();
  const sheet = page.getByRole("dialog", { name: "Change the brand" });
  await expect(sheet).toBeVisible();
  const picker = sheet.getByRole("combobox", { name: "Brand" });
  const save = sheet.getByRole("button", { name: "Save brand" });
  await expect(picker).toBeVisible();
  await expect(save).toBeVisible();
  const saveEdges = await edgesOf(save);
  expect(saveEdges.bottom).toBeLessThanOrEqual(844);
  expect(saveEdges.left).toBeGreaterThanOrEqual(16);
  expect(saveEdges.right).toBeLessThanOrEqual(390 - 16);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the vintage row: year and NV side by side, inside the gutter", async ({
  page,
}) => {
  await page.goto(`/wines/${wineId}/edit`);
  const nv = page.getByRole("button", { name: "NV", exact: true });
  await nv.scrollIntoViewIfNeeded();
  await expect(nv).toHaveAttribute("aria-pressed", "true");
  const year = page.getByLabel("Vintage");
  const [nvEdges, yearEdges] = await Promise.all([edgesOf(nv), edgesOf(year)]);
  // One row: the chip sits beside the year, not under it.
  expect(Math.abs(nvEdges.top - yearEdges.top)).toBeLessThan(12);
  expect(nvEdges.right).toBeLessThanOrEqual(390 - 16);
  expect(yearEdges.left).toBeGreaterThanOrEqual(16);
  // 36 px drawn, 44 px to the thumb (FilterChip's touch extension).
  const target = await nv.evaluate((el) => {
    const after = getComputedStyle(el, "::after");
    const box = el.getBoundingClientRect();
    return (
      box.height +
      Math.max(0, -Number.parseFloat(after.top || "0")) +
      Math.max(0, -Number.parseFloat(after.bottom || "0"))
    );
  });
  expect(target).toBeGreaterThanOrEqual(44);
});
