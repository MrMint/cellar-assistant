import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  test as base,
  expect,
  type Page,
  request,
} from "@playwright/test";
import {
  ACCOUNTS,
  type Account,
  type AccountKey,
  BASE_URL,
  storageStatePath,
} from "./accounts.ts";

/**
 * Console/pageerror noise collected for the life of a page.
 *
 * Every spec that renders a route asserts on this. A React error boundary in a
 * client component renders a fallback and returns 200, so **status codes alone
 * cannot tell a working page from a broken one** — the console is where a
 * failed GraphQL document actually shows up.
 */
export type PageNoise = {
  console: string[];
  pageErrors: string[];
  /** Failed network requests: `${status} ${method} ${url}`. */
  failedRequests: string[];
};

/** Noise a healthy page emits that says nothing about the page under test. */
const IGNORED = [
  // Next dev overlay + HMR chatter.
  /\[Fast Refresh\]/,
  /Download the React DevTools/,
  /webpack-hmr|__nextjs/,
  // Joy UI's SSR/hydration warnings about `sx` are pre-existing and unrelated.
  /MUI: The `sx` prop/,
  // maplibre asks for a WebGL context the headless shell may not grant.
  /WebGL|webgl/i,
  // Service worker registration is disabled in dev.
  /serwist|ServiceWorker/i,
  // Vercel analytics is not configured locally.
  /vercel|va\.vercel-scripts/i,
  // The browser's own console echo of a failed sub-resource. It carries no URL
  // — the text is exactly "Failed to load resource: the server responded with
  // a status of 404 (Not Found)" — so not one of the URL-based rules above can
  // judge it, and `failedRequests` already reports the same failures *with*
  // their URLs and a considered filter. Asserting on this in the console stream
  // would re-report every request those rules deliberately ignore as an
  // un-triageable duplicate: measured on /wines, the two entries are
  // `/_vercel/insights/script.js` and `/_vercel/speed-insights/script.js`,
  // which the rule directly above exists to ignore. Failed requests are
  // signal (4)'s job; the console stream's unique value is diagnostics that are
  // not requests at all.
  /Failed to load resource/,
];

const noisy = (text: string): boolean => !IGNORED.some((r) => r.test(text));

export function watch(page: Page): PageNoise {
  const noise: PageNoise = { console: [], pageErrors: [], failedRequests: [] };
  page.on("console", (msg) => {
    if (msg.type() !== "error" && msg.type() !== "warning") return;
    const text = `${msg.type()}: ${msg.text()}`;
    if (noisy(text)) noise.console.push(text);
  });
  page.on("pageerror", (err) => {
    if (noisy(err.message)) noise.pageErrors.push(err.message);
  });
  page.on("response", (res) => {
    if (res.status() < 400) return;
    const line = `${res.status()} ${res.request().method()} ${res.url()}`;
    if (noisy(line)) noise.failedRequests.push(line);
  });
  return noise;
}

/**
 * A GraphQL client bound to one account, going through the app's own proxy.
 *
 * Used for **fixture setup and teardown only**, never to assert a flow works —
 * a flow that only passes when driven by this helper has not been proved
 * through the UI. It exists because some preconditions (remove a friendship,
 * delete a cellar the previous run left behind) have no UI, and because raw SQL
 * against a table an actor owns is precisely the case §1.3's caching rule
 * assumes away (see D5's false-positive staleness report).
 *
 * The strings are raw, so nothing type-checks them against the schema. What
 * does check them is `services/client/src/lib/dev-checks/e2e-documents.test.ts`,
 * which validates every document passed to `query`/`raw` (and every `query:`
 * of a direct post) against `packages/schema/schema.graphql`, offline, in the
 * client suite — so pass a literal, or a same-file `const` holding one.
 */
export class Gql {
  constructor(private readonly ctx: APIRequestContext) {}

  static async forAccount(key: AccountKey): Promise<Gql> {
    const ctx = await request.newContext({
      baseURL: BASE_URL,
      storageState: storageStatePath(key),
      extraHTTPHeaders: { origin: BASE_URL },
    });
    return new Gql(ctx);
  }

