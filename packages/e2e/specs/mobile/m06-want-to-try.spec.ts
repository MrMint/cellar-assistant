import { edgesOf, expect, test } from "../../fixtures/mobile.ts";

/**
 * X08 · Want to try on a phone (390x844): Me › Lists has the row, the page
 * fits the screen with its filter at thumb reach, and the filter is the URL
 * (Back and a shared link land on the same view).
 */
test("Me › Lists › Want to try fits the phone and filters by kind", async ({
  page,
  noise,
}) => {
  await page.goto("/me");
  const link = page.getByRole("link", { name: "Want to try" });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/want-to-try$/);
  await expect(
    page.getByRole("heading", { name: "Want to try" }),
  ).toBeVisible();

  const filter = page.getByRole("radiogroup", { name: "Show" });
  await expect(filter).toBeVisible();
  const viewport = page.viewportSize();
  const edges = await edgesOf(filter);
  expect(edges.left).toBeGreaterThanOrEqual(0);
  expect(edges.right).toBeLessThanOrEqual(viewport?.width ?? 390);

  await filter.getByRole("radio", { name: "Places" }).click();
  await expect(page).toHaveURL(/\/want-to-try\?kind=places$/);
  await expect(filter.getByRole("radio", { name: "Places" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // No sideways scroll anywhere on the page at phone width.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  expect(noise.pageErrors).toEqual([]);
});
