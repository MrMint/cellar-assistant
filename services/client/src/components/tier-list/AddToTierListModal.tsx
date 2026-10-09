"use client";

/**
 * `82450ad1:src/components/tier-list/AddToTierListModal.tsx`, restored: the
 * viewer's own lists of the entity's type, "Already added (band)" rows
 * disabled, "Create new list" → "Create & add" with the old default name.
 *
 * Data: `GetTierListsForItem` (a Hasura filter on `list_type` and
 * `created_by_id` with seven nil-uuid `_or` arms) → every page of the
 * viewer's visible lists (`useAllMyTierLists`) narrowed client-side
 * (`tierListOptionsFor`) plus the entity's own `tierListEntries` (G8) for
 * membership. The walk is what keeps the viewer's own lists on offer when
 * they can see more than 100 (G33, a server-side filter, is not built).
 *
 * On the app's primitives (D20): a `ResponsiveDialog` (a bottom sheet on a
 * phone), the lists as full-width row buttons, and a failure as a `notify`
 * error toast in place of the Snackbar.
 *
 * X23: the entry lands in the band **your rating** gives it (`bandForScore`
 * — your review of the item, your rating of the place), Unrated without one,
 * and the sheet says so before you pick. The add's toast offers Undo, one
 * step of that list's edit history (D4).
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "urql";
import { Add, Check, ICON_STROKE, Ranked } from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";
import { useTierListActions } from "./actions";
import { entryTypeOf, tierListOptionsFor } from "./adapter";
import { BAND_LABELS, BAND_TONES, type TierListEntityType } from "./constants";
import { bandForScore } from "./history";
import {
  ENTITY_ENTRIES_PAGE_SIZE,
  GetTierListsForItemQuery,
  GetTierListsForPlaceQuery,
  TIER_LISTS_PAGE_SIZE,
} from "./queries";
import { useAllMyTierLists } from "./useAllMyTierLists";

// =============================================================================
// Helpers
// =============================================================================

const ENTITY_TYPE_LABELS: Record<TierListEntityType, string> = {
  place: "Place",
  wine: "Wine",
  beer: "Beer",
  spirit: "Spirit",
  coffee: "Coffee",
  sake: "Sake",
  tea: "Tea",
};

// =============================================================================
// Types
// =============================================================================

interface AddToTierListModalProps {
  open: boolean;
  onClose: () => void;
  entityId: string;
  entityType: TierListEntityType;
  entityName: string;
  /** The old query's `$userId`; unused — the API knows the viewer. */
  userId?: string;
}

// =============================================================================
// Main Modal
// =============================================================================

