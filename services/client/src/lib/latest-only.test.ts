/**
 * The two interleavings `latest-only.ts` exists for, driven step by step.
 *
 * Each test holds every response in its own hand and releases them in the
 * order that used to corrupt the page, then asserts what the page would have
 * been left showing. No renderer: the components hand all their writes to
 * `runLatest`'s `apply`, so what `apply` receives *is* what the page shows.
 *
 *   bun run --filter @cellar-assistant/client test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Client } from "@urql/core";
import { createLatestOnly, runLatest } from "./latest-only.ts";
import {
  type RecipeGroupVoteSnapshot,
  readRecipeGroupVoteSnapshot,
} from "./recipes/group-snapshot.ts";

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
const deferred = <T>(): Deferred<T> => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

/**
 * A urql client whose every `query().toPromise()` waits for the test to answer
 * it. `calls` is in the order the code under test asked.
 */
const heldClient = () => {
  const calls: {
    variables: Record<string, unknown>;
    answer: (data: unknown) => void;
  }[] = [];
  const client = {
    query: (_document: unknown, variables: Record<string, unknown>) => {
      const pending = deferred<{ data: unknown; error: undefined }>();
      calls.push({
        variables,
        answer: (data) => pending.resolve({ data, error: undefined }),
      });
      return { toPromise: () => pending.promise };
    },
  } as unknown as Pick<Client, "query">;
  return { client, calls };
};

const RECIPE = "33333333-3333-4333-8333-333333333333";

/** A `RecipeGroupVoteStateQuery` answer: one version's G27 vote fields. */
const groupAnswer = (votes: {
  upvotes: number;
  downvotes: number;
  myVote: "upvote" | "downvote" | null;
}) => ({
  recipeGroup: {
    __typename: "RecipeGroup",
    id: "group",
    canonicalRecipeId: votes.upvotes > votes.downvotes ? RECIPE : null,
    recipes: {
      edges: [
        {
          node: {
            __typename: "Recipe",
            id: RECIPE,
            netScore: votes.upvotes - votes.downvotes,
            ...votes,
          },
        },
      ],
    },
  },
});

test("RecipeVersionsTab: a poll that finishes after the post-vote re-read does not revert the vote", async () => {
  const { client, calls } = heldClient();
  const gate = createLatestOnly();
  const shown: RecipeGroupVoteSnapshot[] = [];
  const apply = (
    result: Awaited<ReturnType<typeof readRecipeGroupVoteSnapshot>>,
  ) => {
    assert.ok(result.ok, "the fake client answers every read successfully");
    shown.push(result.data);
  };

  // The 15s poll starts, and is slow to answer.
  const poll = runLatest(
    gate,
    () => readRecipeGroupVoteSnapshot(client, "group"),
    apply,
  );
  // The viewer's vote commits and the tab re-reads.
  const reread = runLatest(
    gate,
    () => readRecipeGroupVoteSnapshot(client, "group"),
    apply,
  );
  assert.equal(calls.length, 2);

  calls[1]?.answer(groupAnswer({ upvotes: 1, downvotes: 0, myVote: "upvote" }));
  assert.equal(await reread, true, "the re-read is the newest; it applies");

  // Only now does the poll — started before the vote — answer.
  calls[0]?.answer(groupAnswer({ upvotes: 0, downvotes: 0, myVote: null }));
  assert.equal(await poll, false, "the poll was superseded; it must not apply");

  assert.equal(shown.length, 1, "exactly one answer reached the page");
  const [final] = shown;
  assert.deepEqual(final?.votes.get(RECIPE), {
    upvotes: 1,
    downvotes: 0,
    netScore: 1,
    userVote: "upvote",
  });
  assert.equal(final?.canonicalRecipeId, RECIPE);
});

test("RankingsBoard: a Load more in flight when the filter changes never lands", async () => {
  const gate = createLatestOnly();
  const appended: string[][] = [];
  const oldFilterPage = deferred<string[]>();

  const loadMore = runLatest(
    gate,
    () => oldFilterPage.promise,
    (rows) => appended.push(rows),
  );
  // The filter changes: `resetPaging` invalidates before clearing the rows.
  gate.invalidate();
  oldFilterPage.resolve(["row under the old filter"]);

  assert.equal(await loadMore, false);
  assert.deepEqual(appended, [], "the old filter's page was appended");

  // And the gate is not stuck: a Load more under the new filter applies.
  assert.equal(
    await runLatest(
      gate,
      async () => ["row under the new filter"],
      (rows) => appended.push(rows),
    ),
    true,
  );
  assert.deepEqual(appended, [["row under the new filter"]]);
});
