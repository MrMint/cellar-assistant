"use server";

import { graphql, type Permission_Type_Enum } from "@cellar-assistant/shared";
import type { TadaDocumentNode } from "gql.tada";
import { parse } from "graphql";
import { revalidatePath } from "next/cache";
import { serverMutation, serverQuery } from "@/lib/urql/server";
import { getOptionalServerUser } from "@/utilities/auth-server";

// =============================================================================
// Validation
// =============================================================================

const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;

const VALID_LIST_TYPES = [
  "place",
  "wine",
  "beer",
  "spirit",
  "coffee",
  "sake",
] as const;

type ListType = (typeof VALID_LIST_TYPES)[number];

const VALID_PRIVACY_VALUES: Permission_Type_Enum[] = [
  "PRIVATE" as Permission_Type_Enum,
  "FRIENDS" as Permission_Type_Enum,
  "PUBLIC" as Permission_Type_Enum,
];

function isValidListType(value: string): value is ListType {
  return (VALID_LIST_TYPES as readonly string[]).includes(value);
}

function isValidPrivacy(value: string): value is Permission_Type_Enum {
  return (VALID_PRIVACY_VALUES as string[]).includes(value);
}

function validateTierListInput(
  name: string,
  description: string | undefined,
  privacy: Permission_Type_Enum,
): string | null {
  const trimmedName = name.trim();
  if (trimmedName.length === 0) return "Name is required";
  if (trimmedName.length > MAX_NAME_LENGTH)
    return `Name must be ${MAX_NAME_LENGTH} characters or less`;
  if (description && description.length > MAX_DESCRIPTION_LENGTH)
    return `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`;
  if (!isValidPrivacy(privacy)) return "Invalid privacy setting";
  return null;
}

// =============================================================================
// Mutations
// =============================================================================

const addTierListMutation = graphql(`
  mutation AddTierList($tierList: tier_lists_insert_input!) {
    insert_tier_lists_one(object: $tierList) {
      id
    }
  }
`);

const editTierListMutation = graphql(`
  mutation EditTierList($id: uuid!, $tierList: tier_lists_set_input!) {
    update_tier_lists_by_pk(pk_columns: { id: $id }, _set: $tierList) {
      id
    }
  }
`);

const deleteTierListMutation = graphql(`
  mutation DeleteTierList($id: uuid!) {
    delete_tier_lists_by_pk(id: $id) {
      id
    }
  }
`);

const addItemToTierListMutation = graphql(`
  mutation AddItemToTierList($item: tier_list_items_insert_input!) {
    insert_tier_list_items_one(object: $item) {
      id
      band
      position
      type
    }
  }
`);

const removeItemFromTierListMutation = graphql(`
  mutation RemoveItemFromTierList($id: uuid!) {
    delete_tier_list_items_by_pk(id: $id) {
      id
    }
  }
`);

const updateItemPositionMutation = graphql(`
  mutation UpdateItemPosition($id: uuid!, $band: Int!, $position: Int!) {
    update_tier_list_items_by_pk(
      pk_columns: { id: $id }
      _set: { band: $band, position: $position }
    ) {
      id
      band
      position
    }
  }
`);

const getBandMaxPositionQuery = graphql(`
  query GetBandMaxPosition($tierListId: uuid!, $band: Int!) {
    tier_list_items_aggregate(
      where: { tier_list_id: { _eq: $tierListId }, band: { _eq: $band } }
    ) {
      aggregate {
        max {
          position
        }
      }
    }
  }
`);

type SetTierListEditingLockMutationResult = {
  update_tier_lists_by_pk: {
    id: string;
    is_editing_locked: boolean;
  } | null;
};

type SetTierListEditingLockMutationVariables = {
  id: string;
  isEditingLocked: boolean;
};

