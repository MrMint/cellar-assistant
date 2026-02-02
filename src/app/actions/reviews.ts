"use server";

import { graphql } from "@cellar-assistant/shared";
import { revalidatePath } from "next/cache";
import { serverMutation } from "@/lib/urql/server";
import { getOptionalServerUser } from "@/utilities/auth-server";

const addItemReviewMutation = graphql(`
  mutation AddItemReview($review: item_reviews_insert_input!) {
    insert_item_reviews_one(object: $review) {
      id
      score
      text
      createdAt: created_at
      user {
        avatarUrl
        displayName
      }
      beer {
        id
      }
      wine {
        id
      }
      spirit {
        id
      }
      coffee {
        id
      }
      sake {
        id
      }
    }
  }
`);

export type AddReviewInput = {
  beerId?: string;
  wineId?: string;
  spiritId?: string;
  coffeeId?: string;
  sakeId?: string;
  score?: number;
  text?: string;
};

export type AddReviewResult = {
  success: boolean;
  error?: string;
};

export async function addReviewAction(
  input: AddReviewInput,
): Promise<AddReviewResult> {
  const user = await getOptionalServerUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const { beerId, wineId, spiritId, coffeeId, sakeId, score, text } = input;

  // Build the review object with only the item ID that's provided
  const review: {
    beer_id?: string;
    wine_id?: string;
    spirit_id?: string;
    coffee_id?: string;
    sake_id?: string;
    score?: number;
    text?: string;
  } = { score, text };

  if (beerId) review.beer_id = beerId;
  else if (wineId) review.wine_id = wineId;
  else if (spiritId) review.spirit_id = spiritId;
  else if (coffeeId) review.coffee_id = coffeeId;
  else if (sakeId) review.sake_id = sakeId;

  try {
    await serverMutation(addItemReviewMutation, { review });

    // Revalidate the item detail pages
    if (beerId) revalidatePath(`/beers/${beerId}`);
    if (wineId) revalidatePath(`/wines/${wineId}`);
    if (spiritId) revalidatePath(`/spirits/${spiritId}`);
    if (coffeeId) revalidatePath(`/coffees/${coffeeId}`);
    if (sakeId) revalidatePath(`/sakes/${sakeId}`);

    // Also revalidate cellar item pages since reviews show there too
    revalidatePath("/cellars/[cellarId]/beers/[itemId]", "page");
    revalidatePath("/cellars/[cellarId]/wines/[itemId]", "page");
    revalidatePath("/cellars/[cellarId]/spirits/[itemId]", "page");
    revalidatePath("/cellars/[cellarId]/coffees/[itemId]", "page");
    revalidatePath("/cellars/[cellarId]/sakes/[itemId]", "page");

    return { success: true };
  } catch (error) {
    console.error("Failed to add review:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add review",
    };
  }
}
