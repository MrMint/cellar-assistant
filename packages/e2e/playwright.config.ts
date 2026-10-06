import { defineConfig, devices } from "@playwright/test";

/**
 * E2 · Golden flows.
 *
 * Drives the client at `baseURL` — by default the containerised one on
 * `http://localhost:3003`, or a host dev server via `E2E_BASE_URL` — against
 * the compose stack
 * (`bun run stack:up`): `services/api` on 3001, `services/actors` on 3002,
 * Postgres on 5433. Nothing here talks to Nhost.
 *
 * ## This suite runs on Node, not Bun — and that is deliberate
 *
 * The runtime migration moved every *unit* suite to Bun; it never reached this
 * package, and the reason is worth stating because it is invisible otherwise.
 * `@playwright/test`'s CLI (`node_modules/@playwright/test/cli.js`) begins
 * `#!/usr/bin/env node`, and **`bun run` honours a shebang** — so
 * `bun run test` here hands the whole suite to whatever `node` is first on
 * `PATH`. Measured from inside the runner process:
 *
 *   bun run playwright test         → {bun: null, node: "20.18.1", isBun: false}
 *   bun run --bun playwright test   → {bun: "1.4.2", node: "26.3.0", isBun: true}
 *
 * The first is the invocation `package.json` actually uses, and the Node it
 * picked up was **20.18.1** — outside this repo's `engines` range
 * (`>=24.14.0 <25.0.0`) and two majors below the `.nvmrc` pin. Nothing caught
 * it: `bun run --filter` skips the root's `preinstall` guard, so the suite was
 * one `fnm` misfire away from the failure mode `scripts/check-node-version.mjs`
 * exists to prevent. So the `test` script now runs that guard first, under the
 * same `node` the shebang will resolve, and a wrong Node fails in one line
 * instead of as scattered assertion noise.
 *
 * The guard is **chained into `test` with `&&`, not a `pretest` hook**, and
 * that is load-bearing. Measured under bun 1.4.2:
 *
 *   bun run test            (inside the package)  pretest fails → test is SKIPPED
 *   bun run --filter p test (from the root)       pretest fails → test RUNS ANYWAY
 *
 * `--filter` prints `pretest: Exited with code 1` and then runs the main script
 * regardless. The overall exit is still 1, so CI would not go green — but the
 * suite would execute on the wrong Node and emit a full, plausible-looking
 * report, which is the exact trap this guard exists to close. `test:e2e` at the
 * root *is* a `--filter` invocation, so a hook would have protected nothing
 * where it matters most. `&&` runs in one shell and genuinely short-circuits.
 *
 * Playwright is left on Node rather than forced onto Bun with `--bun`. It
 * spawns worker processes and a browser driver and is not a supported Bun
 * target; a trivial probe passing under Bun is not evidence that 84 browser
 * tests will. `process.versions.node` is also synthetic under Bun (it reports
 * `26.3.0`, above any real release), so any version gate keyed on it lies —
 * which is exactly why the guard tests `process.versions.bun` first.
 *
 * The suite is deliberately **serial and single-worker**. Every spec shares the
 * two hand-inserted test accounts and one database, so two workers racing on
 * `test@test.com`'s friendships or cellars produce failures that are about the
 * runner, not the app. X3 gave the *unit* suites their own database; the
 * browser suite has no such isolation and must not pretend otherwise.
 *
 *   bun run test:e2e                          # all flows, from the repo root
 *   bun run --filter @cellar-assistant/e2e test:ui
 *   bun run --filter @cellar-assistant/e2e report
 */
export default defineConfig({
  testDir: "./specs",
  outputDir: "./artifacts/results",
  globalSetup: "./global-setup.ts",
  // One worker, no parallelism: shared accounts, shared database.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // A cold Turbopack compile of a route the suite has not visited yet is
  // routinely 10-20s, and the actor host cold-starts an actor type on first
  // call. 60s is not generous here, it is the floor.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // Both branches of the previous `process.env.CI ? … : …` here were literally
  // identical, which made it look like CI reported differently when it did not.
  reporter: [
    ["list"],
    ["html", { outputFolder: "artifacts/report", open: "never" }],
  ],
  use: {
    // Keep in step with `fixtures/accounts.ts`'s BASE_URL, which documents why
    // this defaults to the container on 3003 rather than a host dev server.
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3003",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  /**
   * Not started here on purpose, and there are now two ways to satisfy it.
   *
   * Something must serve the client on `baseURL` before this suite means
   * anything. Preferred is the containerized `client` service in the shared
   * stack (`bun run stack:up`, compose project `cellar-stack`), which publishes
   * 3000 to the host — that is what makes the suite runnable without a host dev
   * server, and it is the path CI should take. Failing that, the user runs
   * `bun run dev` themselves; a `webServer` block would either fight that
   * server or silently reuse it and make a failure look like a flake.
   *
   * Note for agents: `AGENTS.md` forbids starting `bun run dev` / `bun run
   * build`. Use the stack, or report the suite as blocked — do not start one.
   *
   * `baseURL` stays `localhost`, not `host.docker.internal`. That older address
   * was an artifact of the Nhost stack's CORS allowlist
   * (`82450ad1:nhost/overlays/local.json`), and it is actively wrong now: Playwright
   * runs on the host, reaching a published container port, and better-auth
   * rejects a mismatched `Origin` with `MISSING_OR_NULL_ORIGIN` (403).
   *
   * Set `E2E_START_SERVER=1` to have Playwright own a dev server instead.
   */
  ...(process.env.E2E_START_SERVER === "1"
    ? {
        webServer: {
          // This config runs from packages/e2e, so the dev server has to be
          // asked for by workspace name rather than by a bare script.
          command: "bun run --filter @cellar-assistant/client dev",
          cwd: "../..",
          url: "http://localhost:3000/sign-in",
          reuseExistingServer: false,
          timeout: 180_000,
        },
      }
    : {}),
});
