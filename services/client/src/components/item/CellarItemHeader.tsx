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
import { useState, useTransition } from "react";
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
}: CellarItemHeaderProps) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [hasDeleted, setHasDeleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, removeItem] = useMutation(RemoveItemFromCellarMutation);

  const isDisabled = isPending || hasDeleted;

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
            Confirmation
          </DialogTitle>
          <Divider />
          <DialogContent>
            Are you sure you want to delete {itemName} from your cellar?
            {error !== null && (
              <Typography level="body-sm" color="danger">
                {error}
              </Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button
              variant="solid"
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
    </>
  );
};
