/**
 * One re-read of a recipe group's votes for `/recipes/groups/[id]/versions`:
 * each version's tallies and the viewer's own vote (G27), and the canonical.
 *
 * Out of `RecipeVersionsTab` so the page applies it **whole**, through
 * `runLatest` (`../latest-only.ts`): the 15 s poll and the re-read a vote
 * triggers both write the same state, and an older poll landing after a newer
 * re-read would put back the tally — and the viewer's own-vote marker — from
 * before the vote. A plain module, so that interleaving is unit-tested
 * (`../latest-only.test.ts`) without a renderer.
 *
 * Before G27 this walked every page of `RecipeGroup.votes` and tallied
 * `(recipeId, voteType)` client-side, because `Recipe` had no `netScore` or
 * `myVote`. It has both now, plus `upvotes`/`downvotes`, so this is one
 * request.
 */
import type { Client } from "@urql/core";
import {
  type RecipeVoteState,
  voteStateFromNode,
} from "@/components/recipe/adapter";
import { RecipeVoteStateFragment } from "@/components/recipe/fragments";
import { RecipeGroupVoteStateQuery } from "@/components/recipe/queries";
import { readFragment } from "../api/graphql.ts";
import {
  type ApiResult,
  failureFromTransport,
  unwrapResult,
} from "../api/result.ts";

export type RecipeGroupVoteSnapshot = {
  /** By recipe id. */
  votes: ReadonlyMap<string, RecipeVoteState>;
  canonicalRecipeId: string | null;
};

export const readRecipeGroupVoteSnapshot = async (
  client: Pick<Client, "query">,
  groupId: string,
): Promise<ApiResult<RecipeGroupVoteSnapshot>> => {
  const response = await client
    .query(
      RecipeGroupVoteStateQuery,
      { groupId },
      { requestPolicy: "network-only" },
    )
    .toPromise();
  if (response.error !== undefined) {
    return { ok: false, error: failureFromTransport(response.error) };
  }
  const result = unwrapResult(response.data?.recipeGroup, "RecipeGroup");
  if (!result.ok) return result;

  const votes = new Map<string, RecipeVoteState>();
  for (const edge of result.data.recipes.edges) {
    const node = readFragment(RecipeVoteStateFragment, edge.node);
    votes.set(node.id, voteStateFromNode(node));
  }
  return {
    ok: true,
    data: { votes, canonicalRecipeId: result.data.canonicalRecipeId ?? null },
  };
};
