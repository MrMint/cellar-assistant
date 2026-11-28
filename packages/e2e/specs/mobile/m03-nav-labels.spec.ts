import { bottomNav, expect, test } from "../../fixtures/mobile.ts";

/**
 * N20 · nav labels exist (observation 4, shell-13).
 *
 * The phone tab bar is four icons, a "…" and an avatar, with no text and no
 * accessible names: the titles live on a Tooltip wrapped around the list item,
 * not on the link, so a screen reader announces "link" five times and a
 * sighted user has to guess. D1 asks for labelled tabs.
 *
 * Every control in the bar must have a non-empty accessible name — visible
 * text counts, since a link's text is its name, and so does an `aria-label`.
 * Checked on three tabs' pages, so the active tab is covered too. All
 * offenders are reported at once (`expect.soft`), not just the first.
 */

// Home (`/`), not `/search`: since X10 the search sheet is full screen and
// has no tab bar to check.
for (const route of ["/cellars", "/", "/map"]) {
  test(`every tab-bar control is named on ${route}`, async ({ page }) => {
    await page.goto(route);
    const nav = await bottomNav(page);

    const controls = nav
      .locator('a[href], button, [role="button"], [role="tab"]')
      .filter({ visible: true });
    const count = await controls.count();
    expect(count, "the tab bar has no links or buttons").toBeGreaterThan(1);

    for (let i = 0; i < count; i++) {
      const control = controls.nth(i);
      // A button nested in a tab's link is named by that link's href.
      const what = await control.evaluate((el) => {
        const href = el.closest("a[href]")?.getAttribute("href");
        return `${el.tagName.toLowerCase()}${href == null ? "" : ` in href="${href}"`}`;
      });
      await expect
        .soft(control, `tab-bar control #${i + 1} (${what}) has no name`)
        .toHaveAccessibleName(/\S/, { timeout: 2_000 });
    }
  });
}
