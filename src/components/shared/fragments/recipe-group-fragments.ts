import { graphql } from "@cellar-assistant/shared";

/**
 * Core recipe group fields used across multiple components
 * Use this for basic recipe group identification and display
 */
export const RecipeGroupCoreFragment = graphql(`
  fragment RecipeGroupCore on recipe_groups {
    id
    name
    description
    category
    base_spirit
    tags
    image_url
    created_at
    updated_at
  }
`);

/**
 * Recipe group with canonical recipe information
 * Shows the winning recipe in the group
 */
export const RecipeGroupWithCanonicalFragment = graphql(
  `
  fragment RecipeGroupWithCanonical on recipe_groups {
    ...RecipeGroupCore
    canonical_recipe_id
    canonical_recipe_rel {
      id
      name
      description
      difficulty_level
      prep_time_minutes
      serving_size
      image_url
      version
      created_at
    }
  }
`,
  [RecipeGroupCoreFragment],
);

/**
 * Recipe group with vote aggregates
 * Shows vote counts without revealing individual votes
 */
export const RecipeGroupWithVotesFragment = graphql(
  `
  fragment RecipeGroupWithVotes on recipe_groups {
    ...RecipeGroupCore
    recipes_aggregate {
      aggregate {
        count
      }
    }
    recipes {
      id
      name
      version
      votes_aggregate {
        aggregate {
          count(columns: id)
          sum {
            vote_type
          }
        }
      }
      votes_aggregate(where: {vote_type: {_eq: "upvote"}}) {
        aggregate {
          count
        }
      }
    }
  }
`,
  [RecipeGroupCoreFragment],
);

/**
 * Full recipe group data with all recipes and their vote counts
 * Use this for recipe group detail pages with version comparison
 */
export const RecipeGroupFullFragment = graphql(
  `
  fragment RecipeGroupFull on recipe_groups {
    ...RecipeGroupCore
    canonical_recipe_id
    canonical_recipe_rel {
      id
      name
      description
      difficulty_level
      prep_time_minutes
      serving_size
      image_url
      version
      created_at
      created_by
      created_by_user {
        id
        displayName
        avatarUrl
      }
    }
    recipes(order_by: {created_at: asc}) {
      id
      name
      description
      difficulty_level
      prep_time_minutes
      serving_size
      image_url
      version
      created_at
      created_by
      created_by_user {
        id
        displayName
        avatarUrl
      }
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
      # Current user's vote on this recipe
      votes(where: {user_id: {_eq: "X-Hasura-User-Id"}}) {
        id
        vote_type
      }
    }
  }
`,
  [RecipeGroupCoreFragment],
);

/**
 * Recipe vote fragment for individual vote operations
 * Used for vote mutations and user vote status
 */
export const RecipeVoteFragment = graphql(`
  fragment RecipeVote on recipe_votes {
    id
    recipe_id
    user_id
    vote_type
    created_at
  }
`);

/**
 * Recipe with vote aggregates and user vote status
 * Shows vote counts and current user's vote without revealing other voters
 */
export const RecipeWithVotesFragment = graphql(`
  fragment RecipeWithVotes on recipes {
    id
    name
    version
    recipe_group_id
    created_by
    created_by_user {
      id
      displayName
      avatarUrl
    }
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
    # Current user's vote on this recipe (if any)
    votes(where: {user_id: {_eq: "X-Hasura-User-Id"}}) {
      id
      vote_type
    }
  }
`);
