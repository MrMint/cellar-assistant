/**
 * This suite runs on the **Bun** runtime, and this file is the only thing that
 * can tell you so.
 *
 * `package.json`'s test script is `bun run --bun vitest run`. Drop the `--bun`
 * and vitest's `#!/usr/bin/env node` shebang hands the whole tree back to Node:
 * every test still passes, the counts are identical, and the only visible
 * symptom is that the run takes about twice as long. That is a silent revert of
 * a deliberate decision, so assert the runtime rather than trust the script
 * string to still say what it said when it was written.
 *
 * `process.versions.bun` is the check. `process.versions.node` is **not** — Bun
 * reports a synthetic Node version there (26.3.0 under bun 1.4.2), so a
 * Node-version assertion passes under Bun for a reason that has nothing to do
 * with Node being present.
 *
 * This asserts inside a **worker**, not in the main process, because those are
 * different processes: forcing the runner onto Bun would be worth little if the
 * pool that imports the test files were still Node. Measured — the worker
 * reports `bun=1.4.2` with its own pid.
 *
 * Running this file on Node on purpose (to bisect a Bun bug, say) is a fine
 * thing to do; `node ./node_modules/.bin/vitest run` does it, and this one test
 * is expected to fail there. Nothing else in the suite depends on the runtime.
 *
 * ## Phase 5a
 *
 * The **service** now runs on Bun too, not just the suite. The second block
 * below guards that the same way: the runtime lives in a string in
 * `package.json` and a `CMD` in the Dockerfile, and a string is exactly the
 * kind of thing that gets quietly reverted during a merge. It also guards the
 * *other* direction — that `start:node` stays there — because the A/B lane is
 * the only way to attribute a later latency or memory change to the runtime,
 * and it is worth nothing if it rots.
 *
 * One place these tests deliberately do **not** reach: `dapr.template.yaml`'s
 * per-app `command:`, which is what the host-run dev lane actually executes.
 * That file is shared with services/actors and is sequenced separately.
 */
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("executes on the Bun runtime, in the worker that imports the tests", () => {
  expect(
    process.versions.bun,
    "services/api's suite is pinned to Bun by `bun run --bun vitest run`; " +
      "this worker is not running Bun. Either `--bun` was dropped from the " +
      "test script, or vitest was invoked directly through Node.",
  ).toBeTypeOf("string");
  expect(typeof (globalThis as { Bun?: unknown }).Bun).toBe("object");
});

const read = (relative: string): string =>
  readFileSync(new URL(relative, import.meta.url), "utf8");

const scripts = (): Record<string, string> =>
  (
    JSON.parse(read("../package.json")) as {
      scripts: Record<string, string>;
    }
  ).scripts;

it("starts the service on Bun", () => {
  expect(
    scripts().start,
    "phase 5a moved services/api's runtime to Bun. `start` must execute this " +
      "service with bun; if it says node again, either that was a deliberate " +
      "rollback (in which case say so here) or a merge lost it.",
  ).toMatch(/^bun\s/);
});

it("keeps the Node A/B lane, in package.json and in the image", () => {
  expect(
    scripts()["start:node"],
    "`start:node` is how the API is A/B-ed against Node without reverting a " +
      "commit. Removing it does not simplify anything — it only makes the " +
      "next latency or memory regression unattributable.",
  ).toMatch(/^node\s/);

  const dockerfile = read("../Dockerfile");
  expect(dockerfile).toMatch(/^CMD \["bun", "src\/index\.ts"\]$/m);
  // The bun binary has to be in a stage the *runtime* inherits, or CMD cannot
  // resolve it. It used to live in `deps` alone, on purpose; phase 5a moved it.
  const base = dockerfile.slice(
    dockerfile.indexOf("FROM node:24-bookworm-slim AS base"),
    dockerfile.indexOf("AS deps"),
  );
  expect(
    base,
    "the bun binary must be copied in the `base` stage, not `deps` — the " +
      "runtime stage inherits base and CMD is now `bun`.",
  ).toContain("/usr/local/bin/bun /usr/local/bin/bun");
  // And real Node must still be in the image, which is the whole reason the
  // base image is node:24-bookworm-slim and not oven/bun (where `node` is a
  // symlink to bun and the A/B would silently measure Bun twice).
  expect(dockerfile).toContain("FROM node:24-bookworm-slim AS base");
});
