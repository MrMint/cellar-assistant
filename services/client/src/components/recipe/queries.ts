/**
 * The recipe queries and mutations — the successor of the Hasura documents in
 * `82450ad1:src/app/(authenticated)/recipes/**` and the server actions in
 * `82450ad1:src/app/actions/recipes.ts` (`addRecipeReviewAction`,
 * `voteRecipeAction`, `removeVoteAction`).
 *
 * - `recipe_groups(where: _ilike, offset)` (`useOptimizedRecipeGroupSearch`,
 *   12 a page) → `recipeGroups(term:, category:, baseSpirit:)`, cursor-paged
 *   with a `totalCount`. `term` is G26: the same name / description / version
 *   name substring the old box searched.
 * - `recipes_by_pk` / `recipe_groups_by_pk` → `recipe(id:)` / `recipeGroup(id:)`,
 *   result unions whose `NotFoundError` covers "no such row" and "not yours"
 *   alike, so the pages 404 on both.
 * - Every write is a named command returning a result union; votes address
 *   `(recipeGroupId, recipeId)` and never a user id.
 *
 * Page sizes are plain constants in this plain module: a server component
 * reading one out of a `"use client"` module gets `undefined`, and the API then
 * refuses the request for a missing `$first` (`cellar-api/pagination.ts`).
 */

import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";
import {
  RecipeDetailsFragment,
  RecipeGroupCardFragment,
  RecipeReviewFragment,
  RecipeVoteStateFragment,
} from "./fragments";

/** The old grid asked for 12 at a time (`pageSize: 12`). */
export const RECIPE_GROUPS_PAGE_SIZE = 12;

/** Reviews on a recipe page; "Show more reviews" pages on from here. */
export const RECIPE_REVIEWS_PAGE_SIZE = 20;

/**
 * Versions on the versions page and the variation chips. Each version carries
 * its ingredients (≤50) and steps (≤100), so 20 keeps the composed document at
 * ~3,000 rows against the API's 10,000-row cap
 * (`services/api/src/client-documents.test.ts`). More is shown as a count.
 *
 * Written as a literal `first: 20` in the two versions-page documents: the
 * cost rule charges a variable `first` at the 100 cap, which for the versions
 * page is 15,100 rows and a refusal.
 */
export const RECIPE_VERSIONS_PAGE_SIZE = 20;

