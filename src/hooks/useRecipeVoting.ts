import { graphql } from "@cellar-assistant/shared";
import { useCallback, useState } from "react";
import { useMutation, useQuery } from "urql";

// GraphQL mutations for voting
const VoteRecipeMutation = graphql(`
  mutation VoteRecipe($recipeId: uuid!, $voteType: String!) {
    insert_recipe_votes_one(
      object: {
        recipe_id: $recipeId,
        vote_type: $voteType
      },
      on_conflict: {
        constraint: recipe_votes_recipe_id_user_id_key,
        update_columns: [vote_type]
      }
    ) {
      id
      vote_type
      created_at
    }
  }
`);

const RemoveVoteMutation = graphql(`
  mutation RemoveVote($recipeId: uuid!, $userId: uuid!) {
    delete_recipe_votes(
      where: {
        _and: [
          { recipe_id: { _eq: $recipeId } },
          { user_id: { _eq: $userId } }
        ]
      }
    ) {
      affected_rows
    }
  }
`);

// Query to get current user's vote and recipe vote counts
const GetRecipeVotesQuery = graphql(`
  query GetRecipeVotes($recipeId: uuid!, $userId: uuid!) {
    recipes_by_pk(id: $recipeId) {
      id
      total_votes: votes_aggregate {
        aggregate {
          count
        }
      }
      upvotes: votes_aggregate(where: {vote_type: {_eq: "upvote"}}) {
        aggregate {
          count
        }
      }
      downvotes: votes_aggregate(where: {vote_type: {_eq: "downvote"}}) {
        aggregate {
          count
        }
      }
      user_votes: votes(where: {user_id: {_eq: $userId}}) {
        id
        vote_type
      }
    }
  }
`);

export type VoteType = "upvote" | "downvote";

export type RecipeVoteData = {
  upvotes: number;
  downvotes: number;
  netScore: number;
  totalVotes: number;
  userVote: VoteType | null;
};

export type UseRecipeVotingOptions = {
  enabled?: boolean;
  userId?: string;
};

export type UseRecipeVotingResult = {
  voteData: RecipeVoteData | null;
  isLoading: boolean;
  error: Error | null;
  vote: (voteType: VoteType) => Promise<void>;
  removeVote: () => Promise<void>;
  isVoting: boolean;
  refetch: () => void;
};

export const useRecipeVoting = (
  recipeId: string,
  options: UseRecipeVotingOptions = {},
): UseRecipeVotingResult => {
  const { enabled = true, userId } = options;
  const [isVoting, setIsVoting] = useState(false);

  // Query for vote data
  const [voteResult, refetchVotes] = useQuery({
    query: GetRecipeVotesQuery,
    variables: { recipeId, userId: userId || "" },
    pause: !enabled || !recipeId || !userId,
  });

  // Mutations
  const [, executeVote] = useMutation(VoteRecipeMutation);
  const [, executeRemoveVote] = useMutation(RemoveVoteMutation);

  // Process vote data
  const voteData: RecipeVoteData | null = voteResult.data?.recipes_by_pk
    ? (() => {
        const recipe = voteResult.data.recipes_by_pk;

        // Get separate counts using the aliased fields with type safety
        const upvotes = (recipe as any).upvotes?.aggregate?.count || 0;
        const downvotes = (recipe as any).downvotes?.aggregate?.count || 0;
        const totalVotes = (recipe as any).total_votes?.aggregate?.count || 0;
        const netScore = upvotes - downvotes;
        const userVote =
          ((recipe as any).user_votes?.[0]?.vote_type as VoteType) || null;

        return {
          upvotes,
          downvotes,
          netScore,
          totalVotes,
          userVote,
        };
      })()
    : null;

  // Vote handler
  const vote = useCallback(
    async (voteType: VoteType) => {
      if (!recipeId || isVoting) return;

      setIsVoting(true);
      try {
        const result = await executeVote({
          recipeId,
          voteType,
        });

        if (result.error) {
          throw new Error(result.error.message);
        }

        // Refetch to get updated vote counts
        refetchVotes({ requestPolicy: "network-only" });
      } catch (error) {
        console.error("Error voting:", error);
        throw error;
      } finally {
        setIsVoting(false);
      }
    },
    [recipeId, isVoting, executeVote, refetchVotes],
  );

  // Remove vote handler
  const removeVote = useCallback(async () => {
    if (!recipeId || !userId || isVoting) return;

    setIsVoting(true);
    try {
      const result = await executeRemoveVote({
        recipeId,
        userId,
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      // Refetch to get updated vote counts
      refetchVotes({ requestPolicy: "network-only" });
    } catch (error) {
      console.error("Error removing vote:", error);
      throw error;
    } finally {
      setIsVoting(false);
    }
  }, [recipeId, userId, isVoting, executeRemoveVote, refetchVotes]);

  // Refetch function
  const refetch = useCallback(() => {
    refetchVotes({ requestPolicy: "network-only" });
  }, [refetchVotes]);

  return {
    voteData,
    isLoading: voteResult.fetching,
    error: voteResult.error ? new Error(voteResult.error.message) : null,
    vote,
    removeVote,
    isVoting,
    refetch,
  };
};
