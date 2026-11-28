import { randomUUID } from "node:crypto";
import type { Page, Route } from "@playwright/test";
import { deletePlace, insertPlace } from "../../fixtures/db.ts";
import { bottomNav, expect, test } from "../../fixtures/mobile.ts";

/**
 * X24 · loading shells and optimistic toggles, at 390x844 on touch.
 *
 * A tap must change the screen at once (design §4.1): the old routes held the
 * previous page until the server answered (and the map cut to a full-screen
 * spinner). Each destination's server answer is **held back** here — its
 * navigation payload, never its prefetch — so what the tap shows in the
 * meantime is observable: the route's `loading.tsx` shell, in its page's
 * place, with the tab bar still there and the tapped tab lit.
 *
 * Then the place page's hero (name and category, read on the server) is on
 * screen while the client's full read is still held, and Love flips the
 * moment it is tapped, before `recordPlaceInteraction` answers. (Love is the
 * heart since D27; "Save" is now the Want to try bookmark, a different
 * mutation.)
 *
 * One place per run, inserted directly (no `createPlace`: no AI review, no
 * 25/day quota) and deleted afterwards, its interactions with it.
 */

// The service worker answers RSC fetches itself, and `page.route` never sees
// a request a service worker handled — so the holds below would hold nothing.
test.use({ serviceWorkers: "block" });

/** Long enough that a shell seen before it ends was not the page. */
const HOLD_MS = 2_500;

/**
 * Hold the RSC navigation request for `path` (not the prefetch: that is
 * what lets the shell show at once) for `HOLD_MS`.
 */
async function holdNavigation(page: Page, path: string): Promise<void> {
  await page.route(
    (url) => url.pathname === path,
    async (route: Route) => {
      const headers = route.request().headers();
      const isNavigationPayload =
        headers.rsc === "1" && headers["next-router-prefetch"] === undefined;
      if (isNavigationPayload) {
        await new Promise((resolve) => setTimeout(resolve, HOLD_MS));
      }
      await route.fallback();
    },
  );
}

/** Hold browser GraphQL operations named `operation` for `ms`. */
async function holdGraphql(
  page: Page,
  operation: string,
  ms = HOLD_MS,
): Promise<void> {
  await page.route("**/api/graphql**", async (route: Route) => {
    const request = route.request();
    const carries = `${request.url()} ${request.postData() ?? ""}`;
    if (carries.includes(operation)) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
    await route.fallback();
  });
}

const TABS = [
  {
    from: "/me",
    tab: "Cellars",
    path: "/cellars",
    content: '[data-slot="cellar-card"]',
  },
  {
    from: "/cellars",
    tab: "Map",
    path: "/map",
    content: '[data-slot="map-canvas"]',
  },
  { from: "/cellars", tab: "Me", path: "/me", content: "h1" },
  {
    // X10: Home is `/` ("Today"), and its search field is a link into the
    // search sheet — the shell draws it as plain text, so the link is the page.
    from: "/cellars",
    tab: "Search",
    path: "/",
    content: 'a[aria-label="Search bottles, places and recipes"]',
  },
] as const;

for (const { from, tab, path, content } of TABS) {
  test(`tapping ${tab} commits into its shell, then its page`, async ({
    page,
  }) => {
    await page.goto(from);
    const nav = await bottomNav(page);
    const link = nav.getByRole("link", { name: tab, exact: true });
    await expect(link).toBeVisible();
    // Let the viewport prefetches land: they are what makes the shell
    // instant, and holding them is not what this measures.
    // /me keeps a request open, so the wait is bounded, not required.
    await page
      .waitForLoadState("networkidle", { timeout: 8_000 })
      .catch(() => undefined);
    await holdNavigation(page, path);

    await link.tap();

    const shell = page.locator("main [data-loading-shell]");
    // Well inside the hold: the shell, not the page.
    await expect(shell).toBeVisible({ timeout: HOLD_MS - 1_000 });
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(nav, "the tab bar stays through the wait").toBeVisible();
    await expect(link).toHaveAttribute("aria-current", "page");
    await expect(
      shell.getByRole("status"),
      "the shell says what it is loading",
    ).toHaveText(/^Loading /);

    // Then the page replaces it.
    await expect(page.locator(`main ${content}`).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(shell).toHaveCount(0);
  });
}

test.describe("a place", () => {
  test.describe.configure({ mode: "serial" });

  const place = {
    id: randomUUID(),
    name: `X24 Shell Place ${Date.now().toString(36)}`.replace(
      /[^A-Za-z0-9 ]/g,
      "",
    ),
  };

  test.beforeAll(() => {
    insertPlace({
      id: place.id,
      name: place.name,
      lng: -89.3842,
      lat: 43.0747,
      category: "bar",
    });
  });

  test.afterAll(async () => {
    await deletePlace(place.id);
  });

  test("the hero is drawn while the details are still on their way", async ({
    page,
  }) => {
    await holdGraphql(page, "MapPlaceDetails");
    await page.goto(`/places/${place.id}`);

    const shell = page.locator("main [data-loading-shell]");
    await expect(
      shell.getByRole("heading", { level: 1, name: place.name }),
      "the server-read name, inside the shell",
    ).toBeVisible({ timeout: HOLD_MS - 500 });
    await expect(
      page.locator("main .animate-spin"),
      "a shell, not a spinner",
    ).toHaveCount(0);

    // The details land and the shell gives way to the page's own heading.
    await expect(shell).toHaveCount(0, { timeout: 20_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: place.name }),
    ).toBeVisible();
  });

  test("Love flips on the tap, before the write answers", async ({ page }) => {
    await page.goto(`/places/${place.id}`);
    const love = page.getByRole("button", { name: /^Love / }).first();
    await expect(love).toBeVisible({ timeout: 20_000 });
    await expect(love).toHaveAttribute("aria-pressed", "false");

    await holdGraphql(page, "MapRecordPlaceInteraction");
    const written = page.waitForResponse(
      (r) =>
        r.url().includes("/api/graphql") &&
        (r.request().postData() ?? "").includes("MapRecordPlaceInteraction"),
      { timeout: 30_000 },
    );
    const tappedAt = Date.now();
    await love.tap();

    await expect(love).toHaveAttribute("aria-pressed", "true", {
      timeout: 1_000,
    });
    expect(
      Date.now() - tappedAt,
      "the flip came before the held write could have answered",
    ).toBeLessThan(HOLD_MS);
    await expect(love, "never disabled while it writes").toBeEnabled();

    await written;
    // Confirmed: still on once the page has refetched the interaction.
    await expect(love).toHaveAttribute("aria-pressed", "true");
    await page.waitForLoadState("networkidle");
    await expect(love).toHaveAttribute("aria-pressed", "true");

    // And back off, which is what a second tap means.
    await love.tap();
    await expect(love).toHaveAttribute("aria-pressed", "false", {
      timeout: 1_000,
    });
  });
});
