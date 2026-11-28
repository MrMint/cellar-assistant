"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useClient, useMutation } from "urql";
import { Delete } from "@/components/app/icons";
import { notify } from "@/components/app/notify";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { useNavigate } from "@/components/app/useNavigate";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { typeWords } from "@/components/drink-log/type-words";
import { Button } from "@/components/ui/button";
import { RemoveItemFromCellarMutation } from "@/lib/api/cellars";
import { unwrapResult } from "@/lib/api/result";
import { type BottleRestoreRow, restoreBottleVariables } from "./adapter";
import { FinishBottleDialogs } from "./FinishBottleDialogs";
import { deleteBottleWarning } from "./finish-bottle";
import { BottleForRestoreQuery, RestoreCellarItemMutation } from "./fragments";
import { bottleStateLine } from "./item-page-model";
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
 *
 * F-145: the toast's Undo is `restoreCellarItem` (F-79) — the same bottle
 * back under its own id and `createdAt`, from a read of the whole row taken
 * just before the delete. When that read fails there is no Undo, rather
 * than one that would put back a different bottle.
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
  const [, restoreItem] = useMutation(RestoreCellarItemMutation);
  const client = useClient();
  const router = useRouter();
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
      const restore = await readForRestore();
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
      // F-153: the board's toast. The app's one Toaster outlives the page,
      // so it shows on the cellar the delete lands on.
      if (restore === null) {
        notify("Bottle deleted");
        return;
      }
      notify("Bottle deleted", {
        undo: () => {
          void restoreItem(restore).then((answer) => {
            const restored = unwrapResult(
              answer.data?.restoreCellarItem,
              "CellarItem",
            );
            if (restored.ok) {
              notify("Bottle back");
              router.refresh();
            } else {
              notify(restored.error.message, { tone: "error" });
            }
          });
        },
      });
    });
  };

  /** The whole bottle, for its Undo; null when it cannot be read. */
  const readForRestore = async () => {
    try {
      const read = await client
        .query(
          BottleForRestoreQuery,
          { cellarId, bottleId },
          { requestPolicy: "network-only" },
        )
        .toPromise();
      const cellar = unwrapResult(read.data?.cellar, "Cellar");
      return cellar.ok
        ? restoreBottleVariables(
            cellar.data.item as BottleRestoreRow | null | undefined,
          )
        : null;
    } catch {
      return null;
    }
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
        title={`Delete this ${itemName === undefined || itemName === "" ? typeWords(itemType).container : itemName}?`}
        description={bottleStateLine(bottle)}
        footer={
          // Cellars-Bottles 22: the gentler way out first (ruling 4), then
          // Keep it beside the outlined danger Delete with its trash glyph
          // (CROSS-LOT "Delete confirm"). Destructive is never primary.
          <div className="flex w-full flex-col gap-2">
            {warning.suggestFinish && (
              <LoadingButton
                variant="outline"
                disabled={isDisabled}
                loading={isFinishing}
                onClick={handleFinishInstead}
              >
                Mark finished
              </LoadingButton>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                disabled={isDisabled}
                onClick={() => onOpenChange(false)}
              >
                Keep it
              </Button>
              <LoadingButton
                variant="destructive"
                data-tone="danger"
                disabled={isDisabled}
                loading={isPending}
                onClick={handleDelete}
              >
                <Delete aria-hidden />
                Delete
              </LoadingButton>
            </div>
          </div>
        }
      >
        <p className="t-body text-ink-2">Your logs stay.</p>
        {shownError !== null && (
          <p role="alert" className="t-body text-destructive">
            {shownError}
          </p>
        )}
      </ResponsiveDialog>
      <FinishBottleDialogs finish={finish} itemName={itemName} />
    </>
  );
}
