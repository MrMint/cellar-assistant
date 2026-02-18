"use server";

import type { ItemTypeValue } from "@cellar-assistant/shared";
import { graphql } from "@cellar-assistant/shared";
import { revalidatePath, revalidateTag } from "next/cache";
import { CacheTags } from "@/lib/cache";
import { serverMutation } from "@/lib/urql/server";
import { getOptionalServerUser } from "@/utilities/auth-server";

const addCellarItemMutation = graphql(`
  mutation AddCellarItem($item: cellar_items_insert_input!) {
    insert_cellar_items_one(object: $item) {
      id
      cellar_id
    }
  }
`);

const updateCellarItemMutation = graphql(`
  mutation UpdateCellarItem($id: uuid!, $item: cellar_items_set_input!) {
    update_cellar_items_by_pk(pk_columns: { id: $id }, _set: $item) {
      id
      open_at
      empty_at
      percentage_remaining
    }
  }
`);

const deleteCellarItemMutation = graphql(`
  mutation DeleteCellarItem($itemId: uuid!) {
    delete_cellar_items_by_pk(id: $itemId) {
      id
    }
  }
`);

export type UpdateCellarItemInput = {
  id: string;
  open_at?: string;
  empty_at?: string;
  percentage_remaining?: number;
};

export type UpdateCellarItemResult = {
  success: boolean;
  error?: string;
};

export async function openCellarItemAction(
  itemId: string,
  cellarId: string,
): Promise<UpdateCellarItemResult> {
  const user = await getOptionalServerUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    await serverMutation(updateCellarItemMutation, {
      id: itemId,
      item: {
        open_at: new Date().toISOString(),
        percentage_remaining: 100,
      },
    });

    // Revalidate all cellar item pages and cached items list
    revalidatePath("/cellars/[cellarId]/beers/[itemId]", "page");
    revalidatePath("/cellars/[cellarId]/wines/[itemId]", "page");
    revalidatePath("/cellars/[cellarId]/spirits/[itemId]", "page");
    revalidatePath("/cellars/[cellarId]/coffees/[itemId]", "page");
    revalidatePath("/cellars/[cellarId]/sakes/[itemId]", "page");
    revalidateTag(CacheTags.cellarItems(cellarId), "default");

    return { success: true };
  } catch (error) {
    console.error("Failed to open cellar item:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to open cellar item",
    };
  }
}

export async function updateCellarItemPercentageAction(
  itemId: string,
  percentage: number,
  cellarId: string,
): Promise<UpdateCellarItemResult> {
  const user = await getOptionalServerUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    await serverMutation(updateCellarItemMutation, {
      id: itemId,
      item: {
        percentage_remaining: percentage,
        empty_at: percentage === 0 ? new Date().toISOString() : undefined,
      },
    });

    // Revalidate all cellar item pages and cached items list
    revalidatePath("/cellars/[cellarId]/beers/[itemId]", "page");
    revalidatePath("/cellars/[cellarId]/wines/[itemId]", "page");
    revalidatePath("/cellars/[cellarId]/spirits/[itemId]", "page");
    revalidatePath("/cellars/[cellarId]/coffees/[itemId]", "page");
    revalidatePath("/cellars/[cellarId]/sakes/[itemId]", "page");
    revalidateTag(CacheTags.cellarItems(cellarId), "default");

    return { success: true };
  } catch (error) {
    console.error("Failed to update cellar item:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to update cellar item",
    };
  }
}

export type AddCellarItemResult = {
  success: boolean;
  cellarItemId?: string;
  cellarId?: string;
  error?: string;
};

export async function addCellarItemAction(
  cellarId: string,
  itemId: string,
  itemType: ItemTypeValue,
): Promise<AddCellarItemResult> {
  const user = await getOptionalServerUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  // Build the item object based on type
  const item: {
    cellar_id: string;
    beer_id?: string;
    wine_id?: string;
    spirit_id?: string;
    coffee_id?: string;
    sake_id?: string;
  } = { cellar_id: cellarId };

  switch (itemType) {
    case "BEER":
      item.beer_id = itemId;
      break;
    case "WINE":
      item.wine_id = itemId;
      break;
    case "SPIRIT":
      item.spirit_id = itemId;
      break;
    case "COFFEE":
      item.coffee_id = itemId;
      break;
    case "SAKE":
      item.sake_id = itemId;
      break;
    default:
      return {
        success: false,
        error: `Unsupported item type: ${itemType}`,
      };
  }

  try {
    const result = await serverMutation(addCellarItemMutation, { item });

    // Revalidate cellar pages and cached items list
    revalidatePath(`/cellars/${cellarId}`, "page");
    revalidatePath("/cellars/[cellarId]", "page");
    revalidateTag(CacheTags.cellarItems(cellarId), "default");

    return {
      success: true,
      cellarItemId: result.insert_cellar_items_one?.id,
      cellarId: result.insert_cellar_items_one?.cellar_id,
    };
  } catch (error) {
    console.error("Failed to add cellar item:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to add cellar item",
    };
  }
}

export type DeleteCellarItemResult = {
  success: boolean;
  error?: string;
};

export async function deleteCellarItemAction(
  itemId: string,
  cellarId: string,
): Promise<DeleteCellarItemResult> {
  const user = await getOptionalServerUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    await serverMutation(deleteCellarItemMutation, { itemId });

    // Revalidate cellar pages and cached items list
    revalidatePath(`/cellars/${cellarId}`, "page");
    revalidatePath("/cellars/[cellarId]", "page");
    revalidatePath("/cellars/[cellarId]/items", "page");
    revalidateTag(CacheTags.cellarItems(cellarId), "default");

    return { success: true };
  } catch (error) {
    console.error("Failed to delete cellar item:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to delete cellar item",
    };
  }
}
