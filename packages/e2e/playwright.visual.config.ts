import { defineConfig } from "@playwright/test";
import { VISUAL } from "./visual/env.ts";

/**
 * The visual + accessibility sweep (migration plan §5.3/§5.4) — a separate
 * config from `playwright.config.ts` on purpose: it runs against a different
 * stack (the integration lane, not the e2e accounts), writes screenshots
 * instead of asserting flows, and must not collide with that file's edits.
 *
 * Capture a run (read-only against the stack; creates nothing):
 *
 *   VISUAL_BASE_URL=http://localhost:3303 \
 *   VISUAL_ACCOUNTS=<scratchpad>/.state/ux-lane-accounts.json \
 *   VISUAL_SEED=<scratchpad>/.state/ux-lane-seed.json \
 *   VISUAL_TREE=$(git rev-parse --short HEAD) \
 *   VISUAL_OUT=/abs/path/sweep-before \
 *     bun run --filter @cellar-assistant/e2e visual
 *
 * Narrow it with VISUAL_SLICES=S4,S5 or Playwright's own `-g` / `--project`
 * (`m390`, `d1440`). Then pair two runs:
 *
 *   node packages/e2e/visual/compare.ts --before <run A> --after <run B> \
 *     --out <dir>        # index.html, compare.json, contact-<slice>.png
 *
 * Inputs and options are documented in `visual/env.ts`; the route table and
 * its slice tags in `visual/routes.ts`. Uses the Chromium build Playwright
 * already has — never `playwright install` (the browser cache is shared by
 * every worktree on the machine; AGENTS.md).
 */
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export default defineConfig({
  testDir: "./visual",
  outputDir: `${VISUAL.out}/.playwright`,
  globalTeardown: "./visual/aggregate.ts",
  fullyParallel: true,
  workers: Number(process.env.VISUAL_WORKERS ?? 3),
  retries: 0,
  timeout: 180_000,
  reporter: [["list"]],
  use: {
    baseURL: VISUAL.baseURL,
    // Stable frames: dark (the product's default), no motion, one place and
    // one clock for every run.
    colorScheme: "dark",
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "America/Chicago",
    geolocation: { latitude: 43.0747, longitude: -89.3842 },
    permissions: ["geolocation"],
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts$/ },
    {
      name: "m390",
      testMatch: /sweep\.visual\.ts$/,
      dependencies: ["setup"],
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: IPHONE_UA,
      },
    },
    {
      name: "d1440",
      testMatch: /sweep\.visual\.ts$/,
      dependencies: ["setup"],
      use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    },
  ],
});
