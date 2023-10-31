import TopNavigationBar from "@/components/common/HeaderBar";
import { ItemType } from "@/constants";
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
import { MdDelete, MdEdit, MdWarning } from "react-icons/md";
import Link from "../common/Link";
import { graphql } from "@/gql";
import { useMutation } from "urql";
import { useEffect, useState } from "react";
import { isNil, isNotNil } from "ramda";
import { useRouter } from "next/navigation";

type CellarItemHeaderProps = {
  itemId: string;
  itemName: string | undefined;
  itemType: ItemType;
  cellarId: string;
  cellarName: string | undefined;
};

const deleteBeerMutation = graphql(`
  mutation DeleteBeerMutation($itemId: uuid!) {
    delete_beers_by_pk(id: $itemId) {
      id
    }
  }
`);

const deleteSpiritMutation = graphql(`
  mutation DeleteSpiritMutation($itemId: uuid!) {
    delete_spirits_by_pk(id: $itemId) {
      id
    }
  }
`);

const deleteWineMutation = graphql(`
  mutation DeleteWineMutation($itemId: uuid!) {
    delete_cellar_wine_by_pk(id: $itemId) {
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
}: CellarItemHeaderProps) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [beerResponse, deleteBeer] = useMutation(deleteBeerMutation);
  const [spiritResponse, deleteSpirit] = useMutation(deleteSpiritMutation);
  const [wineResponse, deleteWine] = useMutation(deleteWineMutation);

  const isFetching =
    beerResponse.fetching || spiritResponse.fetching || wineResponse.fetching;

  const isErrored =
    isNotNil(beerResponse.error) ||
    isNotNil(spiritResponse.error) ||
    isNotNil(wineResponse.error);

  const hasFetched =
    isNotNil(beerResponse.operation) ||
    isNotNil(spiritResponse.operation) ||
    isNotNil(wineResponse.operation);

  const isDisabled = isFetching || (hasFetched && !isErrored);

  const handleDeleteClick = async () => {
    switch (itemType) {
      case ItemType.Beer:
        await deleteBeer({ itemId });
        break;
      case ItemType.Spirit:
        await deleteSpirit({ itemId });
        break;
      case ItemType.Wine:
        await deleteWine({ itemId });
        break;

      default:
        throw new Error(
          `Unsupported type ${itemType} provided to handleDeleteClick()`,
        );
    }
  };

  useEffect(() => {
    if (!isFetching && hasFetched && !isErrored) {
      router.replace(`/cellars/${cellarId}/items`);
    }
  }, [cellarId, isFetching, hasFetched, isErrored, router]);

  return (
    <TopNavigationBar
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
          >
            Edit item
          </Button>
          <Button
            variant="outlined"
            color="danger"
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
                Are you sure you want to delete {itemName}?
              </DialogContent>
              <DialogActions>
                <Button
                  variant="solid"
                  color="danger"
                  disabled={isDisabled}
                  onClick={handleDeleteClick}
                >
                  Delete {ItemType[itemType]}
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