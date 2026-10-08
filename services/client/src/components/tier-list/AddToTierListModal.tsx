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
import { BAND_LABELS, type TierListEntityType } from "./constants";
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
  const { addItemToTierListAction, addTierListAction } = useTierListActions();
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
  const entityEntries = isPlace
    ? (() => {
        const place = unwrapResult(placeData?.place, "Place");
        return place.ok ? place.data.tierListEntries.edges : [];
      })()
    : (() => {
        const item = unwrapResult(itemData?.item, "QueryItemSuccess");
        return item.ok ? item.data.data.tierListEntries.edges : [];
      })();

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

  const handleAddToList = useCallback(
    async (tierListId: string) => {
      setAddingToListId(tierListId);
      try {
        const result = await addItemToTierListAction(
          tierListId,
          entityId,
          entityType,
          0,
          0,
        );
        if (result.success) {
          router.refresh();
          onClose();
        } else {
          fail(result.error ?? "Failed to add item to tier list");
        }
      } finally {
        setAddingToListId(null);
      }
    },
    [entityId, entityType, onClose, router, addItemToTierListAction],
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
      const added = await addItemToTierListAction(
        created.tierListId,
        entityId,
        entityType,
        0,
        0,
      );
      if (added.success) {
        router.refresh();
        onClose();
      } else {
        fail(added.error ?? "Failed to add item to tier list");
      }
    } finally {
      setCreating(false);
    }
  }, [
    newListName,
    entityId,
    entityType,
    onClose,
    router,
    addItemToTierListAction,
    addTierListAction,
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
      // Above the map's place drawer, which renders this modal from inside a
      // fixed Joy-era container at z-index 1100 (950 on desktop): at z-50 the
      // sheet opened underneath it. Drop this once that drawer is converted.
      className="z-[1300] md:max-w-[420px]"
    >
      <div className="flex flex-col gap-4 pb-1">
        {fetching ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : (
          <>
            {hasLists && (
              <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg bg-surface-1">
                {tierLists.map((tl) => {
                  const alreadyIn = tl.alreadyInBand !== null;
                  const isAdding = addingToListId === tl.id;
                  return (
                    <li key={tl.id}>
                      <button
                        type="button"
                        onClick={() => void handleAddToList(tl.id)}
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
