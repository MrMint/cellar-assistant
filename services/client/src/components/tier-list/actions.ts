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
 * - The editing lock is gone from the page (X23/D4: "Arrange" replaces the
 *   padlock), so `setTierListEditingLockAction` went with it, and X16 retired
 *   the flag from the API too (the column waits for a contract migration).
 * - New (D4): `undoAction` / `redoAction`, one step of the list's server-side
 *   edit history each, answering what they did and where the history stands.
 *
 * The old input validation is kept as-is: it is the same message the user saw.
 */

import { useCallback, useMemo } from "react";
import { useMutation } from "urql";
import { unwrapResult } from "@/lib/api/result";
import { addEntryFailureMessage, entryTypeOf } from "./adapter";
import type { TierListEntityType } from "./constants";
import {
  addedEditSeq,
  addedEntriesEditSeq,
  historyStepFailure,
  type TierListEditView,
  type TierListHistoryView,
} from "./history";
import {
  AddItemsToTierListMutation,
  AddItemToTierListMutation,
  AddTierListMutation,
  DeleteTierListMutation,
  EditTierListMutation,
  RedoTierListEditMutation,
  RemoveItemFromTierListMutation,
  ReorderBandMutation,
  UndoTierListEditMutation,
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
  /**
   * The add's own edit, for its toast's Undo (`expectedSeq`); null when the
   * list's history no longer has it on top (`addedEditSeq`).
   */
  editSeq?: number | null;
  error?: string;
};

/** X16's multi-add: how many went on, and how many the server passed over. */
export type TierListItemsResult =
  | {
      success: true;
      added: number;
      skipped: number;
      /**
       * The multi-add's own edit, for its toast's Undo (`expectedSeq`); null
       * when the list's history no longer has it on top
       * (`addedEntriesEditSeq`).
       */
      editSeq: number | null;
    }
  | { success: false; error: string };

/** One entry of a multi-add: what it is, and the band it lands in. */
export type TierListPick = {
  id: string;
  entityType: string;
  band: number;
};

/** X16: how a new list starts — empty, or from your ratings. */
export type TierListStart = "EMPTY" | "RATINGS";

/** One Undo or Redo: what it did, and where the history stands after it. */
export type TierListHistoryStepResult =
  | {
      success: true;
      applied: TierListEditView;
      history: TierListHistoryView;
    }
  | {
      success: false;
      error: string;
      /**
       * The refusal was `TIER_LIST_HISTORY_MOVED`: the list changed elsewhere
       * and nothing was stepped. A caller that does not show the list (the
       * item page's add toast) words that itself.
       */
      moved?: boolean;
    };

const transportError = (error: { message: string } | undefined) =>
  error === undefined ? null : error.message;

