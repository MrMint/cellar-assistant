/**
 * The recipe fragments — the successor of
 * `82450ad1:src/components/shared/fragments/recipe-fragments.ts` and
 * `recipe-group-fragments.ts`, read against `packages/schema/schema.graphql`.
 *
 * What changed under the old names (`adapter.ts` turns these back into the
 * old snake_case props):
 *
 * - `recipe_ingredients { wine beer spirit coffee generic_item }` → one
 *   `item` (the `Item` interface, any of six types) or `genericItem`.
 * - `recipe_reviews { user }` → `reviews` (a paged connection) with
 *   `RecipeReview.user` (G4). In production the relationship had no Hasura
 *   permission, so the old detail page threw on load.
 * - `votes_aggregate` ×3 and `votes(where: {user_id: "X-Hasura-User-Id"})` →
 *   `Recipe.upvotes`/`downvotes`/`netScore`/`myVote` (G27). The old query
 *   aliased nothing, so its "downvotes" were always 0 and its `myVote` filter
 *   compared against the literal string — neither is carried forward.
 * - `recipe_groups.canonical_recipe` (the card summary, which never rendered:
 *   the old query selected `canonical_recipe_rel`) → `RecipeGroup.canonicalRecipe`,
 *   one `Recipe` loader read per card (G28 was not built; this is its
 *   documented fallback).
 * - `created_by_user` → `Recipe.createdBy` (G4).
 *
 * Ingredient and instruction fields are inlined rather than spread, so the
 * adapter can take `ResultOf<…>` of one fragment without unmasking three.
 */

import { graphql } from "@/lib/api/graphql";

/**
 * One card of `/recipes` (`RecipeGroupCard`). `__typename` is selected so
 * `readFragment` works on the union branch it is spread into.
 */
export const RecipeGroupCardFragment = graphql(`
  fragment RecipeGroupCardData on RecipeGroup {
    __typename
    id
    name
    description
    category
    baseSpirit
    tags
    imageUrl
    recipeCount
    canonicalRecipeId
    canonicalRecipe {
      id
      name
      description
      difficultyLevel
      prepTimeMinutes
      servingSize
      imageUrl
    }
  }
`);

/**
 * Everything `RecipeDetails` and `RecipeVersionsTab` render for one recipe,
 * except reviews (paged separately) and votes (`RecipeVoteStateFragment`).
 *
 * `ingredients(first: 50)` / `instructions(first: 100)`: the old query took
 * every row; a recipe with more does not exist, and paging them would be two
 * more round trips per recipe. Ingredients arrive in the server's order
 * (required first, then by name — A7d item 6); instructions by step.
 */
export const RecipeDetailsFragment = graphql(`
  fragment RecipeDetailsData on Recipe {
    __typename
    id
    name
    description
    type
    difficultyLevel
    prepTimeMinutes
    servingSize
    imageUrl
    version
    recipeGroupId
    canonicalRecipeId
    createdAt
    createdBy {
      id
      displayName
      avatarUrl
    }
    ingredients(first: 50) {
      edges {
        node {
          id
          quantity
          unit
          isOptional
          substitutionNotes
          refType
          item {
            __typename
            id
            name
            type
            ... on Wine {
              vintage
            }
          }
          genericItem {
            id
            name
            category
            subcategory
            kind
          }
        }
      }
    }
    instructions(first: 100) {
      edges {
        node {
          id
          stepNumber
          instructionText
          instructionType
          equipmentNeeded
          timeMinutes
        }
      }
    }
  }
`);

/** The vote fields of one version (G27), polled on the versions page. */
export const RecipeVoteStateFragment = graphql(`
  fragment RecipeVoteState on Recipe {
    __typename
    id
    netScore
    upvotes
    downvotes
    myVote
  }
`);

/** One review row (`RecipeReviews`), with its author (G4). */
export const RecipeReviewFragment = graphql(`
  fragment RecipeReviewData on RecipeReview {
    __typename
    id
    userId
    score
    text
    createdAt
    user {
      id
      displayName
      avatarUrl
    }
  }
`);
