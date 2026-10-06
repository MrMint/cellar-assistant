/**
 * `makeApiClient` must hand graphcache the introspected schema.
 *
 * Without `schema:`, `@urql/exchange-graphcache` cannot tell that
 * `ConflictError` implements `ActorError`, so it matches a fragment on the
 * abstract type heuristically — and on a **mutation** result the heuristic
 * loses: `...ActorErrorFields` (`errors.ts`, a fragment on `ActorError`) is
 * written and then dropped on the way back out, and the UI renders
 * `unwrapResult`'s "Something went wrong." in place of the actor's own
 * message — and loses the `reason` it would have branched on.
 *
 * Measured against 9.0.1 with the generated `keys`, fresh cache, canned bodies:
 *
 * ```
 *                                   with schema        without schema
 *   mutation → ConflictError        code + message     {"__typename":"ConflictError"}
 *   query    → NotFoundError        code + message     code + message
 * ```
 *
 * Two things follow from that table, and both shape this file:
 *
 * - **It has to be a mutation.** A query result is read back through the same
 *   heuristic *after* it was written, finds `code` and `message` on the record
 *   and matches, so a query-shaped test passes with or without the schema and
 *   guards nothing.
 * - **It has to assert data, not warnings.** The drop happens in every
 *   `NODE_ENV`; graphcache's "Heuristic Fragment Matching" warning is wrapped
 *   in `"production" !== process.env.NODE_ENV`. That is why
 *   `packages/e2e/specs/10-graphcache.spec.ts`, which only watches the console,
 *   can never fail against the production-built client container — and why
 *   this file, not that spec, is the guard.
 *
 * `graphcache-schema.test.ts` covers the other half: that the generated
 * artifact matches the SDL. This file covers the wiring — that
 * `urql-client.ts` actually passes it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { VoteOnRecipeMutation } from "@/components/recipe/queries";
import { unwrapResult } from "./result.ts";
import {
  makeApiClient,
  RATE_LIMIT_MAX_WAIT_MS,
  RATE_LIMIT_RETRIES,
  withRateLimitBackoff,
} from "./urql-client.ts";

/**
 * A refusal `voteOnRecipe` really makes (B6's group-scoping check), carrying a
 * `reason` so the assertion below proves the whole `ActorErrorFields`
 * selection survives the cache — `reason` included, which is the field a
 * client branches on — not just `code` and `message`.
 */
const REFUSAL = {
  __typename: "NotFoundError",
  code: "NOT_FOUND",
  reason: "RECIPE_NOT_IN_GROUP",
  message: "that recipe is not a version in this group",
};

/** The HTTP hop, answered with one canned GraphQL body. */
const cannedFetch = (body: unknown): typeof globalThis.fetch =>
  (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof globalThis.fetch;

/** One vote through the real client, answered with {@link REFUSAL}. */
const vote = () =>
  makeApiClient({
    fetch: cannedFetch({ data: { voteOnRecipe: REFUSAL } }),
  })
    .client.mutation(VoteOnRecipeMutation, {
      recipeGroupId: "00000000-0000-4000-8000-000000000001",
      recipeId: "00000000-0000-4000-8000-000000000002",
      voteType: "upvote",
    })
    .toPromise();

test("a typed error on a mutation keeps its code, reason and message through the cache", async () => {
  // graphcache's own "Heuristic Fragment Matching" warning is a second witness
  // for the same wiring. Two caveats keep it in this one test rather than its
  // own: it is compiled out when NODE_ENV is "production" (`bun test` is not),
  // and graphcache prints each distinct warning **once per module instance**,
  // so a second test in this file would see nothing whatever the wiring.
  assert.notEqual(process.env.NODE_ENV, "production");
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };

  let response: Awaited<ReturnType<typeof vote>>;
  try {
    response = await vote();
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(response.error, undefined, String(response.error));
  const result = unwrapResult(response.data?.voteOnRecipe, "RecipeVotePayload");
  assert.deepEqual(
    result,
    {
      ok: false,
      error: {
        __typename: "NotFoundError",
        code: REFUSAL.code,
        reason: REFUSAL.reason,
        message: REFUSAL.message,
      },
    },
    "graphcache dropped `...ActorErrorFields` — is `schema: graphcacheSchema` still passed to cacheExchange in urql-client.ts?",
  );
  assert.deepEqual(
    warnings.filter((line) => /Heuristic Fragment Matching/i.test(line)),
    [],
    "graphcache is matching fragments heuristically — it has no schema",
  );
});

/*
 * The proxy's 429 (`RATE_LIMITED`, `Retry-After`) is refused before the API,
 * so the client waits and resends instead of failing the query
 * (`withRateLimitBackoff`).
 */
test("a 429 is waited out for its Retry-After and resent, a bounded number of times", async () => {
  const waits: number[] = [];
  const fakeWait = async (ms: number) => {
    waits.push(ms);
  };
  const answers = [429, 429, 200];
  let sent = 0;
  const fetchImpl = (async () => {
    const status = answers[sent] ?? 200;
    sent += 1;
    return status === 429
      ? new Response('{"errors":[{"message":"slow down"}]}', {
          status,
          headers: { "retry-after": sent === 1 ? "2" : "60" },
        })
      : Response.json({ data: { __typename: "Query" } });
  }) as typeof globalThis.fetch;

  const response = await withRateLimitBackoff(fetchImpl, fakeWait)(
    "/api/graphql",
    { method: "POST", body: "{}" },
  );
  assert.equal(response.status, 200);
  assert.equal(sent, 3);
  // The server's wait, capped.
  assert.deepEqual(waits, [2_000, RATE_LIMIT_MAX_WAIT_MS]);

  // Past the retry budget, the 429 is the answer.
  sent = 0;
  answers.splice(0, answers.length, 429, 429, 429, 429);
  const exhausted = await withRateLimitBackoff(fetchImpl, fakeWait)(
    "/api/graphql",
    { method: "POST", body: "{}" },
  );
  assert.equal(exhausted.status, 429);
  assert.equal(sent, 1 + RATE_LIMIT_RETRIES);
});

test("makeApiClient resends a rate-limited operation and returns its data", async () => {
  let sent = 0;
  const { client } = makeApiClient({
    fetch: (async () => {
      sent += 1;
      return sent === 1
        ? new Response('{"errors":[{"message":"slow down"}]}', {
            status: 429,
            headers: { "retry-after": "0" },
          })
        : Response.json({ data: { __typename: "Query" } });
    }) as typeof globalThis.fetch,
  });
  const result = await client
    .query(
      "query BackoffPing { __typename }",
      {},
      {
        requestPolicy: "network-only",
      },
    )
    .toPromise();
  assert.equal(result.error, undefined);
  assert.equal(sent, 2);
});
