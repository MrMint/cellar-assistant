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
import { useUserId } from "@nhost/nextjs";
import { graphql } from "@shared/gql";
import { ItemType } from "@shared/gql/graphql";
import { useRouter } from "next/navigation";
import { isNil, isNotNil } from "ramda";
import { useEffect, useState } from "react";
import { MdDelete, MdEdit, MdWarning } from "react-icons/md";
import { useMutation } from "urql";
import { HeaderBar } from "@/components/common/HeaderBar";
import { formatItemType } from "@/utilities";
import Link from "../common/Link";

type CellarItemHeaderProps = {
  itemId: string;
  itemName: string | undefined;
  itemType: ItemType;
  cellarId: string;
  cellarName: string | undefined;
  isOwner: boolean;
};

const deleteCellarItem = graphql(`
  mutation DeleteCellarItem($itemId: uuid!) {
    delete_cellar_items_by_pk(id: $itemId) {
      id
    }
  }
`);

export const CellarItemHeader = ({
  itemType,
  itemId,
  itemName,
  cellarId,
  cellarName,
  isOwner,
}: CellarItemHeaderProps) => {
  const router = useRouter();
  const userId = useUserId();
  if (isNil(userId)) throw Error("UserId not found");

  const [open, setOpen] = useState(false);
  const [{ fetching, error, operation }, deleteItem] =
    useMutation(deleteCellarItem);

  const isErrored = isNotNil(error);
  const hasFetched = isNotNil(operation);

  const isDisabled = fetching || (hasFetched && !isErrored);

  const handleDeleteClick = async () => {
    await deleteItem({ itemId });
  };

  useEffect(() => {
    if (!fetching && hasFetched && !isErrored) {
      router.replace(`/cellars/${cellarId}/items`);
    }
  }, [cellarId, fetching, hasFetched, isErrored, router]);

  return (
    <HeaderBar
      breadcrumbs={[
        { url: "/cellars", text: "Cellars" },
        {
          url: `/cellars/${cellarId}/items`,
          text: cellarName ?? "loading...",
        },
        {
          url: `${itemId}`,
          text: itemName ?? "loading...",
        },
      ]}
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
        </Stack>
      }
    />
  );
};