  static async anonymous(): Promise<Gql> {
    const ctx = await request.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { origin: BASE_URL },
    });
    return new Gql(ctx);
  }

  /** Raw result, errors and all — callers that expect a failure want this. */
  async raw(
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<{ data?: any; errors?: { message: string }[] }> {
    const res = await this.ctx.post("/api/graphql", {
      headers: { "content-type": "application/json" },
      data: { query, variables },
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(
        `non-JSON GraphQL response ${res.status()}: ${text.slice(0, 400)}`,
      );
    }
  }

  /** Throws on any top-level GraphQL error. */
  async query(
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<any> {
    const body = await this.raw(query, variables);
    if (body.errors?.length) {
      throw new Error(
        `GraphQL errors: ${body.errors.map((e) => e.message).join("; ")}`,
      );
    }
    return body.data;
  }

  dispose(): Promise<void> {
    return this.ctx.dispose();
  }
}

/**
 * Stop the Next dev overlay from eating clicks.
 *
 * `<nextjs-portal>` is a full-viewport host element that sits above the app in
 * development, and Playwright refuses to click "through" it — every click on a
 * real control fails with *"nextjs-portal … intercepts pointer events"*. This
 * is a property of `next dev`, not of the app, so neutralising it is the
 * correct thing for a test to do and it changes nothing the app can observe:
 * the overlay's shadow root is untouched, so `devOverlayIssues()` still reads
 * the issue count out of it.
 */
export async function suppressDevOverlay(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(() => {
    const apply = () => {
      if (!document.head || document.getElementById("__e2e_overlay_off"))
        return;
      const style = document.createElement("style");
      style.id = "__e2e_overlay_off";
      style.textContent = "nextjs-portal{pointer-events:none !important}";
      document.head.appendChild(style);
    };
    document.addEventListener("DOMContentLoaded", apply);
    apply();
  });
}

/**
 * Wait for the network to go quiet, on a budget, and **say so when it doesn't**.
 *
 * Use this instead of `page.waitForLoadState("networkidle").catch(() => {})`.
 * That spelling has two defects, and the second is the dangerous one:
 *
 * 1. It inherits `navigationTimeout` — 45_000 in `playwright.config.ts` — so
 *    the *failure* case costs 45 seconds rather than a couple.
 * 2. `.catch(() => {})` discards the TimeoutError, so the test still passes and
 *    nothing anywhere reports the wait. `01-sign-in`'s sign-out test paid
 *    exactly this: measured at **45002ms** in a single step, 180x its
 *    neighbours, green the whole time. It stayed invisible until someone asked
 *    why one test was slow, and it was also long enough that the test was still
 *    flushing its trace buffer when the context closed, which surfaced as
 *    intermittent `ENOENT` on `.playwright-artifacts-N/traces/…` — a symptom
 *    three steps removed from its cause.
 *
 * So the budget is explicit and small: a page that is genuinely quiet settles
 * in milliseconds, and anything that does not settle is not going to in 45s
 * either. On timeout this continues, exactly as the old spelling did — today's
 * passing tests keep passing — but it prints the elapsed time and the URL, so
 * the tax is a line in the output instead of a mystery.
 *
 * It refuses to be silent on purpose. This repo has been bitten repeatedly by
 * caught-and-discarded failures rather than by loud ones: fallbacks keyed on
 * `response.error` that a union error never sets, `bun pm untrusted` reporting
 * "Found 0" while it skipped scripts, a blocked postinstall that warned nobody,
 * `ACTORS_TEST_DB_OPTIONAL` hiding 589 of 824 tests. Every one was a signal
 * someone had swallowed. A helper whose whole job is to absorb a timeout is the
 * obvious next place for that to happen, which is why this one narrates.
 *
 * @returns whether the network actually settled, for the rare caller that cares.
 */
export async function settleNetwork(
  page: Page,
  budgetMs = 5_000,
): Promise<boolean> {
  const started = Date.now();
  try {
    await page.waitForLoadState("networkidle", { timeout: budgetMs });
    return true;
  } catch {
    console.warn(
      `[e2e] network never went idle within ${budgetMs}ms (waited ${
        Date.now() - started
      }ms) at ${page.url()} — continuing anyway`,
    );
    return false;
  }
}

/**
 * Surface unhandled promise rejections, which otherwise vanish.
 *
 * Playwright's `pageerror` fires for uncaught *exceptions*; an unhandled
 * rejection is not reliably reported through it, so a `.then()` chain that
 * throws inside a client component can fail silently and leave a page looking
 * healthy. This forwards them into the console stream — where `watch()` already
 * collects them and `00-routes.spec.ts` now asserts on them — under a prefix no
 * `IGNORED` pattern matches, so the filter cannot swallow one by accident.
 *
 * Must be a context-level init script: it has to be installed before the page
 * loads, and `watch()` is handed a page that already exists.
 */
export async function captureUnhandledRejections(
  ctx: BrowserContext,
): Promise<void> {
  await ctx.addInitScript(() => {
    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      const detail =
        reason instanceof Error
          ? `${reason.message}`
          : typeof reason === "string"
            ? reason
            : JSON.stringify(reason);
      console.error(`[unhandled rejection] ${detail}`);
    });
  });
}

