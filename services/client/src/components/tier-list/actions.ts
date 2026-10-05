"use client";

/**
 * The old `82450ad1:src/app/actions/tierLists.ts` server actions, as one
 * client hook with the same names, arguments and `{ success, …, error }`
 * results — so the restored components call them unchanged and follow each
 * success with `router.refresh()`, as before (the pages are server components
 * that read the list on every request).
 *
 * Substitutions:
 *
 * - Hasura `insert_/update_/delete_*_by_pk` → the named commands in
 *   `queries.ts`, each a result union; a typed error's `message` is the
 *   `error`. `getOptionalServerUser` goes: the API answers `ForbiddenError`
 *   for a signed-out caller itself.
 * - `addItemToTierListAction`'s max-position read then insert (a race) → one
 *   `addTierListItem`, which appends at the end of the band server-side, with
 *   a client-minted `tierListItemId` so a retry is idempotent. The `position`
 *   argument is kept for the old call sites and ignored, as it effectively
 *   was (the old code only honoured a position past the end).
 * - `reorderBandAction(updates)` (a per-row diff, applied non-atomically with
 *   `allSettled`) → `reorderBandAction({ band, orderedIds })`: one band's full
 *   order in one transaction (`reorderCallFor` in `adapter.ts`).
 * - `setTierListEditingLockAction` → `updateTierList({ isEditingLocked })`.
 *
 * The old input validation is kept as-is: it is the same message the user saw.
 */

import { useCallback, useMemo } from "react";
import { useMutation } from "urql";
import { unwrapResult } from "@/lib/api/result";
import { entryTypeOf } from "./adapter";
import type { TierListEntityType } from "./constants";
import {
  AddItemToTierListMutation,
  AddTierListMutation,
  DeleteTierListMutation,
  EditTierListMutation,
  RemoveItemFromTierListMutation,
  ReorderBandMutation,
} from "./queries";

/** SDL `PermissionType` — the old `Permission_Type_Enum`. */
export type Permission_Type_Enum = "FRIENDS" | "PRIVATE" | "PUBLIC";

const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;

export const VALID_LIST_TYPES = [
  "place",
  "wine",
  "beer",
  "spirit",
  "coffee",
  "sake",
  "tea",
] as const;

const VALID_PRIVACY_VALUES: readonly string[] = [
  "PRIVATE",
  "FRIENDS",
  "PUBLIC",
];

export function isValidListType(value: string): value is TierListEntityType {
  return (VALID_LIST_TYPES as readonly string[]).includes(value);
}

export function validateTierListInput(
  name: string,
  description: string | undefined,
  privacy: string,
): string | null {
  const trimmedName = name.trim();
  if (trimmedName.length === 0) return "Name is required";
  if (trimmedName.length > MAX_NAME_LENGTH)
    return `Name must be ${MAX_NAME_LENGTH} characters or less`;
  if (description && description.length > MAX_DESCRIPTION_LENGTH)
    return `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`;
  if (!VALID_PRIVACY_VALUES.includes(privacy)) return "Invalid privacy setting";
  return null;
}

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

const transportError = (error: { message: string } | undefined) =>
  error === undefined ? null : error.message;

