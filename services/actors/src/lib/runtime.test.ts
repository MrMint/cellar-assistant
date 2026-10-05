/**
 * This suite runs on the **Bun** runtime, and this file is the only thing that
 * can tell you so.
 *
 * `package.json`'s test script is `bun run --bun vitest run`. Drop the `--bun`
 * and vitest's `#!/usr/bin/env node` shebang hands the whole tree back to Node:
 * all 877 tests still pass, the counts are identical, and the only visible
 * symptom is that the run takes about twice as long (7.6s -> 4.0s was the
 * measured difference). That is a silent revert of a deliberate decision, so
 * assert the runtime rather than trust the script string to still say what it
 * said when it was written.
 *
 * `process.versions.bun` is the check. `process.versions.node` is **not** — Bun
 * reports a synthetic Node version there (26.3.0 under bun 1.4.2), so a
 * Node-version assertion passes under Bun for a reason that has nothing to do
 * with Node being present. `src/auth/migrate-users.test.ts` has such an
 * assertion and its header explains why it now means something different.
 *
 * Two processes have to agree, and this checks both:
 *
 *   - the **worker** that imports the test files, asserted here;
 *   - `globalSetup` (`./test-db-setup.ts`), which provisions `cellar_test`
 *     before any test file loads. Measured in a single 71-file run: setup
 *     reported `bun=1.4.2` at pid 65024 and the worker `bun=1.4.2` at pid
 *     65151 — different processes, same runtime, and setup ran exactly once.
 *
 * Running this file on Node on purpose (to bisect a Bun bug, say) is a fine
 * thing to do; `node ./node_modules/.bin/vitest run` does it, and this one test
 * is expected to fail there. Nothing else in the suite depends on the runtime.
 */
import { expect, it } from "vitest";

it("executes on the Bun runtime, in the worker that imports the tests", () => {
  expect(
    process.versions.bun,
    "services/actors' suite is pinned to Bun by `bun run --bun vitest run`; " +
      "this worker is not running Bun. Either `--bun` was dropped from the " +
      "test script, or vitest was invoked directly through Node.",
  ).toBeTypeOf("string");
  expect(typeof (globalThis as { Bun?: unknown }).Bun).toBe("object");
});

/**
 * Phase 5b: the *host* runs on Bun too, not just the suite.
 *
 * This asserts the decision rather than the behaviour, because the behaviour is
 * unreachable from a unit test — what starts the long-lived process is a string
 * in three places (`package.json`'s `start`, `services/actors/Dockerfile`'s
 * `CMD`, and `dapr.template.yaml`'s actors `command`) and none of them is
 * imported by anything. A silent revert of any one of them is exactly the
 * failure `runtime.test.ts` above exists to catch for the test runner.
 *
 * `start:node` is asserted as well, and that is the more important half. The
 * evidence for running this service on Bun is empirical (see
 * `docs/architecture/findings/bun-actor-host.md`), and empirical conclusions
 * expire. The Node path is the rollback; a rollback that quietly disappears is
 * not a rollback.
 */
it("starts the host on bun, and keeps a documented node path", async () => {
  const manifest = await import("../../package.json", {
    with: { type: "json" },
  });
  const scripts = (manifest.default as { scripts: Record<string, string> })
    .scripts;

  expect(
    scripts.start,
    "services/actors' `start` script must run the host on bun (phase 5b)",
  ).toBe("bun src/index.ts");
  expect(
    scripts["start:node"],
    "`start:node` is the documented rollback to Node 24 type stripping; " +
      "deleting it removes the only supported way back",
  ).toBe("node src/index.ts");
});