/** A browser context with the overlay neutralised. Use this, not `newContext`. */
export async function newContext(
  browser: Browser,
  options: Parameters<Browser["newContext"]>[0] = {},
): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...options,
  });
  await suppressDevOverlay(ctx);
  await captureUnhandledRejections(ctx);
  return ctx;
}

/** A browser context already holding `key`'s better-auth session cookie. */
export async function contextFor(
  browser: Browser,
  key: AccountKey,
): Promise<BrowserContext> {
  return newContext(browser, { storageState: storageStatePath(key) });
}

type Fixtures = {
  /** `test@test.com`, signed in. */
  primary: Page;
  /** `test2@test.com`, signed in — the second party in every social flow. */
  secondary: Page;
  primaryNoise: PageNoise;
  secondaryNoise: PageNoise;
  api: Gql;
  api2: Gql;
};

export const test = base.extend<Fixtures>({
  primary: async ({ browser }, use) => {
    const ctx = await contextFor(browser, "primary");
    const page = await ctx.newPage();
    await use(page);
    await ctx.close();
  },
  secondary: async ({ browser }, use) => {
    const ctx = await contextFor(browser, "secondary");
    const page = await ctx.newPage();
    await use(page);
    await ctx.close();
  },
  primaryNoise: async ({ primary }, use) => {
    await use(watch(primary));
  },
  secondaryNoise: async ({ secondary }, use) => {
    await use(watch(secondary));
  },
  api: async ({}, use) => {
    const gql = await Gql.forAccount("primary");
    await use(gql);
    await gql.dispose();
  },
  api2: async ({}, use) => {
    const gql = await Gql.forAccount("secondary");
    await use(gql);
    await gql.dispose();
  },
});

export type { Account };
export { ACCOUNTS, expect };

/**
 * Assert a route actually rendered, rather than merely returning 200.
 *
 * Next's App Router renders `error.tsx` (or the dev overlay) with a 200 status,
 * so this looks for the three things that mean "this page is broken": the dev
 * error overlay, a rendered error boundary, and an empty `<main>`.
 */
export async function expectRendered(page: Page, route: string): Promise<void> {
  // `<nextjs-portal>` is present on *every* dev page — it hosts the dev-tools
  // indicator — so its existence proves nothing. The error dialog inside its
  // shadow root is the real signal, and it is only mounted on a real error.
  const overlay = await page.evaluate(() => {
    const root = document.querySelector("nextjs-portal")?.shadowRoot;
    const dialog = root?.querySelector(
      "[data-nextjs-dialog], [data-nextjs-dialog-overlay], nextjs-container-errors-header",
    );
    if (!dialog) return null;
    // The shadow root's `textContent` is mostly the overlay's own stylesheet;
    // only the dialog subtree is worth reporting.
    return (dialog.textContent ?? "").replace(/\s+/g, " ").slice(0, 800);
  });
  if (overlay !== null) {
    throw new Error(`${route}: Next dev error overlay is open.\n${overlay}`);
  }
  const body = await page.locator("body").innerText();
  expect(
    body.trim().length,
    `${route}: rendered an empty body`,
  ).toBeGreaterThan(0);
}

/** Text content of the page, whitespace-collapsed, for cheap assertions. */
export async function bodyText(page: Page): Promise<string> {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ");
}

/**
 * Set an `<input type="date">` that React controls.
 *
 * `locator.fill()` **silently does nothing** here, and that is worth knowing
 * before it costs someone an afternoon. For a text input Playwright types via
 * `insertText`, which React sees; for a date input it cannot, so it assigns
 * `node.value` directly — and React's value tracker records the assignment,
 * decides on the following `input` event that nothing changed, and never fires
 * `onChange`. The controlled input then re-renders straight back to `""`. The
 * form ends up rejecting a field you can see a value in.
 *
 * Going through the prototype's setter is the standard escape: React patches
 * the property on the *instance*, so the prototype setter writes the value
 * without touching the tracker, and the dispatched `input` event is then
 * treated as a genuine change.
 *
 * Keyboard typing also works, but the digit order follows the browser's locale
 * (`01012019` → 2019-01-01 under en-US), so it is one CI locale away from being
 * a mystery failure. This is deterministic.
 */
export async function fillDate(
  page: Page,
  label: string,
  isoDate: string,
): Promise<void> {
  const input = page.getByLabel(label);
  await input.evaluate((node, value) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
  }, isoDate);
  expect(
    await input.inputValue(),
    `the ${label} date input did not take the value`,
  ).toBe(isoDate);
}
