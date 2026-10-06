import { request } from "@playwright/test";
import { BASE_URL } from "../fixtures/accounts.ts";
import { expect, settleNetwork, test, watch } from "../fixtures/test.ts";

/**
 * A dev-server smoke check that graphcache is not guessing — **not** the guard
 * for `schema:` in `urql-client.ts`, and it skips itself on a production build.
 *
 * `makeApiClient` builds `cacheExchange({ keys: graphcacheKeys, schema:
 * graphcacheSchema })` (`services/client/src/lib/api/urql-client.ts`). Without
 * that `schema:`, `@urql/exchange-graphcache` cannot tell which union member or
 * `ActorError` implementor a result is, falls back to *heuristic fragment
 * matching*, and says so in the console:
 *
 *     Heuristic Fragment Matching: A fragment is trying to match against the
 *     `FriendConnection` type, but the type condition is `ActorError`.
 *     Invalid undefined: The field at `code` is `undefined` …
 *
 * ## Why this cannot be the guard
 *
 * Every one of those warnings is wrapped in
 * `"production" !== process.env.NODE_ENV` in `@urql/exchange-graphcache`
 * 9.0.1. The default e2e lane — the client container on :3003 — is a
 * `next build`, so there is nothing for this file to see there: removing
 * `schema:` would leave it green. It used to say it was "the one place that
 * would notice" that, and against the default lane it never could.
 *
 * What does notice, in the default unit suite and in every `NODE_ENV`:
 *
 * - `services/client/src/lib/api/urql-client.test.ts` — runs a mutation
 *   through the real `makeApiClient` against a canned `ConflictError` and
 *   asserts `code`/`message` survive the cache. Fails if `schema:` is removed
 *   or a refactor stops passing it.
 * - `services/client/src/lib/api/graphcache-schema.test.ts` — fails if the
 *   generated artifact goes stale against `packages/schema/schema.graphql`.
 *
 * ## What it is still for
 *
 * Against a host `next dev` (`E2E_BASE_URL=http://localhost:3000`) the warnings
 * are live, and these pages cover shapes the unit test does not: a result union
 * over a connection, the `Item` interface across six implementations, and a
 * union inside a paged list. So it runs there, and on a production build it
 * **skips** with a reason instead of reporting a pass that tested nothing.
 *
 * A dev build is recognised by `/_next/mcp`: Next 16 mounts that endpoint only
 * in its dev server (`experimental.mcpServer`, default on, wired in
 * `hot-reloader-{turbopack,webpack}.js`), and `next start` answers 404 —
 * measured on :3003.
 */
const PAGES = ["/friends", "/search", "/tier-lists", "/favorites"];

/** True when {@link BASE_URL} is a `next dev`, where the warnings exist at all. */
let devBuild = false;

test.beforeAll(async () => {
  const ctx = await request.newContext({ baseURL: BASE_URL });
  try {
    const probe = await ctx.post("/_next/mcp", {
      data: {},
      headers: { accept: "application/json, text/event-stream" },
      timeout: 10_000,
    });
    devBuild = probe.status() !== 404;
  } finally {
    await ctx.dispose();
  }
});

for (const route of PAGES) {
  test(`${route}: the cache does not fall back to heuristic matching`, async ({
    primary,
  }) => {
    test.skip(
      !devBuild,
      `${BASE_URL} is a production build: graphcache compiles its warnings out, so this check would pass without testing anything. The guard is services/client/src/lib/api/urql-client.test.ts.`,
    );
    const noise = watch(primary);
    await primary.goto(route, { waitUntil: "domcontentloaded" });
    await settleNetwork(primary);

    // Some pages only fetch once something is asked of them.
    const search = primary.getByPlaceholder(/search|describe/i).first();
    if (await search.isVisible().catch(() => false)) {
      await search.fill("test");
      await primary.waitForTimeout(1500);
    }

    const heuristic = noise.console.filter((line) =>
      /Heuristic Fragment Matching/i.test(line),
    );
    const invalidUndefined = noise.console.filter((line) =>
      /Invalid undefined/i.test(line),
    );

    expect(
      { heuristic, invalidUndefined },
      `graphcache is matching fragments heuristically on ${route}; pass the introspected schema to cacheExchange`,
    ).toEqual({ heuristic: [], invalidUndefined: [] });
  });
}