const setTierListEditingLockMutation = parse(`
  mutation SetTierListEditingLock($id: uuid!, $isEditingLocked: Boolean!) {
    update_tier_lists_by_pk(
      pk_columns: { id: $id }
      _set: { is_editing_locked: $isEditingLocked }
    ) {
      id
      is_editing_locked
    }
  }
`) as unknown as TadaDocumentNode<
  SetTierListEditingLockMutationResult,
  SetTierListEditingLockMutationVariables
>;

// =============================================================================
// Result Types
// =============================================================================

export type TierListResult = {
  success: boolean;
  tierListId?: string;
  error?: string;
};

export type TierListItemResult = {
  success: boolean;
  tierListItemId?: string;
  error?: string;
};

export type TierListEditingLockResult = {
  success: boolean;
  isEditingLocked?: boolean;
  error?: string;
};

// =============================================================================
// Server Actions
// =============================================================================

export async function addTierListAction(
  name: string,
  description: string | undefined,
  privacy: Permission_Type_Enum,
  listType: string,
): Promise<TierListResult> {
  const user = await getOptionalServerUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const validationError = validateTierListInput(name, description, privacy);
  if (validationError) return { success: false, error: validationError };

  if (!isValidListType(listType)) {
    return { success: false, error: "Invalid list type" };
  }

  try {
    const result = await serverMutation(addTierListMutation, {
      tierList: {
        name: name.trim(),
        description: description?.trim() || undefined,
        privacy,
        list_type: listType,
      },
    });

    revalidatePath("/tier-lists", "page");

    return {
      success: true,
      tierListId: result.insert_tier_lists_one?.id,
    };
  } catch (error) {
    console.error("Failed to add tier list:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add tier list",
    };
  }
}

export async function editTierListAction(
  id: string,
  name: string,
  description: string | undefined,
  privacy: Permission_Type_Enum,
): Promise<TierListResult> {
  const user = await getOptionalServerUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const validationError = validateTierListInput(name, description, privacy);
  if (validationError) return { success: false, error: validationError };

  try {
    const result = await serverMutation(editTierListMutation, {
      id,
      tierList: {
        name: name.trim(),
        description: description?.trim() || undefined,
        privacy,
      },
    });

    revalidatePath("/tier-lists", "page");
    revalidatePath(`/tier-lists/${id}`, "page");

    return {
      success: true,
      tierListId: result.update_tier_lists_by_pk?.id,
    };
  } catch (error) {
    console.error("Failed to edit tier list:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to edit tier list",
    };
  }
}

export async function deleteTierListAction(
  id: string,
): Promise<TierListResult> {
  const user = await getOptionalServerUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    await serverMutation(deleteTierListMutation, { id });

    revalidatePath("/tier-lists", "page");

    return { success: true };
  } catch (error) {
    console.error("Failed to delete tier list:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to delete tier list",
    };
  }
}

export async function setTierListEditingLockAction(
  id: string,
  isEditingLocked: boolean,
): Promise<TierListEditingLockResult> {
  const user = await getOptionalServerUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    const result = await serverMutation(setTierListEditingLockMutation, {
      id,
      isEditingLocked,
    });

    if (!result.update_tier_lists_by_pk) {
      return { success: false, error: "Tier list not found or not authorized" };
    }

    revalidatePath(`/tier-lists/${id}`, "page");

    return {
      success: true,
      isEditingLocked: result.update_tier_lists_by_pk.is_editing_locked,
    };
  } catch (error) {
    console.error("Failed to set tier list editing lock:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to update tier list editing lock",
    };
  }
}

