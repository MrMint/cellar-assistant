"use server";

import { graphql } from "@cellar-assistant/shared";
import { revalidatePath } from "next/cache";
import { serverMutation } from "@/lib/urql/server";
import { getOptionalServerUser } from "@/utilities/auth-server";

const addRecipeReviewMutation = graphql(`
  mutation AddRecipeReview($review: recipe_reviews_insert_input!) {
    insert_recipe_reviews_one(object: $review) {
      id
      score
      text
      created_at
      user {
        id
        displayName
        avatarUrl
      }
    }
  }
`);

const voteRecipeMutation = graphql(`
  mutation VoteRecipe($recipeId: uuid!, $voteType: String!) {
    insert_recipe_votes_one(
      object: { recipe_id: $recipeId, vote_type: $voteType }
      on_conflict: {
        constraint: recipe_votes_recipe_id_user_id_key
        update_columns: [vote_type]
      }
    ) {
      id
      vote_type
    }
  }
`);

const removeVoteMutation = graphql(`
  mutation RemoveVote($recipeId: uuid!, $userId: uuid!) {
    delete_recipe_votes(
      where: {
        _and: [{ recipe_id: { _eq: $recipeId } }, { user_id: { _eq: $userId } }]
      }
    ) {
      affected_rows
    }
  }
`);

export type AddRecipeReviewResult = {
  success: boolean;
  reviewId?: string;
  userId?: string;
  error?: string;
};

export async function addRecipeReviewAction(
  recipeId: string,
  score?: number,
  text?: string,
): Promise<AddRecipeReviewResult> {
  const user = await getOptionalServerUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    const result = await serverMutation(addRecipeReviewMutation, {
      review: {
        recipe_id: recipeId,
        score,
        text,
      },
    });

    // Revalidate recipe pages
    revalidatePath(`/recipes/${recipeId}`, "page");
    revalidatePath("/recipes/[recipeId]", "page");

    const reviewData = result.insert_recipe_reviews_one;
    return {
      success: true,
      reviewId: reviewData?.id,
      userId: (reviewData?.user as { id: string } | undefined)?.id,
    };
  } catch (error) {
    console.error("Failed to add recipe review:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to add recipe review",
    };
  }
}

export type VoteRecipeResult = {
  success: boolean;
  voteId?: string;
  error?: string;
};

export async function voteRecipeAction(
  recipeId: string,
  voteType: "upvote" | "downvote",
): Promise<VoteRecipeResult> {
  const user = await getOptionalServerUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    const result = await serverMutation(voteRecipeMutation, {
      recipeId,
      voteType,
    });

    // Revalidate recipe pages
    revalidatePath(`/recipes/${recipeId}`, "page");
    revalidatePath("/recipes/[recipeId]", "page");

    return {
      success: true,
      voteId: result.insert_recipe_votes_one?.id,
    };
  } catch (error) {
    console.error("Failed to vote on recipe:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to vote on recipe",
    };
  }
}

export type RemoveVoteResult = {
  success: boolean;
  error?: string;
};

export async function removeVoteAction(
  recipeId: string,
): Promise<RemoveVoteResult> {
  const user = await getOptionalServerUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    // Use authenticated user's ID - prevents users from removing others' votes
    await serverMutation(removeVoteMutation, { recipeId, userId: user.id });

    // Revalidate recipe pages
    revalidatePath(`/recipes/${recipeId}`, "page");
    revalidatePath("/recipes/[recipeId]", "page");

    return { success: true };
  } catch (error) {
    console.error("Failed to remove vote:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to remove vote",
    };
  }
}
