import type { Page } from "@playwright/test";
import { bottomNav, expect, test } from "../../fixtures/mobile.ts";

/**
 * B05 · route motion.
 *
 * A push slides forward, Back slides back, a tab switch crossfades — each is
 * a React transition type (`nav-forward`, `nav-back`, `nav-tab`) that reaches
 * `document.startViewTransition`. The init script below records the types of
 * every View Transition the page starts, so the spec can tell the kinds
 * apart without reading pixels. Browser Back (`page.goBack()`) carries no
 * type from Next; `RouteTransition` gives it one from the nav-history stack,
 * which is the part most worth proving in a real browser.
 *
 * Each run also asserts the final URL and a clean console. Two more runs
 * cover the fallbacks: reduced motion starts no typed transition at all, and
 * a browser with no View Transition API still navigates, with no errors.
 */

declare global {
  interface Window {
    __vtTypes?: string[][];
  }
}

/** Record the `types` of every View Transition the page starts. */
async function recordTransitions(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__vtTypes = [];
    const original = document.startViewTransition?.bind(document);
    if (original === undefined) return;
    document.startViewTransition = ((arg?: unknown) => {
      const types =
        typeof arg === "object" && arg !== null && "types" in arg
          ? [...((arg as { types?: Iterable<string> }).types ?? [])]
          : [];
      window.__vtTypes?.push(types);
      return original(arg as Parameters<typeof original>[0]);
    }) as typeof document.startViewTransition;
  });
}

/** The nav-* types seen since the last call (and forget them). */
async function takeNavTypes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const seen = (window.__vtTypes ?? []).flat();
    window.__vtTypes = [];
    return seen.filter((type) => type.startsWith("nav-"));
  });
}

/** The first cellar's own page link on `/cellars`. */
const firstCellar = (page: Page) =>
  page.locator('main a[href^="/cellars/"]:not([href="/cellars/add"])').first();

/** Forward into a cellar, browser Back out, across two tabs and Back. */
async function walk(page: Page): Promise<void> {
  await page.goto("/");
  const nav = await bottomNav(page);

  await nav.getByRole("link", { name: "Cellar" }).click();
  await expect(page).toHaveURL(/\/cellars$/);

  const cellar = firstCellar(page);
  const href = await cellar.getAttribute("href");
  expect(href, "the seeded account has a cellar").toBeTruthy();
  await cellar.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));

  await page.goBack();
  await expect(page).toHaveURL(/\/cellars$/);

  await (await bottomNav(page))
    .getByRole("link", { name: "Me", exact: true })
    .click();
  await expect(page).toHaveURL(/\/me$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/cellars$/);
}

test("forward, back and tab switches each carry their kind", async ({
  page,
  noise,
}) => {
  await recordTransitions(page);
  await page.goto("/");
  const nav = await bottomNav(page);
  await takeNavTypes(page);

  await nav.getByRole("link", { name: "Cellar" }).click();
  await expect(page).toHaveURL(/\/cellars$/);
  await expect.poll(() => takeNavTypes(page)).toEqual(["nav-tab"]);

  const cellar = firstCellar(page);
  const href = await cellar.getAttribute("href");
  expect(href, "the seeded account has a cellar").toBeTruthy();
  await cellar.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect.poll(() => takeNavTypes(page)).toEqual(["nav-forward"]);

  // Browser Back: no type from Next; RouteTransition reads the stack.
  await page.goBack();
  await expect(page).toHaveURL(/\/cellars$/);
  await expect.poll(() => takeNavTypes(page)).toEqual(["nav-back"]);

  await (await bottomNav(page))
    .getByRole("link", { name: "Me", exact: true })
    .click();
  await expect(page).toHaveURL(/\/me$/);
  await expect.poll(() => takeNavTypes(page)).toEqual(["nav-tab"]);

  // Back between two tabs' roots is a tab switch, not a slide.
  await page.goBack();
  await expect(page).toHaveURL(/\/cellars$/);
  await expect.poll(() => takeNavTypes(page)).toEqual(["nav-tab"]);

  // The bars are anchored by name, outside the sliding page.
  const anchored = await page.evaluate(() =>
    getComputedStyle(
      document.querySelector('[data-slot="tab-bar"]') ?? document.body,
    ).getPropertyValue("view-transition-name"),
  );
  expect(anchored).toBe("ca-tab-bar");

  expect(noise.pageErrors).toEqual([]);
  expect(noise.console).toEqual([]);
});

test("reduced motion: the same walk starts no typed transition", async ({
  page,
  noise,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await recordTransitions(page);
  await walk(page);
  expect(await takeNavTypes(page)).toEqual([]);
  expect(noise.pageErrors).toEqual([]);
  expect(noise.console).toEqual([]);
});

test("no View Transition API: navigation still works, with no errors", async ({
  page,
  noise,
}) => {
  await page.addInitScript(() => {
    // An older browser: React and our code both see no API.
    Reflect.deleteProperty(Document.prototype, "startViewTransition");
  });
  await walk(page);
  expect(await page.evaluate(() => typeof document.startViewTransition)).toBe(
    "undefined",
  );
  expect(noise.pageErrors).toEqual([]);
  expect(noise.console).toEqual([]);
});
