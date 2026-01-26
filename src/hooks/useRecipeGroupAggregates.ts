import { graphql } from "@cellar-assistant/shared";
import { useQuery } from "urql";

// Query for recipe group vote aggregates
const GetRecipeGroupAggregatesQuery = graphql(`
  query GetRecipeGroupAggregates($groupId: uuid!) {
    recipe_groups_by_pk(id: $groupId) {
      id
      name
      canonical_recipe_id
      recipes {
        id
        name
        version
        created_at
        votes_aggregate {
          aggregate {
            count
          }
        }
        votes_aggregate(where: {vote_type: {_eq: "upvote"}}) {
          aggregate {
            count
          }
        }
        votes_aggregate(where: {vote_type: {_eq: "downvote"}}) {
          aggregate {
            count
          }
        }
      }
    }
  }
`);

// Query for multiple recipe groups
const GetMultipleRecipeGroupAggregatesQuery = graphql(`
  query GetMultipleRecipeGroupAggregates($groupIds: [uuid!]!) {
    recipe_groups(where: {id: {_in: $groupIds}}) {
      id
      name
      canonical_recipe_id
      recipes_aggregate {
        aggregate {
          count
        }
      }
      recipes {
        id
        votes_aggregate {
          aggregate {
            count
          }
        }
        votes_aggregate(where: {vote_type: {_eq: "upvote"}}) {
          aggregate {
            count
          }
        }
        votes_aggregate(where: {vote_type: {_eq: "downvote"}}) {
          aggregate {
            count
          }
        }
      }
    }
  }
`);

export type RecipeGroupAggregate = {
  id: string;
  name: string;
  canonical_recipe_id?: string | null;
  totalRecipes: number;
  totalVotes: number;
  totalUpvotes: number;
  totalDownvotes: number;
  netScore: number;
  averageScore: number;
  recipes: Array<{
    id: string;
    name?: string;
    version?: number | null;
    created_at?: string;
    upvotes: number;
    downvotes: number;
    netScore: number;
  }>;
};

export type UseRecipeGroupAggregatesOptions = {
  enabled?: boolean;
  pollInterval?: number; // Polling interval in milliseconds
};

export type UseRecipeGroupAggregatesResult = {
  aggregate: RecipeGroupAggregate | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
};

/**
 * Hook to manage vote count queries for a single recipe group
 */
export const useRecipeGroupAggregates = (
  groupId: string,
  options: UseRecipeGroupAggregatesOptions = {},
): UseRecipeGroupAggregatesResult => {
  const { enabled = true, pollInterval } = options;

  const [result, refetch] = useQuery({
    query: GetRecipeGroupAggregatesQuery,
    variables: { groupId },
    pause: !enabled || !groupId,
    context: pollInterval
      ? {
          additionalTypenames: ["recipe_votes"],
          requestPolicy: "cache-and-network",
        }
      : undefined,
  });

  // Process the data into aggregates
  const aggregate: RecipeGroupAggregate | null = result.data
    ?.recipe_groups_by_pk
    ? (() => {
        const group = result.data.recipe_groups_by_pk;
        const recipes = group.recipes || [];

        const processedRecipes = recipes.map((recipe) => {
          const votesAggregate = recipe.votes_aggregate as
            | { aggregate?: { count?: number } }
            | undefined;
          const upvotes = votesAggregate?.aggregate?.count || 0;
          const totalVotes = votesAggregate?.aggregate?.count || 0;
          const downvotes = totalVotes - upvotes;
          const netScore = upvotes - downvotes;

          return {
            id: recipe.id,
            name: recipe.name,
            version: recipe.version,
            created_at: recipe.created_at || undefined,
            upvotes,
            downvotes,
            netScore,
          };
        });

        const totalRecipes = recipes.length;
        const totalUpvotes = processedRecipes.reduce(
          (sum, r) => sum + r.upvotes,
          0,
        );
        const totalDownvotes = processedRecipes.reduce(
          (sum, r) => sum + r.downvotes,
          0,
        );
        const totalVotes = totalUpvotes + totalDownvotes;
        const netScore = totalUpvotes - totalDownvotes;
        const averageScore = totalRecipes > 0 ? netScore / totalRecipes : 0;

        return {
          id: group.id,
          name: group.name,
          canonical_recipe_id: group.canonical_recipe_id,
          totalRecipes,
          totalVotes,
          totalUpvotes,
          totalDownvotes,
          netScore,
          averageScore,
          recipes: processedRecipes,
        };
      })()
    : null;

  return {
    aggregate,
    isLoading: result.fetching,
    error: result.error ? new Error(result.error.message) : null,
    refetch: () => refetch({ requestPolicy: "network-only" }),
  };
};

export type UseMultipleRecipeGroupAggregatesResult = {
  aggregates: { [groupId: string]: RecipeGroupAggregate };
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
};

/**
 * Hook to manage vote count queries for multiple recipe groups
 */
export const useMultipleRecipeGroupAggregates = (
  groupIds: string[],
  options: UseRecipeGroupAggregatesOptions = {},
): UseMultipleRecipeGroupAggregatesResult => {
  const { enabled = true } = options;

  const [result, refetch] = useQuery({
    query: GetMultipleRecipeGroupAggregatesQuery,
    variables: { groupIds },
    pause: !enabled || !groupIds || groupIds.length === 0,
  });

  // Process the data into aggregates map
  const aggregates: { [groupId: string]: RecipeGroupAggregate } = {};

  if (result.data?.recipe_groups) {
    result.data.recipe_groups.forEach((group) => {
      const recipes = group.recipes || [];
      const recipesAggregate = group.recipes_aggregate as {
        aggregate?: { count?: number };
      };
      const totalRecipes = recipesAggregate.aggregate?.count || 0;

      const processedRecipes = recipes.map((recipe) => {
        const votesAggregate = recipe.votes_aggregate as
          | { aggregate?: { count?: number } }
          | undefined;
        const upvotes = votesAggregate?.aggregate?.count || 0;
        const totalVotes = votesAggregate?.aggregate?.count || 0;
        const downvotes = totalVotes - upvotes;
        const netScore = upvotes - downvotes;

        return {
          id: recipe.id,
          upvotes,
          downvotes,
          netScore,
        };
      });

      const totalUpvotes = processedRecipes.reduce(
        (sum, r) => sum + r.upvotes,
        0,
      );
      const totalDownvotes = processedRecipes.reduce(
        (sum, r) => sum + r.downvotes,
        0,
      );
      const totalVotes = totalUpvotes + totalDownvotes;
      const netScore = totalUpvotes - totalDownvotes;
      const averageScore = totalRecipes > 0 ? netScore / totalRecipes : 0;

      aggregates[group.id] = {
        id: group.id,
        name: group.name,
        canonical_recipe_id: group.canonical_recipe_id,
        totalRecipes,
        totalVotes,
        totalUpvotes,
        totalDownvotes,
        netScore,
        averageScore,
        recipes: processedRecipes,
      };
    });
  }

  return {
    aggregates,
    isLoading: result.fetching,
    error: result.error ? new Error(result.error.message) : null,
    refetch: () => refetch({ requestPolicy: "network-only" }),
  };
};
