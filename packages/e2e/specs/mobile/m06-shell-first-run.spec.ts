import { randomUUID } from "node:crypto";
import { expect, test } from "../../fixtures/mobile.ts";

/**
 * Wave A "shell" at 390x844: the IA mapping (D1), re-tap to root (X01),
 * the sectioned indexes (X11) and a brand-new account's first run (N15).
 *
 * Signed in as test@test.com, except the first-run test, which signs up an
 * account of its own — the only way to see what a new user sees. That leaves
 * one user row per run (there is no account deletion to clean up with); it
 * creates no place, so the shared place cap is untouched.
 */

test("Me: your tier lists, Top rated, Loved, Friends — no Recipes or Brands rows (D1)", async ({
  page,
}) => {
  await page.goto("/me");
  const lists = page.getByRole("heading", { name: "Lists" });
  await expect(lists).toBeVisible();
  const main = page.getByRole("main");
  await expect(
    main.getByRole("link", { name: /^(All tier lists|Tier lists)$/ }),
  ).toBeVisible();
  await expect(main.getByRole("link", { name: "Top rated" })).toBeVisible();
  await expect(main.getByRole("link", { name: "Loved" })).toBeVisible();
  await expect(main.getByRole("link", { name: /^Friends/ })).toBeVisible();
  await expect(main.getByRole("link", { name: "Recipes" })).toHaveCount(0);
  await expect(main.getByRole("link", { name: "Brands" })).toHaveCount(0);
});

test("re-tapping the lit tab pops to its root (X01)", async ({ page }) => {
  // Loved belongs to Me (so do Want to try, Friends, Taste profile), so Me is
  // lit there; tapping it again goes home to the hub rather than doing
  // nothing. /rankings lights Lists, not Me.
  await page.goto("/favorites");
  await expect(page).toHaveURL(/\/favorites/);
  const me = page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Me", exact: true });
  await expect(me).toHaveAttribute("aria-current", "page");
  await me.click();
  await expect(page).toHaveURL(/\/me$/);
});

test("the Cellars strip is Cellars · Your bar, a one-way door to recipes (D1, FR-5)", async ({
  page,
}) => {
  await page.goto("/cellars");
  const segments = page.getByRole("navigation", {
    name: "Cellars or Your bar",
  });
  await expect(segments.getByRole("link", { name: "Cellars" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("region", { name: "Yours" })).toBeVisible();
  await segments.getByRole("link", { name: "Your bar" }).click();
  await expect(page).toHaveURL(/\/recipes/);
  // The Recipes boards draw no switch, and no tab is lit but More.
  await expect(
    page.getByRole("navigation", { name: "Cellars or Your bar" }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Cellars" }),
  ).not.toHaveAttribute("aria-current", "page");
});

test("a brand-new account: lands Home, has My Cellar, and every empty screen offers one thing to do (N15)", async ({
  browser,
}) => {
  // Its own context, signed out: the fixture's is test@test.com. The runner
  // applies the project's `storageState` to `browser.newContext()` too, so it
  // has to be cleared here — signed in, /sign-up redirects to / and the test
  // would only ever skip.
  const ctx = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  try {
    await page.goto("/sign-up");
    const email = page.getByLabel("Email");
    test.skip(
      (await email.count()) === 0,
      "this stack does not offer password sign-up (AUTH_PASSWORD_MODE)",
    );
    await page.getByLabel("Name", { exact: true }).fill("First Run");
    await email.fill(`e2e-first-run-${randomUUID()}@test.com`);
    await page.getByLabel("Password").fill(`pw-${randomUUID()}`);
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();

    // X01/X10: Home "Today" at `/` — not /cellars, and not /search any more.
    await expect(page).toHaveURL(/^https?:\/\/[^/]+\/(?:\?.*)?$/, {
      timeout: 30_000,
    });
    // A brand-new account has no bottles: the new-person Home, the bottle
    // glyph, one line and one way on, the camera — and no count that isn't
    // theirs (CROSS-LOT 3): not one digit on the page's main.
    const start = page.getByRole("region", { name: "Start with a bottle" });
    await expect(start).toBeVisible({ timeout: 20_000 });
    await expect(
      start.getByRole("link", { name: "Open camera" }),
    ).toHaveAttribute("href", "/add?mode=bottle");
    await expect(page.getByRole("main")).not.toContainText(/\d/);

    // The starter cellar is made through the outbox, a few seconds behind
    // the sign-up: poll for it rather than racing it.
    const yours = page.getByRole("region", { name: "Yours" });
    await expect(async () => {
      await page.goto("/cellars");
      await expect(yours.getByText("My Cellar")).toBeVisible({
        timeout: 2_000,
      });
    }).toPass({ timeout: 30_000 });
    // Nobody else's cellar is among the new account's own.
    await expect(yours.locator('[data-slot="cellar-card"]')).toHaveCount(1);

    // An empty cellar: one line, one action.
    await yours.getByRole("link", { name: "My Cellar", exact: true }).click();
    await expect(page.getByText("Nothing in My Cellar yet")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Add a bottle" }),
    ).toBeVisible();

    await page.goto("/tier-lists");
    await expect(page.getByText(/Nothing ranked yet/)).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Yours" }).getByRole("button", {
        name: "New list",
      }),
    ).toBeVisible();

    await page.goto("/friends");
    await expect(page.getByText("No friends yet")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Invite" }).last(),
    ).toBeVisible();

    // Top rated opens on Me, and Me has rated nothing yet.
    await page.goto("/rankings");
    await expect(page.getByText(/Nothing rated yet/)).toBeVisible({
      timeout: 20_000,
    });

    // No install prompt before the first save.
    await expect(
      page.getByRole("dialog", { name: "Install Cellar Assistant" }),
    ).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});
