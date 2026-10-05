/**
 * The generated graphcache schema must stay in sync with the SDL, and must
 * actually carry the abstract types it exists for.
 *
 * Why this file exists: `cacheExchange` was configured with `keys` but no
 * `schema`, so graphcache guessed at interfaces and unions — and on a mutation
 * result its guess is to silently drop the inline fragment on the abstract
 * type. `... on ActorError { code message }` came back as a bare
 * `__typename`, and the UI rendered "Something went wrong." instead of the
 * actor's own explanation. Nothing failed: not tsc, not a unit test, not a
 * lint.
 *
 * **This file guards the artifact, not the wiring.** It fails when the
 * generated schema drifts from the SDL or stops mapping `ActorError` as an
 * interface; it would stay green if `urql-client.ts` stopped passing the
 * artifact at all. `urql-client.test.ts` is the guard for that half. (Neither
 * half is guarded by `packages/e2e/specs/10-graphcache.spec.ts`: it watches for
 * graphcache's console warnings, which a production build compiles out.)
 *
 * `graphcache-keys` has gone silently red four separate times, which is the
 * argument for asserting the generated content here rather than trusting that
 * someone re-ran the generator.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

test("the generated schema has not drifted from the SDL", () => {
  // The codegen writes the file in place and prints a summary, so compare the
  // file across a regeneration rather than capturing stdout. A failure here
  // means the file on disk has *already* been corrected — review and commit it.
  const before = readFileSync(here("./graphcache-schema.generated.ts"), "utf8");
  execFileSync(process.execPath, [here("./graphcache-schema-codegen.ts")], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const after = readFileSync(here("./graphcache-schema.generated.ts"), "utf8");
  assert.equal(
    after,
    before,
    "graphcache-schema.generated.ts was stale against the SDL; it has just been regenerated in place — review and commit it",
  );
});

test("ActorError is mapped, so its inline fragments survive the cache", async () => {
  const { graphcacheSchema } = await import("./graphcache-schema.generated.ts");
  const actorError = graphcacheSchema.__schema.types.find(
    (t) => t.name === "ActorError",
  );
  assert.ok(actorError, "ActorError missing from the generated schema");
  assert.equal(
    actorError.kind,
    "INTERFACE",
    "ActorError must stay abstract — a concrete ActorError would mean the API changed shape",
  );
});
