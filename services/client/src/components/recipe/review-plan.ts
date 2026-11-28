import { reviewTextForSave } from "./adapter";

/**
 * The review's two writes on the recipe page as data, so each rule is tested
 * apart from the form: Delete removes the viewer's own review and nothing
 * else, and its Undo writes back the review that was deleted — its stars and
 * words, in the form a save stores them — never what the composer holds.
 */
export type OwnReview = {
  id: string;
  /** The author, when the caller knows it; a mismatch blocks the delete. */
  userId?: string;
  score?: number;
  /** Serialized Lexical state, or null. */
  text?: string | null;
};

/** `deleteRecipeReview`'s variables, or null when it is not the viewer's. */
export const reviewDeleteWrite = (
  recipeId: string,
  review: OwnReview | null,
  viewerId: string | null,
): { recipeId: string; reviewId: string } | null => {
  if (review === null || viewerId === null) return null;
  if (review.userId !== undefined && review.userId !== viewerId) return null;
  return { recipeId, reviewId: review.id };
};

/** What Undo adds back: the deleted review's own score and text. */
export const reviewRestoreWrite = (
  review: OwnReview,
): { score?: number; text?: string } => ({
  score: review.score,
  text: reviewTextForSave(review.text ?? undefined),
});