export function useTierListActions() {
  const [, addTierList] = useMutation(AddTierListMutation);
  const [, editTierList] = useMutation(EditTierListMutation);
  const [, deleteTierList] = useMutation(DeleteTierListMutation);
  const [, addItem] = useMutation(AddItemToTierListMutation);
  const [, removeItem] = useMutation(RemoveItemFromTierListMutation);
  const [, reorderBand] = useMutation(ReorderBandMutation);

  const addTierListAction = useCallback(
    async (
      name: string,
      description: string | undefined,
      privacy: Permission_Type_Enum,
      listType: string,
    ): Promise<TierListResult> => {
      const validationError = validateTierListInput(name, description, privacy);
      if (validationError) return { success: false, error: validationError };
      if (!isValidListType(listType)) {
        return { success: false, error: "Invalid list type" };
      }
      const response = await addTierList({
        input: {
          name: name.trim(),
          description: description?.trim() || undefined,
          privacy,
          listType,
        },
      });
      const failed = transportError(response.error);
      if (failed !== null) return { success: false, error: failed };
      const result = unwrapResult(
        response.data?.createTierList ?? undefined,
        "TierList",
      );
      return result.ok
        ? { success: true, tierListId: result.data.id }
        : { success: false, error: result.error.message };
    },
    [addTierList],
  );

  const editTierListAction = useCallback(
    async (
      id: string,
      name: string,
      description: string | undefined,
      privacy: Permission_Type_Enum,
    ): Promise<TierListResult> => {
      const validationError = validateTierListInput(name, description, privacy);
      if (validationError) return { success: false, error: validationError };
      const response = await editTierList({
        id,
        input: {
          name: name.trim(),
          // The old `_set` dropped an emptied description (`|| undefined`);
          // an empty string clears it here, which is what the field showed.
          description: description?.trim() ?? "",
          privacy,
        },
      });
      const failed = transportError(response.error);
      if (failed !== null) return { success: false, error: failed };
      const result = unwrapResult(
        response.data?.updateTierList ?? undefined,
        "TierList",
      );
      return result.ok
        ? { success: true, tierListId: result.data.id }
        : { success: false, error: result.error.message };
    },
    [editTierList],
  );

  const deleteTierListAction = useCallback(
    async (id: string): Promise<TierListResult> => {
      const response = await deleteTierList({ id });
      const failed = transportError(response.error);
      if (failed !== null) return { success: false, error: failed };
      const result = unwrapResult(
        response.data?.deleteTierList ?? undefined,
        "DeletedTierList",
      );
      return result.ok
        ? { success: true }
        : { success: false, error: result.error.message };
    },
    [deleteTierList],
  );

  const setTierListEditingLockAction = useCallback(
    async (
      id: string,
      isEditingLocked: boolean,
    ): Promise<TierListEditingLockResult> => {
      const response = await editTierList({ id, input: { isEditingLocked } });
      const failed = transportError(response.error);
      if (failed !== null) return { success: false, error: failed };
      const result = unwrapResult(
        response.data?.updateTierList ?? undefined,
        "TierList",
      );
      return result.ok
        ? { success: true, isEditingLocked: result.data.isEditingLocked }
        : { success: false, error: result.error.message };
    },
    [editTierList],
  );

  const addItemToTierListAction = useCallback(
    async (
      tierListId: string,
      entityId: string,
      entityType: string,
      band: number,
      _position?: number,
    ): Promise<TierListItemResult> => {
      if (!isValidListType(entityType)) {
        return { success: false, error: `Unknown entity type: ${entityType}` };
      }
      if (!Number.isInteger(band) || band < 0 || band > 5) {
        return { success: false, error: "Invalid band" };
      }
      const response = await addItem({
        tierListId,
        input: {
          tierListItemId: crypto.randomUUID(),
          entry: { id: entityId, type: entryTypeOf(entityType) },
          band,
        },
      });
      const failed = transportError(response.error);
      if (failed !== null) return { success: false, error: failed };
      const result = unwrapResult(
        response.data?.addTierListItem ?? undefined,
        "TierListItem",
      );
      return result.ok
        ? { success: true, tierListItemId: result.data.id }
        : { success: false, error: result.error.message };
    },
    [addItem],
  );

  const removeItemFromTierListAction = useCallback(
    async (
      tierListItemId: string,
      tierListId: string,
    ): Promise<TierListItemResult> => {
      const response = await removeItem({ tierListId, id: tierListItemId });
      const failed = transportError(response.error);
      if (failed !== null) return { success: false, error: failed };
      const result = unwrapResult(
        response.data?.removeTierListItem ?? undefined,
        "RemovedTierListItem",
      );
      return result.ok
        ? { success: true }
        : { success: false, error: result.error.message };
    },
    [removeItem],
  );

  const reorderBandAction = useCallback(
    async (
      call: { band: number; orderedIds: string[] },
      tierListId: string,
    ): Promise<TierListItemResult> => {
      const response = await reorderBand({ tierListId, ...call });
      const failed = transportError(response.error);
      if (failed !== null) return { success: false, error: failed };
      const result = unwrapResult(
        response.data?.reorderTierListBand ?? undefined,
        "ReorderBandPayload",
      );
      return result.ok
        ? { success: true }
        : { success: false, error: result.error.message };
    },
    [reorderBand],
  );

  return useMemo(
    () => ({
      addTierListAction,
      editTierListAction,
      deleteTierListAction,
      setTierListEditingLockAction,
      addItemToTierListAction,
      removeItemFromTierListAction,
      reorderBandAction,
    }),
    [
      addTierListAction,
      editTierListAction,
      deleteTierListAction,
      setTierListEditingLockAction,
      addItemToTierListAction,
      removeItemFromTierListAction,
      reorderBandAction,
    ],
  );
}