/** `/recipes` — the group grid. */
export const RecipeGroupsQuery = graphql(
  `
  query RecipeGroupsGrid(
    $first: Int!
    $after: String
    $term: String
    $category: RecipeCategory
    $baseSpirit: String
  ) {
    recipeGroups(
      first: $first
      after: $after
      term: $term
      category: $category
      baseSpirit: $baseSpirit
    ) {
      __typename
      ... on RecipeGroupConnection {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          cursor
          node {
            ...RecipeGroupCardData
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [RecipeGroupCardFragment, ActorErrorFieldsFragment],
);

/**
 * `/recipes/[recipeId]` and the recipe the group page shows: `RecipeDetails`'
 * whole page in one read — the recipe, its first page of reviews, and its
 * group's other versions for the "Variation of" / "Other variations" card.
 */
export const RecipePageQuery = graphql(
  `
  query RecipePage($recipeId: ID!, $reviewFirst: Int!, $versionFirst: Int!) {
    me {
      id
    }
    recipe(id: $recipeId) {
      __typename
      ... on Recipe {
        ...RecipeDetailsData
        recipeGroup {
          id
          name
          recipeCount
          canonicalRecipeId
          canonicalRecipe {
            id
            name
            type
          }
          recipes(first: $versionFirst) {
            edges {
              node {
                id
                name
                version
                difficultyLevel
              }
            }
          }
        }
        reviews(first: $reviewFirst) {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            cursor
            node {
              ...RecipeReviewData
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [RecipeDetailsFragment, RecipeReviewFragment, ActorErrorFieldsFragment],
);

/** "Show more reviews" — the next page of one recipe's reviews. */
export const RecipeReviewsPageQuery = graphql(
  `
  query RecipeReviewsPage($recipeId: ID!, $first: Int!, $after: String) {
    recipe(id: $recipeId) {
      __typename
      ... on Recipe {
        id
        reviews(first: $first, after: $after) {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            cursor
            node {
              ...RecipeReviewData
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [RecipeReviewFragment, ActorErrorFieldsFragment],
);

/**
 * `/recipes/groups/[groupId]` — the header, and which version to show:
 * the canonical, or (no votes yet, so none) the first of `recipes`, which is
 * ordered the way the canonical is chosen.
 */
export const RecipeGroupPageQuery = graphql(
  `
  query RecipeGroupPage($groupId: ID!) {
    recipeGroup(id: $groupId) {
      __typename
      ... on RecipeGroup {
        id
        name
        description
        recipeCount
        canonicalRecipeId
        recipes(first: 1) {
          edges {
            node {
              id
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/** `/recipes/groups/[groupId]/versions` — every version, in full, with votes. */
export const RecipeVersionsPageQuery = graphql(
  `
  query RecipeVersionsPage($groupId: ID!) {
    recipeGroup(id: $groupId) {
      __typename
      ... on RecipeGroup {
        id
        name
        description
        canonicalRecipeId
        recipeCount
        recipes(first: 20) {
          totalCount
          edges {
            node {
              ...RecipeDetailsData
              ...RecipeVoteState
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [RecipeDetailsFragment, RecipeVoteStateFragment, ActorErrorFieldsFragment],
);

/**
 * The versions page's 15 s poll: only what another person's vote changes —
 * the tallies, the viewer's own vote and the canonical. One request, so the
 * old multi-page vote walk (and the tally it fed) is gone.
 */
export const RecipeGroupVoteStateQuery = graphql(
  `
  query RecipeGroupVoteState($groupId: ID!) {
    recipeGroup(id: $groupId) {
      __typename
      ... on RecipeGroup {
        id
        canonicalRecipeId
        recipes(first: 20) {
          edges {
            node {
              ...RecipeVoteState
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [RecipeVoteStateFragment, ActorErrorFieldsFragment],
);

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** `voteRecipeAction(recipeId, voteType)`; replaces any earlier vote. */
export const VoteOnRecipeMutation = graphql(
  `
  mutation VoteOnRecipeVersion(
    $recipeGroupId: ID!
    $recipeId: ID!
    $voteType: RecipeVoteType!
  ) {
    voteOnRecipe(
      recipeGroupId: $recipeGroupId
      recipeId: $recipeId
      voteType: $voteType
    ) {
      __typename
      ... on RecipeVotePayload {
        canonicalChanged
        netScore
        group {
          id
          canonicalRecipeId
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/** `removeVoteAction(recipeId)` — the viewer's own vote, by construction. */
export const RemoveRecipeVoteMutation = graphql(
  `
  mutation RemoveRecipeVersionVote($recipeGroupId: ID!, $recipeId: ID!) {
    removeRecipeVote(recipeGroupId: $recipeGroupId, recipeId: $recipeId) {
      __typename
      ... on RemovedRecipeVote {
        recipeId
        canonicalChanged
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/** `addRecipeReviewAction(recipeId, score, text)`. One per viewer. */
export const AddRecipeReviewMutation = graphql(
  `
  mutation AddRecipeReviewRestored($recipeId: ID!, $input: AddRecipeReviewInput!) {
    addRecipeReview(recipeId: $recipeId, input: $input) {
      __typename
      ... on RecipeReview {
        id
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/** Author only — the viewer's own review, opened pre-filled. */
export const UpdateRecipeReviewMutation = graphql(
  `
  mutation UpdateRecipeReviewRestored(
    $recipeId: ID!
    $reviewId: ID!
    $input: UpdateRecipeReviewInput!
  ) {
    updateRecipeReview(recipeId: $recipeId, reviewId: $reviewId, input: $input) {
      __typename
      ... on RecipeReview {
        id
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/** Author only. */
export const DeleteRecipeReviewMutation = graphql(
  `
  mutation DeleteRecipeReviewRestored($recipeId: ID!, $reviewId: ID!) {
    deleteRecipeReview(recipeId: $recipeId, reviewId: $reviewId) {
      __typename
      ... on DeletedRecipeReview {
        id
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);
