"use client";

import {
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Modal,
  ModalDialog,
  Stack,
  Typography,
} from "@mui/joy";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { MdDelete, MdWarning } from "react-icons/md";
import { useMutation } from "urql";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { HeaderBar } from "@/components/common/HeaderBar";
import { AddToTierListButton } from "@/components/tier-list/AddToTierListButton";
import type { TierListEntityType } from "@/components/tier-list/constants";
import { RemoveItemFromCellarMutation } from "@/lib/api/cellars";
import { unwrapResult } from "@/lib/api/result";
import { formatItemType } from "@/utilities";
import { EditItemButton } from "./EditItemButton";
import { FinishBottleDialogs } from "./FinishBottleDialogs";
import { deleteBottleWarning } from "./finish-bottle";
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
  /** The edit page, for the item's creator; `null` keeps the old disabled button. */
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
 * rather than leaving the spinner to stop silently. "Edit item" works now
 * (see `EditItemButton`). "Add to Tier List" is the tier-lists wave's
 * restored button, keyed on the catalog item.
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
      <HeaderBar
        serverBreadcrumbs={{
          cellarName,
          itemName,
        }}
        endComponent={
          <Stack spacing={2} direction="row">
            <AddToTierListButton
              entityId={entityId}
              entityType={itemType.toLowerCase() as TierListEntityType}
              entityName={itemName ?? "this item"}
            />
            <EditItemButton href={editHref ?? ""} enabled={editHref !== null} />
            <Button
              variant="outlined"
              color="danger"
              disabled={!isOwner}
              onClick={() => setOpen(true)}
              startDecorator={<MdDelete />}
            >
              Delete item
            </Button>
          </Stack>
        }
      />
      <Modal open={open} onClose={() => setOpen(false)}>
        <ModalDialog variant="outlined" role="alertdialog">
          <DialogTitle>
            <MdWarning />
            Delete this bottle?
          </DialogTitle>
          <Divider />
          <DialogContent>
            {warning.body}
            {shownError !== null && (
              <Typography level="body-sm" color="danger">
                {shownError}
              </Typography>
            )}
          </DialogContent>
          {/*
            Three buttons do not fit side by side at 390px: stack them. When
            finishing is offered it is the emphasised, first action and Delete
            the outlined one, so the visual weight points away from data loss.
          */}
          <DialogActions
            sx={{
              flexDirection: { xs: "column", sm: "row-reverse" },
              alignItems: { xs: "stretch", sm: "center" },
            }}
          >
            {warning.suggestFinish && (
              <Button
                variant="solid"
                color="primary"
                disabled={isDisabled}
                loading={isFinishing}
                onClick={handleFinishInstead}
              >
                Mark finished instead
              </Button>
            )}
            <Button
              variant={warning.suggestFinish ? "outlined" : "solid"}
              color="danger"
              disabled={isDisabled}
              loading={isPending}
              onClick={handleDeleteClick}
            >
              Delete {formatItemType(itemType)}
            </Button>
            <Button
              variant="plain"
              color="neutral"
              disabled={isDisabled}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </DialogActions>
        </ModalDialog>
      </Modal>
      <FinishBottleDialogs finish={finish} itemName={itemName} />
    </>
  );
};
