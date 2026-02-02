"use client";

import type { ItemTypeValue } from "@cellar-assistant/shared";
import {
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Modal,
  ModalDialog,
  Stack,
} from "@mui/joy";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MdDelete, MdEdit, MdWarning } from "react-icons/md";
import { deleteCellarItemAction } from "@/app/actions/cellarItems";
import { HeaderBar } from "@/components/common/HeaderBar";
import { formatItemType } from "@/utilities";
import { Link } from "../common/Link";

type CellarItemHeaderProps = {
  itemId: string;
  itemName: string | undefined;
  itemType: ItemTypeValue;
  cellarId: string;
  cellarName: string | undefined;
  isOwner: boolean;
  userId: string;
};

export const CellarItemHeader = ({
  itemType,
  itemId,
  itemName,
  cellarId,
  cellarName,
  isOwner,
}: CellarItemHeaderProps) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [hasDeleted, setHasDeleted] = useState(false);

  const isDisabled = isPending || hasDeleted;

  const handleDeleteClick = () => {
    startTransition(async () => {
      const result = await deleteCellarItemAction(itemId, cellarId);
      if (result.success) {
        setHasDeleted(true);
        router.replace(`/cellars/${cellarId}/items`);
      }
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
            <Button
              component={Link}
              href={`${itemId}/edit`}
              startDecorator={<MdEdit />}
              disabled
            >
              Edit item
            </Button>
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
