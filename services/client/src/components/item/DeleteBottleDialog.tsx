"use client";

import { useEffect, useState, useTransition } from "react";
import { useMutation } from "urql";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { useNavigate } from "@/components/app/useNavigate";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { Button } from "@/components/ui/button";
import { RemoveItemFromCellarMutation } from "@/lib/api/cellars";
import { unwrapResult } from "@/lib/api/result";
import { formatItemType } from "@/utilities";
import { FinishBottleDialogs } from "./FinishBottleDialogs";
import { deleteBottleWarning } from "./finish-bottle";
import { LoadingButton } from "./LoadingButton";
import { useFinishBottle } from "./useFinishBottle";

export type DeleteBottleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemType: ApiItemType;
  itemName: string | undefined;
  cellarId: string;
  /** The bottle (`cellar_items.id`). */
  bottleId: string;
  bottle: {
    openAt: string | null;
    emptyAt: string | null;
    percentageRemaining: number;
  };
};

/**
 * "Delete bottle" behind the item page's `⋯` (X09; design §2: Delete last,
 * with a confirm behind it) — the old `CellarItemHeader`'s dialog, lifted
 * out when the bottle page became the item page with a bottle selected.
 *
 * `removeItemFromCellar`, then back to the cellar (the bottle's URL no
 * longer names anything). For a bottle still in the cellar it offers "Mark
 * finished instead" first (N13a), which is almost always what someone who
 * drank it meant, with the same Undo as finishing from the slider. A refusal
 * stays in the dialog rather than stopping a spinner silently.
 */
export function DeleteBottleDialog({
  open,
  onOpenChange,
  itemType,
  itemName,
  cellarId,
  bottleId,
  bottle,
}: DeleteBottleDialogProps) {
  const navigate = useNavigate();
  const [isPending, startTransition] = useTransition();
  const [hasDeleted, setHasDeleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, removeItem] = useMutation(RemoveItemFromCellarMutation);
  const finish = useFinishBottle({ cellarId, cellarItemId: bottleId });
  const isFinishing = finish.state.phase === "finishing";

  const isDisabled = isPending || hasDeleted || isFinishing;
  const warning = deleteBottleWarning({
    itemName,
    isFinished: bottle.emptyAt !== null,
  });

  // The dialog closes once the bottle is finished; a refusal stays in it.
  const finishPhase = finish.state.phase;
  const finishError = finish.state.phase === "idle" ? finish.state.error : null;
  const shownError = error ?? finishError;
  useEffect(() => {
    if (finishPhase === "finished") onOpenChange(false);
  }, [finishPhase, onOpenChange]);

  const handleFinishInstead = () => {
    setError(null);
    finish.finishNow({
      percentageRemaining: bottle.percentageRemaining,
      openAt: bottle.openAt,
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      setError(null);
      const response = await removeItem({ cellarId, cellarItemId: bottleId });
      const result = unwrapResult(
        response.data?.removeItemFromCellar,
        "RemovedCellarItem",
      );
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setHasDeleted(true);
      navigate.replace(`/cellars/${cellarId}/items`);
    });
  };

  return (
    <>
      <ResponsiveDialog
        role="alertdialog"
        open={open}
        onOpenChange={(next) => {
          if (!isDisabled) onOpenChange(next);
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
                onClick={handleDelete}
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
                onClick={handleDelete}
                className="bg-destructive text-background hover:bg-destructive/90 focus-visible:ring-destructive/40"
              >
                Delete {formatItemType(itemType)}
              </LoadingButton>
            )}
            <Button
              variant="ghost"
              disabled={isDisabled}
              onClick={() => onOpenChange(false)}
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
}
