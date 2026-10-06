import type { Page } from "@playwright/test";
import {
  bodyText,
  expect,
  expectRendered,
  settleNetwork,
  test,
  watch,
} from "../fixtures/test.ts";

/**
 * Every static route renders for a signed-in viewer.
 *
 * The cheapest defect net in the suite and the one that paid for itself
 * immediately: seven frontend groups were built in parallel against a schema
 * that moved under them, and a page that throws during render or fires an
 * invalid document fails here with no flow-specific setup at all.
 *
 * **Status codes are not enough and this spec is built around that.** A server
 * component that throws inside a streamed response still answers `200` — the
 * error surfaces later, as an uncaught error in the browser. `/recipes` is
 * exactly that shape. So each route is judged on five independent signals:
 *
 *   1. HTTP status,
 *   2. uncaught errors in the page,
 *   3. GraphQL responses carrying an `errors` array (which arrive as `200`),
 *   4. failed sub-requests,
 *   5. console errors and warnings, including unhandled promise rejections —
 *      the catch-all that notices what nothing else asserts on.
 *
 * Signal (5) used to be the Next dev overlay's issue count. That became
 * vacuous when the suite's default target became the containerized client:
 * a production build ships no `nextjs-portal`, so the probe returned 0
 * unconditionally and twenty-four route tests quietly stopped checking their
 * catch-all. The console stream is the production-observable replacement, and
 * it covers the case the overlay was there for — a diagnostic that is not a
 * thrown error, so signal (2) never sees it.
 */

/** Static routes only. Dynamic ones are covered by the flows that create rows. */
const ROUTES = [
  "/cellars",
  "/cellars/add",
  "/add",
  // `/add/wine` is a legitimate 404: `itemTypeFromSegment` takes the plural
  // segment. Asserting the singular 404s guards the route contract itself.
  "/add/wines",
  "/search",
  "/brands",
  "/favorites",
  "/map",
  "/map/create-place",
  "/map/scans",
  "/discoveries",
  "/recipes",
  "/recipes/ai-generator",
  "/tier-lists",
  "/tier-lists/add",
  "/rankings",
  "/friends",
  "/users/edit",
  "/wines",
  "/beers",
  "/spirits",
  "/coffees",
  "/sakes",
  "/teas",
];

/**
 * Collect GraphQL responses that carry an `errors` array.
 *
 * The proxy answers `200` for a document the API rejected, so this is the only
 * place a `GRAPHQL_VALIDATION_FAILED` or a resolver throw becomes visible to a
 * test. Nothing else in the stack turns it into a status code.
 */
function graphqlErrorsOn(page: Page): string[] {
  const errors: string[] = [];
  page.on("response", async (res) => {
    if (!res.url().includes("/api/graphql")) return;
    try {
      const body = await res.json();
      for (const entry of Array.isArray(body) ? body : [body]) {
        for (const err of entry?.errors ?? []) {
          errors.push(
            `${err.message}${err.path ? ` @ ${JSON.stringify(err.path)}` : ""}`,
          );
        }
      }
    } catch {
      /* not JSON — signal (4) covers it */
    }
  });
  return errors;
}

/**
 * How many issues the Next dev overlay has recorded for this page.
 *
 * **Only meaningful against `next dev`.** The suite's default target is the
 * containerized client, which runs `next start` in production mode, and a
 * production build ships no `nextjs-portal` at all — measured: zero
 * occurrences in the served HTML. So against the default this returns 0
 * unconditionally and the assertion built on it passes vacuously.
 *
 * It is kept rather than deleted because it still bites when someone points the
 * suite at a dev server with `E2E_BASE_URL`, and it costs one `evaluate`. But
 * it is no longer the fifth signal — `consoleIssues` below is, because that one
 * works in both modes.
 */
async function devOverlayIssues(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.querySelector("nextjs-portal")?.shadowRoot;
    if (!root) return 0;
    const badge = root.querySelector("[data-issues-count]");
    if (badge) return Number(badge.textContent?.trim() ?? "0") || 0;
    return root.querySelector(
      "[data-nextjs-dialog], nextjs-container-errors-header",
    )
      ? 1
      : 0;
  });
}

for (const route of ROUTES) {
  test(`renders ${route}`, async ({ primary }) => {
    const noise = watch(primary);
    const gqlErrors = graphqlErrorsOn(primary);

    const response = await primary.goto(route, {
      waitUntil: "domcontentloaded",
    });

    // Client components fetch after hydration; give the first round trip a
    // chance to land before judging the page.
    await settleNetwork(primary);

    expect(response?.status(), `${route}: HTTP status`).toBeLessThan(400);

    // The authenticated layout redirects to /sign-in when the session did not
    // resolve. Landing there is a failure of this route, not of sign-in.
    expect(
      new URL(primary.url()).pathname,
      `${route}: bounced to sign-in`,
    ).not.toBe("/sign-in");

    expect(noise.pageErrors, `${route}: uncaught errors`).toEqual([]);
    expect(gqlErrors, `${route}: GraphQL errors`).toEqual([]);
    expect(
      noise.failedRequests.filter((r) => !r.includes("/_next/")),
      `${route}: failed sub-requests`,
    ).toEqual([]);

    // A page that renders its own error copy is not "working" either.
    //
    // "Failed to load" used to be in this list bare, and it made this test
    // fail on a page that was working perfectly: once E3 let a menu scan be
    // created for real, `/map/scans` listed one whose stored `processingError`
    // was the AI provider's own sentence — "Failed to load image or audio
    // file" — and a substring search over `bodyText` cannot tell the app's
    // error copy from an error the app is correctly *displaying*. So the
    // pattern now names the app's own boundary copy (`error.tsx`'s "Failed to
    // load cellar items", and the two generic shells), which is what this
    // signal was ever about. Data is not a page failure.
    const text = await bodyText(primary);
    expect(text, `${route}: rendered an error message`).not.toMatch(
      /Something went wrong|Unexpected error|Application error|Failed to load [a-z ]*(items|page|data)\b/i,
    );

    await expectRendered(primary, route);

    // Signal (5), the catch-all. This replaces the Next dev overlay's issue
    // count, which is vacuous against a production build (see
    // `devOverlayIssues`). `watch()` collects console errors and warnings plus
    // the unhandled rejections `fixtures/test.ts` forwards into the console,
    // already filtered through IGNORED — so this is the production-observable
    // equivalent of what the overlay used to notice: the diagnostics nothing
    // else asserts on. Signal (2) catches *thrown* errors; a React hydration
    // warning, a failed image, or a rejected promise is only visible here.
    expect(noise.console, `${route}: console errors/warnings`).toEqual([]);

    // Still asserted, but only informative against a dev server.
    expect(
      await devOverlayIssues(primary),
      `${route}: Next dev overlay issues (dev server only)`,
    ).toBe(0);
  });
}

test("an unknown item-type segment is a 404, not a broken wizard", async ({
  primary,
}) => {
  const res = await primary.goto("/add/wine");
  expect(res?.status()).toBe(404);
});

test("an anonymous viewer is redirected away from a protected route", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/cellars");
  await expect(page).toHaveURL(/\/sign-in/);
  await ctx.close();
});
