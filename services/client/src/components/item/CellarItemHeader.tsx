"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useMutation } from "urql";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { AddToTierListButton } from "@/components/tier-list/AddToTierListButton";
import type { TierListEntityType } from "@/components/tier-list/constants";
import { Button } from "@/components/ui/button";
import { RemoveItemFromCellarMutation } from "@/lib/api/cellars";
import { unwrapResult } from "@/lib/api/result";
import { formatItemType } from "@/utilities";
import { FinishBottleDialogs } from "./FinishBottleDialogs";
import { deleteBottleWarning } from "./finish-bottle";
import { ItemAppBar } from "./ItemAppBar";
import { LoadingButton } from "./LoadingButton";
import { useFinishBottle } from "./useFinishBottle";

type CellarItemHeaderProps = {
  /** The bottle (`cellar_items.id`). */
  itemId: string;
  /** The underlying catalog item id (wine/beer/…), used for tier lists. */
  entityId: string;
  itemName: string | undefined;
  itemType: ApiItemType;
  cellarId: string;
  cellarName: string | undefined;
  isOwner: boolean;
  /** The edit page, for the item's creator; `null` leaves "Edit item" out. */
  editHref: string | null;
  /** Every check-in on this bottle — the ones a delete takes with it. */
  checkInCount: number;
  /** The bottle's state, for "Mark finished instead" and its Undo (N13a). */
  bottle: {
    openAt: string | null;
    emptyAt: string | null;
    percentageRemaining: number;
  };
};

/**
 * `82450ad1:src/components/item/CellarItemHeader.tsx`, restored.
 *
 * `deleteCellarItemAction` → `removeItemFromCellar` (which also removes the
 * bottle's check-ins — `check_ins` is `ON DELETE RESTRICT`), then the old
 * `router.replace` to the cellar's items. A refusal is shown in the dialog
 * rather than leaving the spinner to stop silently. "Add to Tier List" is the
 * tier-lists wave's restored button, keyed on the catalog item.
 *
 * The header is `ItemAppBar` (N26, D7): Back to the cellar, the old crumbs
 * from `md` up, Share, and `⋯` with "Edit item" (the item's creator) and
 * "Delete item" last (the cellar's owner). The Joy header showed both as
 * buttons, disabled for anyone they did not apply to; the overflow leaves
 * them out instead. Delete opens the sheet below — a bottom sheet on phones.
 *
 * N13a: the dialog says how many check-ins the delete takes with it and, for
 * a bottle still in the cellar, offers "Mark finished instead" — which keeps
 * them and comes with the same Undo as finishing from the slider.
 */
export const CellarItemHeader = ({
  itemType,
  itemId,
  entityId,
  itemName,
  cellarId,
  cellarName,
  isOwner,
  editHref,
  checkInCount,
  bottle,
}: CellarItemHeaderProps) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [hasDeleted, setHasDeleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, removeItem] = useMutation(RemoveItemFromCellarMutation);
  const finish = useFinishBottle({ cellarId, cellarItemId: itemId });
  const isFinishing = finish.state.phase === "finishing";

  const isDisabled = isPending || hasDeleted || isFinishing;
  const warning = deleteBottleWarning({
    itemName,
    checkInCount,
    isFinished: bottle.emptyAt !== null,
  });

  const handleFinishInstead = () => {
    setError(null);
    finish.finishNow({
      percentageRemaining: bottle.percentageRemaining,
      openAt: bottle.openAt,
    });
  };

  // The dialog closes once the bottle is finished; a refusal stays in it.
  const finishPhase = finish.state.phase;
  const finishError = finish.state.phase === "idle" ? finish.state.error : null;
  const shownError = error ?? finishError;
  useEffect(() => {
    if (finishPhase === "finished") setOpen(false);
  }, [finishPhase]);

  const handleDeleteClick = () => {
    startTransition(async () => {
      setError(null);
      const response = await removeItem({ cellarId, cellarItemId: itemId });
      const result = unwrapResult(
        response.data?.removeItemFromCellar,
        "RemovedCellarItem",
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setHasDeleted(true);
      router.replace(`/cellars/${cellarId}/items`);
    });
  };

  return (
    <>
      <div className="flex flex-col gap-3">
        <ItemAppBar
          parent={`/cellars/${cellarId}/items`}
          cellarName={cellarName}
          itemName={itemName}
          share={{ itemId: entityId, itemType }}
          editHref={editHref}
          onDelete={isOwner ? () => setOpen(true) : undefined}
        />
        <div className="flex flex-wrap items-start gap-2">
          <AddToTierListButton
            entityId={entityId}
            entityType={itemType.toLowerCase() as TierListEntityType}
            entityName={itemName ?? "this item"}
          />
        </div>
      </div>
      <ResponsiveDialog
        role="alertdialog"
        open={open}
        onOpenChange={(next) => {
          if (!isDisabled) setOpen(next);
        }}
        dismissible={!isDisabled}
        title="Delete this bottle?"
        description={warning.body}
        footer={
          // Three buttons do not fit side by side at 390px: they stack. When
          // finishing is offered it is the emphasised, first action and Delete
          // the outlined one, so the visual weight points away from data loss.
          <div className="flex w-full flex-col gap-2 md:flex-row-reverse md:justify-start">
            {warning.suggestFinish && (
              <LoadingButton
                disabled={isDisabled}
                loading={isFinishing}
                onClick={handleFinishInstead}
              >
                Mark finished instead
              </LoadingButton>
            )}
            {warning.suggestFinish ? (
              <LoadingButton
                variant="destructive"
                disabled={isDisabled}
                loading={isPending}
                onClick={handleDeleteClick}
              >
                Delete {formatItemType(itemType)}
              </LoadingButton>
            ) : (
              // Nothing safer to offer: the solid danger confirm (design §3.1
              // allows it only in a confirm sheet, which this is).
              <LoadingButton
                data-tone="danger"
                disabled={isDisabled}
                loading={isPending}
                onClick={handleDeleteClick}
                className="bg-destructive text-background hover:bg-destructive/90 focus-visible:ring-destructive/40"
              >
                Delete {formatItemType(itemType)}
              </LoadingButton>
            )}
            <Button
              variant="ghost"
              disabled={isDisabled}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        }
      >
        {shownError !== null && (
          <p role="alert" className="type-callout text-destructive">
            {shownError}
          </p>
        )}
      </ResponsiveDialog>
      <FinishBottleDialogs finish={finish} itemName={itemName} />
    </>
  );
};
