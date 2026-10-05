import { expect, test } from "@playwright/test";
import { ACCOUNTS, BASE_URL, storageStatePath } from "../fixtures/accounts.ts";
import { newContext } from "../fixtures/test.ts";

/**
 * Sign in, stay signed in, sign out.
 *
 * Driven through the *page*, not the HTTP endpoint — `global-setup.ts` already
 * covers the endpoint, and a form that posts to a working endpoint can still be
 * broken in half a dozen ways the endpoint cannot show you.
 */

test("signs in through the form and lands on /cellars", async ({ browser }) => {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();

  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.getByLabel("Email").fill(ACCOUNTS.primary.email);
  await page.getByLabel("Password").fill(ACCOUNTS.primary.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL(/\/cellars/, { timeout: 30_000 });

  // The cookie is what every later request depends on; assert it directly so a
  // failure says "no session cookie" rather than "some page did not render".
  const cookies = await ctx.cookies();
  expect(
    cookies.map((c) => c.name),
    "better-auth session cookie was not set",
  ).toContain("better-auth.session_token");

  await ctx.close();
});

test("rejects a wrong password without signing anyone in", async ({
  browser,
}) => {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(ACCOUNTS.primary.email);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  // Stays put, says something, and sets no cookie.
  await expect(page).toHaveURL(/\/sign-in/);
  const cookies = await ctx.cookies();
  expect(cookies.map((c) => c.name)).not.toContain("better-auth.session_token");
  await ctx.close();
});

test("a signed-in viewer is redirected off /sign-in", async ({ browser }) => {
  const ctx = await newContext(browser, {
    storageState: storageStatePath("primary"),
  });
  const page = await ctx.newPage();
  await page.goto("/sign-in");
  await expect(page).not.toHaveURL(/\/sign-in/);
  await ctx.close();
});

/**
 * Sign out actually ends the session.
 *
 * This is the assertion that matters, not "the menu item exists": E2ab found a
 * sign-out that cleared nothing, and the menu item looked identical either way.
 * Two independent checks, because either one alone can pass while the viewer is
 * still logged in:
 * the cookie is gone from the browser, **and** the server no longer honours the
 * session (a protected route bounces to `/sign-in`).
 */
test("sign out ends the session", async ({ browser }) => {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(ACCOUNTS.primary.email);
  await page.getByLabel("Password").fill(ACCOUNTS.primary.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/cellars/, { timeout: 30_000 });

  // Sign out lives in the side navigation, which is part of the
  // `(authenticated)` layout — so it needs a page that actually renders. Do not
  // use `/cellars` here: while its `$first` defect stands it answers 500 and
  // the layout never mounts, which would make this test fail for the wrong
  // reason.
  await page.goto("/search");
  // The nav bar is rendered twice — a horizontal bar for `xs` and a vertical
  // one for `sm` and up — and only one is visible at any viewport, so filter on
  // visibility rather than taking the first in document order.
  await page.locator('[aria-haspopup="menu"]:visible').first().click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();

  // Wait for the cookie to actually go, which is the first of this test's two
  // checks and is observable in ~100ms.
  //
  // This replaced `await page.waitForLoadState("networkidle").catch(() => {})`,
  // which was costing **45 seconds of every run** — measured per step:
  // goto /sign-in 103ms, await /cellars 185ms, goto /search 95ms,
  // *networkidle 45002ms*, cookies 1ms, goto /cellars 31ms. This app never
  // gives 500ms of network silence, so `networkidle` always ran out the full
  // `navigationTimeout` (45_000), and the `.catch(() => {})` swallowed the
  // TimeoutError so the test still passed — 180x its neighbours, invisibly.
  // It also made this the one test still flushing a 45s trace buffer when its
  // context closed, which is where the intermittent `ENOENT` on
  // `.playwright-artifacts-N/traces/…` during `ctx.close()` came from.
  //
  // Do **not** wait for a redirect to `/sign-in` here instead: measured, sign
  // out clears the cookie but does not navigate — the page stays on `/search`
  // — so that wait would hang for its full timeout and then fail. Polling the
  // cookie both waits and asserts, so it replaces the separate expect too.
  await expect
    .poll(async () => (await ctx.cookies()).map((c) => c.name), {
      message: "better-auth.session_token survived sign out",
      timeout: 15_000,
    })
    .not.toContain("better-auth.session_token");

  await page.goto("/cellars");
  await expect(
    page,
    "a protected route still rendered after sign out",
  ).toHaveURL(/\/sign-in/);

  await ctx.close();
});

/**
 * The session cookie the browser holds must be the *only* thing standing
 * between a viewer and their data. A forged cookie must not work.
 */
test("a garbage session cookie is not a session", async ({ browser }) => {
  const ctx = await newContext(browser);
  await ctx.addCookies([
    {
      name: "better-auth.session_token",
      value: "not-a-real-token.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      url: BASE_URL,
    },
  ]);
  const page = await ctx.newPage();
  await page.goto("/cellars");
  await expect(page).toHaveURL(/\/sign-in/);
  await ctx.close();
});