export function AddToTierListModal({
  open,
  onClose,
  entityId,
  entityType,
  entityName,
}: AddToTierListModalProps) {
  const router = useRouter();
  const { addItemToTierListAction, addTierListAction, undoAction } =
    useTierListActions();
  const isPlace = entityType === "place";
  const itemType = entryTypeOf(entityType);

  // network-only: an add elsewhere must show as "Already added" on reopen.
  const [{ data: itemData, fetching: itemFetching }] = useQuery({
    query: GetTierListsForItemQuery,
    variables: {
      itemId: entityId,
      itemType: itemType === "PLACE" ? "WINE" : itemType,
      first: ENTITY_ENTRIES_PAGE_SIZE,
    },
    pause: !open || isPlace,
    requestPolicy: "network-only",
  });
  const [{ data: placeData, fetching: placeFetching }] = useQuery({
    query: GetTierListsForPlaceQuery,
    variables: { placeId: entityId, first: TIER_LISTS_PAGE_SIZE },
    pause: !open || !isPlace,
    requestPolicy: "network-only",
  });
  // network-only for the same reason: a list created elsewhere must show.
  const {
    lists,
    viewerId,
    loading: listsLoading,
  } = useAllMyTierLists({ active: open, fresh: true });
  const fetching = (isPlace ? placeFetching : itemFetching) || listsLoading;
  const entity = isPlace
    ? (() => {
        const place = unwrapResult(placeData?.place, "Place");
        return place.ok
          ? {
              entries: place.data.tierListEntries.edges,
              myScore: place.data.myInteraction?.rating ?? null,
            }
          : { entries: [], myScore: null };
      })()
    : (() => {
        const item = unwrapResult(itemData?.item, "QueryItemSuccess");
        return item.ok
          ? {
              entries: item.data.data.tierListEntries.edges,
              myScore: item.data.data.myReview?.score ?? null,
            }
          : { entries: [], myScore: null };
      })();
  const entityEntries = entity.entries;
  /** X23: where a new entry lands — your verdict's band. */
  const band = bandForScore(entity.myScore);

  const [addingToListId, setAddingToListId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creating, setCreating] = useState(false);

  const tierLists = tierListOptionsFor(
    lists,
    entityEntries.map((edge) => edge.node),
    viewerId,
    entityType,
  );
  const busy = addingToListId != null || creating;

  // Reset the create form whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setShowCreate(false);
    setNewListName(`My ${ENTITY_TYPE_LABELS[entityType]} Tier List`);
  }, [open, entityType]);

  /**
   * The add's toast: where it went, and an Undo that takes back exactly that
   * add (`editSeq`, read back with it) — or no Undo at all when the add's
   * edit could not be named, rather than one that might take back another
   * device's newer edit.
   */
  const added = useCallback(
    (tierListId: string, listName: string, editSeq: number | null) => {
      const message = `Added to ${listName} · ${BAND_LABELS[band]}`;
      if (editSeq === null) {
        notify(message);
        return;
      }
      notify(message, {
        undo: () => {
          void undoAction(tierListId, editSeq).then((result) => {
            if (result.success) {
              notify(`Took ${entityName} off ${listName}`);
              router.refresh();
            } else {
              fail(result.error);
            }
          });
        },
      });
    },
    [band, entityName, router, undoAction],
  );

  const handleAddToList = useCallback(
    async (tierListId: string, listName: string) => {
      setAddingToListId(tierListId);
      try {
        const result = await addItemToTierListAction(
          tierListId,
          entityId,
          entityType,
          band,
        );
        if (result.success) {
          router.refresh();
          onClose();
          added(tierListId, listName, result.editSeq ?? null);
        } else {
          fail(result.error ?? "Failed to add item to tier list");
        }
      } finally {
        setAddingToListId(null);
      }
    },
    [
      entityId,
      entityType,
      band,
      onClose,
      router,
      addItemToTierListAction,
      added,
    ],
  );

  const handleCreateAndAdd = useCallback(async () => {
    const name = newListName.trim();
    if (name.length === 0) {
      fail("Please enter a name for the new list");
      return;
    }
    setCreating(true);
    try {
      const created = await addTierListAction(
        name,
        undefined,
        "PRIVATE",
        entityType,
      );
      if (!created.success || !created.tierListId) {
        fail(created.error ?? "Failed to create tier list");
        return;
      }
      const result = await addItemToTierListAction(
        created.tierListId,
        entityId,
        entityType,
        band,
      );
      if (result.success) {
        router.refresh();
        onClose();
        added(created.tierListId, name, result.editSeq ?? null);
      } else {
        fail(result.error ?? "Failed to add item to tier list");
      }
    } finally {
      setCreating(false);
    }
  }, [
    newListName,
    entityId,
    entityType,
    band,
    onClose,
    router,
    addItemToTierListAction,
    addTierListAction,
    added,
  ]);

  const hasLists = tierLists.length > 0;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Add to Tier List"
      description={
        <>
          Add <strong>{entityName}</strong> to a tier list
        </>
      }
      className="md:max-w-[420px]"
    >
      <div className="flex flex-col gap-4 pb-1">
        {fetching ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-ink-2 type-footnote">
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  (BAND_TONES[band] ?? BAND_TONES[0]).swatch,
                )}
              />
              {entity.myScore === null
                ? "Lands in Unrated — rate it to place it."
                : `Lands in ${BAND_LABELS[band]}, from your rating.`}
            </p>
            {hasLists && (
              <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg bg-surface-1">
                {tierLists.map((tl) => {
                  const alreadyIn = tl.alreadyInBand !== null;
                  const isAdding = addingToListId === tl.id;
                  return (
                    <li key={tl.id}>
                      <button
                        type="button"
                        onClick={() => void handleAddToList(tl.id, tl.name)}
                        disabled={alreadyIn || busy}
                        className={cn(
                          "flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors duration-(--ca-dur-micro) ease-standard focus-visible:ring-[3px] focus-visible:ring-ring/50 enabled:hover:bg-surface-2 enabled:active:bg-surface-3",
                          alreadyIn && "bg-success/10",
                          busy && !alreadyIn && "opacity-60",
                        )}
                      >
                        <span className="flex size-5 shrink-0 items-center justify-center text-ink-2">
                          {isAdding ? (
                            <Spinner aria-hidden />
                          ) : alreadyIn ? (
                            <Check
                              aria-hidden
                              strokeWidth={ICON_STROKE}
                              className="size-5 text-success"
                            />
                          ) : (
                            <Ranked
                              aria-hidden
                              strokeWidth={ICON_STROKE}
                              className="size-5"
                            />
                          )}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-semibold text-ink-1 type-callout">
                            {tl.name}
                          </span>
                          {alreadyIn && (
                            <span className="text-success type-footnote">
                              Already added (
                              {BAND_LABELS[tl.alreadyInBand ?? 0]})
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {!hasLists && !showCreate && (
              <p className="text-center text-ink-3 type-callout">
                You don't have any{" "}
                {ENTITY_TYPE_LABELS[entityType].toLowerCase()} tier lists yet.
              </p>
            )}

            {showCreate ? (
              <div className="flex flex-col gap-2">
                <Input
                  autoFocus
                  aria-label="List name"
                  placeholder="List name"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !busy) {
                      void handleCreateAndAdd();
                    }
                  }}
                  disabled={busy}
                />
                <div className="flex gap-2">
                  <Button
                    disabled={busy}
                    onClick={() => void handleCreateAndAdd()}
                  >
                    {creating ? (
                      <Spinner aria-hidden />
                    ) : (
                      <Add aria-hidden strokeWidth={ICON_STROKE} />
                    )}
                    Create &amp; add
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setShowCreate(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setShowCreate(true)}
              >
                <Add aria-hidden strokeWidth={ICON_STROKE} />
                Create new list
              </Button>
            )}
          </>
        )}
      </div>
    </ResponsiveDialog>
  );
}

/** A failure, said as a toast (the old Snackbar's job). */
function fail(message: string) {
  notify(message, { tone: "error" });
}
