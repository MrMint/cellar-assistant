import type { Page } from "@playwright/test";
import { expect, test } from "../../fixtures/mobile.ts";

/**
 * N20 · N01 — the search field never remounts while you type.
 *
 * On a phone a remount is not cosmetic: the focused `<input>` is replaced by a
 * new one, the soft keyboard closes mid-word, and the next keystrokes go
 * nowhere. Today `/search` renders `ClientSearchInterface` in one branch when
 * idle and another when `?q=` is set, so the first debounced navigation swaps
 * the input out (`shell-1`).
 *
 * The test types, waits for the URL to carry the query (the debounced
 * navigation has committed), and types again. It then requires the *same
 * element* — tagged before the first keystroke — to still hold focus and the
 * whole string. A focus check alone would pass an `autoFocus` remount that
 * drops the keystrokes typed during the swap; the identity check would not.
 *
 * No `waitForTimeout`: every wait is on the URL or on the DOM.
 */

const FIRST = "lag";
const REST = "avulin";

/** The one search box on `/search`. It has no label yet; it is the only one. */
const searchBox = (page: Page) =>
  page.getByRole("searchbox").or(page.getByRole("textbox")).first();

const queryIs = (term: string) => (url: URL) =>
  url.pathname === "/search" && url.searchParams.get("q") === term;

test("the search box keeps focus and every keystroke across the debounced navigation", async ({
  page,
  noise,
}) => {
  await page.goto("/search");
  const box = searchBox(page);
  await expect(box).toBeVisible();

  await box.tap();
  await expect(box, "tapping the search box did not focus it").toBeFocused();
  await box.evaluate((el) => {
    (el as HTMLElement & { __e2eSearchBox?: true }).__e2eSearchBox = true;
  });

  await page.keyboard.type(FIRST);
  await page.waitForURL(queryIs(FIRST));
  // The navigation has committed (the router writes the URL after the new
  // tree is in). Keep typing into whatever has focus now.
  await page.keyboard.type(REST);

  const state = await page.evaluate(() => {
    const active = document.activeElement as
      | (HTMLInputElement & { __e2eSearchBox?: true })
      | null;
    return {
      sameElement: active?.__e2eSearchBox === true,
      focusedTag: active?.tagName ?? null,
      value: active instanceof HTMLInputElement ? active.value : null,
    };
  });
  expect(
    state.sameElement,
    `the search input was replaced by a new element while typing (focus is now on ${state.focusedTag}) — N01: one persistent input`,
  ).toBe(true);
  expect(
    state.value,
    "keystrokes typed after the first debounced navigation were lost",
  ).toBe(FIRST + REST);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("q"), {
      message: "the URL never caught up with the full query",
    })
    .toBe(FIRST + REST);
  expect(noise.pageErrors).toEqual([]);
});

test("typing replaces the history entry instead of pushing one per pause", async ({
  page,
}) => {
  await page.goto("/search");
  const box = searchBox(page);
  await box.tap();
  const before = await page.evaluate(() => history.length);

  await page.keyboard.type(FIRST);
  await page.waitForURL(queryIs(FIRST));
  // Re-focus explicitly, so this test is about history alone and still
  // measures it while the remount above is unfixed.
  await box.focus();
  await page.keyboard.press("End");
  await page.keyboard.type(REST);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("q"), {
      message: "the URL never caught up with the full query",
    })
    .toBe(FIRST + REST);

  const after = await page.evaluate(() => history.length);
  expect(
    after - before,
    "every debounced pause pushed a history entry, so Back steps through " +
      "half-typed queries — N01: router.replace while typing, push only on commit",
  ).toBe(0);
});
