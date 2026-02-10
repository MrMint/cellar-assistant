"use server";

import type { ItemTypeValue } from "@cellar-assistant/shared";
import { graphql } from "@cellar-assistant/shared";
import { revalidatePath } from "next/cache";
import { serverMutation } from "@/lib/urql/server";
import { typeToIdKey } from "@/utilities";
import { getOptionalServerUser } from "@/utilities/auth-server";

const addFavoriteMutation = graphql(`
  mutation AddFavoriteMutation($object: item_favorites_insert_input!) {
    insert_item_favorites_one(object: $object) {
      id
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

const deleteFavoriteMutation = graphql(`
  mutation DeleteFavoriteMutation($id: uuid!) {
    delete_item_favorites_by_pk(id: $id) {
      id
    }
  }
`);

export type FavoriteResult = {
  success: boolean;
  favoriteId?: string;
  error?: string;
};

export async function addFavoriteAction(
  itemId: string,
  type: ItemTypeValue,
): Promise<FavoriteResult> {
  const user = await getOptionalServerUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    const result = await serverMutation(addFavoriteMutation, {
      object: { [typeToIdKey(type)]: itemId },
    });

    // Revalidate item pages
    const typeLower = type.toLowerCase();
    revalidatePath(`/${typeLower}s/[itemId]`, "page");
    revalidatePath("/cellars/[cellarId]", "page");

    return {
      success: true,
      favoriteId: result.insert_item_favorites_one?.id,
    };
  } catch (error) {
    console.error("Failed to add favorite:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add favorite",
    };
  }
}

export async function deleteFavoriteAction(
  favoriteId: string,
): Promise<FavoriteResult> {
  const user = await getOptionalServerUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    await serverMutation(deleteFavoriteMutation, {
      id: favoriteId,
    });

    // Revalidate all item pages
    revalidatePath("/beers/[itemId]", "page");
    revalidatePath("/wines/[itemId]", "page");
    revalidatePath("/spirits/[itemId]", "page");
    revalidatePath("/coffees/[itemId]", "page");
    revalidatePath("/sakes/[itemId]", "page");
    revalidatePath("/cellars/[cellarId]", "page");

    return { success: true };
  } catch (error) {
    console.error("Failed to delete favorite:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to delete favorite",
    };
  }
}