export function useTierListActions() {
  const [, addTierList] = useMutation(AddTierListMutation);
  const [, editTierList] = useMutation(EditTierListMutation);
  const [, deleteTierList] = useMutation(DeleteTierListMutation);
  const [, addItem] = useMutation(AddItemToTierListMutation);
  const [, addItems] = useMutation(AddItemsToTierListMutation);
  const [, removeItem] = useMutation(RemoveItemFromTierListMutation);
  const [, reorderBand] = useMutation(ReorderBandMutation);
  const [, undoEdit] = useMutation(UndoTierListEditMutation);
  const [, redoEdit] = useMutation(RedoTierListEditMutation);

  const addTierListAction = useCallback(
    async (
      name: string,
      description: string | undefined,
      privacy: Permission_Type_Enum,
      listType: string,
      startFrom: TierListStart = "EMPTY",
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
          startFrom,
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

  const addItemToTierListAction = useCallback(
    async (
      tierListId: string,
      entityId: string,
      entityType: string,
      band: number,
      /** M7: insert at this index of `band` (pairwise placement); else append. */
      position?: number,
    ): Promise<TierListItemResult> => {
      if (!isValidListType(entityType)) {
        return { success: false, error: `Unknown entity type: ${entityType}` };
      }
      if (!Number.isInteger(band) || band < 0 || band > 5) {
        return { success: false, error: "Invalid band" };
      }
      if (
        position !== undefined &&
        (!Number.isInteger(position) || position < 0)
      ) {
        return { success: false, error: "Invalid position" };
      }
      const response = await addItem({
        tierListId,
        input: {
          tierListItemId: crypto.randomUUID(),
          entry: { id: entityId, type: entryTypeOf(entityType) },
          band,
          ...(position === undefined ? {} : { position }),
        },
      });
      const failed = transportError(response.error);
      if (failed !== null) return { success: false, error: failed };
      const result = unwrapResult(
        response.data?.addTierListItem ?? undefined,
        "TierListItem",
      );
      return result.ok
        ? {
            success: true,
            tierListItemId: result.data.id,
            editSeq: addedEditSeq(
              result.data.tierList?.editHistory?.undo,
              entityId,
            ),
          }
        : { success: false, error: addEntryFailureMessage(result.error) };
    },
    [addItem],
  );

  /**
   * X16: several entries as one edit (one Undo takes them all back). Each
   * row id is minted here, so a retried request adds nothing twice.
   */
  const addItemsToTierListAction = useCallback(
    async (
      tierListId: string,
      picks: readonly TierListPick[],
    ): Promise<TierListItemsResult> => {
      if (picks.length === 0) {
        return { success: false, error: "Pick something to add." };
      }
      for (const pick of picks) {
        if (!isValidListType(pick.entityType)) {
          return {
            success: false,
            error: "That isn't something a list ranks.",
          };
        }
        if (!Number.isInteger(pick.band) || pick.band < 0 || pick.band > 5) {
          return { success: false, error: "Invalid band" };
        }
      }
      const response = await addItems({
        tierListId,
        input: {
          entries: picks.map((pick) => ({
            tierListItemId: crypto.randomUUID(),
            entry: {
              id: pick.id,
              type: entryTypeOf(pick.entityType as TierListEntityType),
            },
            band: pick.band,
          })),
        },
      });
      const failed = transportError(response.error);
      if (failed !== null) return { success: false, error: failed };
      const result = unwrapResult(
        response.data?.addTierListItems ?? undefined,
        "AddTierListItemsPayload",
      );
      if (!result.ok) {
        return { success: false, error: addEntryFailureMessage(result.error) };
      }
      const added =
        result.data.added.totalCount ?? result.data.added.edges.length;
      return {
        success: true,
        added,
        skipped: result.data.skippedCount,
        editSeq: addedEntriesEditSeq(
          result.data.latest.edges[0]?.node.tierList?.editHistory?.undo,
          picks.map((pick) => pick.id),
          added,
        ),
      };
    },
    [addItems],
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

  const historyStep = useCallback(
    async (
      direction: "undo" | "redo",
      tierListId: string,
      expectedSeq: number,
    ): Promise<TierListHistoryStepResult> => {
      const response =
        direction === "undo"
          ? await undoEdit({ tierListId, expectedSeq })
          : await redoEdit({ tierListId, expectedSeq });
      const failed = transportError(response.error);
      if (failed !== null) return { success: false, error: failed };
      const payload =
        response.data === undefined
          ? undefined
          : "undoTierListEdit" in response.data
            ? response.data.undoTierListEdit
            : response.data.redoTierListEdit;
      const result = unwrapResult(payload ?? undefined, "TierListHistoryStep");
      if (!result.ok) {
        return {
          success: false,
          // The one refusal a person can meet is the race of two tabs: the
          // other one already stepped, or edited. The actor's own words are
          // a log line.
          error: historyStepFailure(direction, result.error),
          moved: result.error.reason === "TIER_LIST_HISTORY_MOVED",
        };
      }
      return {
        success: true,
        applied: result.data.applied,
        history: result.data.history,
      };
    },
    [undoEdit, redoEdit],
  );

  const undoAction = useCallback(
    (tierListId: string, expectedSeq: number) =>
      historyStep("undo", tierListId, expectedSeq),
    [historyStep],
  );
  const redoAction = useCallback(
    (tierListId: string, expectedSeq: number) =>
      historyStep("redo", tierListId, expectedSeq),
    [historyStep],
  );

  return useMemo(
    () => ({
      addTierListAction,
      editTierListAction,
      deleteTierListAction,
      addItemToTierListAction,
      addItemsToTierListAction,
      removeItemFromTierListAction,
      reorderBandAction,
      undoAction,
      redoAction,
    }),
    [
      addTierListAction,
      editTierListAction,
      deleteTierListAction,
      addItemToTierListAction,
      addItemsToTierListAction,
      removeItemFromTierListAction,
      reorderBandAction,
      undoAction,
      redoAction,
    ],
  );
}
