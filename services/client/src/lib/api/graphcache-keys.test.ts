/**
 * `graphcache-keys.generated.ts` must stay in sync with the SDL.
 *
 * This used to be the only guard on the hand-maintained `graphcache-keys.ts`:
 * a live re-derivation compared against a checked-in array, with nobody
 * regenerating the array when it failed. It went quietly stale four times
 * (plan X6) before the array itself was replaced by this generated file, so
 * this test now follows the same "regenerate in place and diff" contract as
 * `graphcache-schema.test.ts` — the generator, not this test, is the single
 * source of truth for the list.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildSchema } from "graphql";
import { graphcacheKeys, KEYLESS_TYPES } from "./graphcache-keys.generated.ts";
import { SCHEMA_SDL_PATH } from "./graphcache-schema-codegen.ts";

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

test("the generated keys map has not drifted from the SDL", () => {
  // The codegen writes both artifacts in place and prints a summary, so
  // compare the file across a regeneration rather than capturing stdout. A
  // failure here means the file on disk has *already* been corrected —
  // review and commit it.
  const before = readFileSync(here("./graphcache-keys.generated.ts"), "utf8");
  execFileSync(process.execPath, [here("./graphcache-schema-codegen.ts")], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const after = readFileSync(here("./graphcache-keys.generated.ts"), "utf8");
  assert.equal(
    after,
    before,
    "graphcache-keys.generated.ts was stale against the SDL; it has just been regenerated in place — review and commit it",
  );
});

test("every keyless type is mapped to an embedded (null-keyed) entry", () => {
  assert.equal(Object.keys(graphcacheKeys).length, KEYLESS_TYPES.length);
  assert.equal(graphcacheKeys.PageInfo?.(), null);
  assert.equal(graphcacheKeys.NotFoundError?.(), null);
  assert.equal(graphcacheKeys.ItemConnection?.(), null);
});

test("types that do have an id are left to graphcache's default keying", () => {
  // Relay Node and global ids were not adopted (plan §8.3), so `id` is a raw
  // uuid and `__typename` + `id` is the right key.
  assert.equal("Item" in graphcacheKeys, false);
  assert.equal("Cellar" in graphcacheKeys, false);
  assert.equal("Viewer" in graphcacheKeys, false);
});

test("the schema has no subscription root", () => {
  // Unrelated to keying itself, but `deriveKeylessTypeNames` special-cases
  // `getSubscriptionType()` the same way it does Query and Mutation, and that
  // branch is otherwise never exercised — subscriptions were removed in the
  // design review (`urql-client.ts`), and there is no subscription root to
  // catch a regression against.
  const schema = buildSchema(readFileSync(SCHEMA_SDL_PATH, "utf8"));
  assert.equal(schema.getSubscriptionType(), undefined);
});
