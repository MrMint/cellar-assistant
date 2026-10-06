/**
 * Guards the one place the API routes can be broken from outside themselves.
 *
 * Next 16 renamed `middleware.ts` to `proxy.ts`, and `src/proxy.ts`'s matcher
 * excludes only static assets, the auth pages and the two `/api/` proxies — so
 * any *other* route under `/api/` runs the signed-in gate by default. Both
 * exclusions are required for different reasons: `/api/auth/*` is how a viewer
 * becomes signed in, so gating it on already being signed in is a deadlock, and
 * `/api/graphql` has to answer its caller with a 401 rather than a 302 to an
 * HTML sign-in page, which no GraphQL client can parse.
 *
 * The route handlers cannot see this: they are handed a `Request` that already
 * got past the middleware. Hence a test on the matcher itself.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { AUTH_BASE_PATH, GRAPHQL_PROXY_PATH } from "./endpoints.ts";

/**
 * Read from source rather than imported: `src/proxy.ts` pulls in `next/server`,
 * which does not resolve outside a Next build.
 */
const matcher = (): RegExp => {
  const source = readFileSync(
    fileURLToPath(new URL("../../proxy.ts", import.meta.url)),
    "utf8",
  );
  const found = /"(\/\(\(\?!.*?\)\.\*\))"/.exec(source);
  assert.ok(
    found?.[1] !== undefined,
    "no matcher pattern found in src/proxy.ts",
  );
  return new RegExp(`^${found[1]}$`);
};

test("the middleware does not intercept the API routes", () => {
  const runs = matcher();
  for (const path of [
    `${AUTH_BASE_PATH}/sign-in/email`,
    `${AUTH_BASE_PATH}/sign-up/email`,
    `${AUTH_BASE_PATH}/sign-out`,
    `${AUTH_BASE_PATH}/get-session`,
    `${AUTH_BASE_PATH}/token`,
    `${AUTH_BASE_PATH}/callback/google`,
    GRAPHQL_PROXY_PATH,
  ]) {
    assert.equal(
      runs.test(path),
      false,
      `${path} would be gated by the signed-in middleware`,
    );
  }
});

test("it still guards every page", () => {
  const runs = matcher();
  // Narrowing the matcher past the two `/api/` prefixes would take the gate off
  // pages that need it.
  assert.equal(runs.test("/cellars"), true);
  assert.equal(runs.test("/recipes/ai-generator"), true);
  assert.equal(runs.test("/friends"), true);
  assert.equal(runs.test("/sign-in"), false);
});