export async function addItemToTierListAction(
  tierListId: string,
  entityId: string,
  entityType: string,
  band: number,
  position: number,
): Promise<TierListItemResult> {
  const user = await getOptionalServerUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  if (!isValidListType(entityType)) {
    return { success: false, error: `Unknown entity type: ${entityType}` };
  }
  if (!Number.isInteger(band) || band < 0 || band > 5) {
    return { success: false, error: "Invalid band" };
  }

  const entityFkField = `${entityType}_id` as const;

  try {
    const maxPositionData = await serverQuery(getBandMaxPositionQuery, {
      tierListId,
      band,
    });
    const nextPosition =
      (maxPositionData.tier_list_items_aggregate.aggregate?.max?.position ??
        -1) + 1;
    const resolvedPosition =
      Number.isInteger(position) && position > nextPosition
        ? position
        : nextPosition;

    const item = {
      tier_list_id: tierListId,
      band,
      position: resolvedPosition,
      place_id: undefined as string | undefined,
      wine_id: undefined as string | undefined,
      beer_id: undefined as string | undefined,
      spirit_id: undefined as string | undefined,
      coffee_id: undefined as string | undefined,
      sake_id: undefined as string | undefined,
      [entityFkField]: entityId,
    };

    const result = await serverMutation(addItemToTierListMutation, { item });

    revalidatePath(`/tier-lists/${tierListId}`, "page");

    return {
      success: true,
      tierListItemId: result.insert_tier_list_items_one?.id,
    };
  } catch (error) {
    console.error("Failed to add item to tier list:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to add item to tier list",
    };
  }
}

export async function removeItemFromTierListAction(
  tierListItemId: string,
  tierListId: string,
): Promise<TierListItemResult> {
  const user = await getOptionalServerUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  try {
    await serverMutation(removeItemFromTierListMutation, {
      id: tierListItemId,
    });

    revalidatePath(`/tier-lists/${tierListId}`, "page");

    return { success: true };
  } catch (error) {
    console.error("Failed to remove item from tier list:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to remove item from tier list",
    };
  }
}

/**
 * Batch-renumber items after a DnD reorder.
 * Accepts the full set of items whose band/position changed and updates them
 * concurrently. Positions are clean sequential integers (0, 1, 2…).
 * Uses Promise.allSettled to detect and report partial failures.
 * Revalidates the detail route so App Router back/forward navigation
 * does not restore stale pre-mutation payloads.
 */
export async function reorderBandAction(
  updates: Array<{ id: string; band: number; position: number }>,
  tierListId: string,
): Promise<TierListItemResult> {
  const user = await getOptionalServerUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }
  if (updates.length === 0) {
    return { success: true };
  }

  const normalizedUpdates = Array.from(
    new Map(updates.map((u) => [u.id, u])).values(),
  ).filter(
    (u) =>
      Number.isInteger(u.band) &&
      u.band >= 0 &&
      u.band <= 5 &&
      Number.isInteger(u.position) &&
      u.position >= 0,
  );

  if (normalizedUpdates.length === 0) {
    return { success: false, error: "No valid updates to apply" };
  }

  const results = await Promise.allSettled(
    normalizedUpdates.map((u) =>
      serverMutation(updateItemPositionMutation, {
        id: u.id,
        band: u.band,
        position: u.position,
      }),
    ),
  );

  const failures = results.filter(
    (r): r is PromiseRejectedResult => r.status === "rejected",
  );

  if (failures.length > 0) {
    console.error(
      `Failed to reorder ${failures.length}/${normalizedUpdates.length} items:`,
      failures.map((f) => f.reason),
    );
    return {
      success: false,
      error: `Failed to update ${failures.length} of ${normalizedUpdates.length} items`,
    };
  }

  const missing = results.filter(
    (r) =>
      r.status === "fulfilled" && r.value.update_tier_list_items_by_pk == null,
  );
  if (missing.length > 0) {
    console.error(
      `Reorder applied to ${normalizedUpdates.length - missing.length}/${normalizedUpdates.length} items; ${missing.length} rows were not updated`,
    );
    return {
      success: false,
      error: `Failed to update ${missing.length} of ${normalizedUpdates.length} items`,
    };
  }

  revalidatePath(`/tier-lists/${tierListId}`, "page");

  return { success: true };
}
