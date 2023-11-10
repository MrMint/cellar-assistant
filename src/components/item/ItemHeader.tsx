import {
  Button,
  ButtonGroup,
  Dropdown,
  Menu,
  MenuButton,
  MenuItem,
  Stack,
} from "@mui/joy";
import { useRouter, useSearchParams } from "next/navigation";
import { gt, isNil, isNotNil, length } from "ramda";
import { useState } from "react";
import { MdAdd, MdArrowDownward } from "react-icons/md";
import { useMutation } from "urql";
import TopNavigationBar from "@/components/common/HeaderBar";
import { graphql } from "@/gql";
import { ItemType } from "@/gql/graphql";
import { formatItemType } from "@/utilities";

type ItemHeaderProps = {
  itemId: string;
  itemName?: string;
  itemType: ItemType;
  cellars?: {
    id: string;
    name: string;
  }[];
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

const addWineMutation = graphql(`
  mutation HeaderAddWineMutation($input: cellar_wine_insert_input!) {
    insert_cellar_wine_one(object: $input) {
      id
      cellar_id
    }
  }
`);

export const ItemHeader = ({
  itemType,
  itemId,
  itemName,
  cellars,
}: ItemHeaderProps) => {
  const router = useRouter();
  const { get } = useSearchParams();
  const defaultCellar = get("defaultCellar");
  const [open, setOpen] = useState(false);
  const [beerResponse, deleteBeer] = useMutation(deleteBeerMutation);
  const [spiritResponse, deleteSpirit] = useMutation(deleteSpiritMutation);
  const [wineResponse, addWine] = useMutation(addWineMutation);

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

  const isLoading = isNil(cellars) || isFetching;
  const isDisabled = isNil(cellars);

  const handleAddClick = async (cellarId: string) => {
    switch (itemType) {
      case ItemType.Beer:
        await deleteBeer({ itemId });
        break;
      case ItemType.Spirit:
        await deleteSpirit({ itemId });
        break;
      case ItemType.Wine:
        await addWine({ input: { cellar_id: cellarId, wine_id: itemId } });
        break;

      default:
        throw new Error(
          `Unsupported type ${itemType} provided to handleAddClick()`,
        );
    }
  };

  // useEffect(() => {
  //   if (!isFetching && hasFetched && !isErrored) {
  //     router.replace(`/cellars/${cellarId}/items`);
  //   }
  // }, [isFetching, hasFetched, isErrored, router]);

  return (
    <TopNavigationBar
      breadcrumbs={[
        {
          url: `/${formatItemType(itemType)}s`,
          text: `${formatItemType(itemType)}s`,
        },
        {
          url: `/${itemType}s/${itemId}`,
          text: itemName ?? "loading...",
        },
      ]}
      endComponent={
        <Stack spacing={2} direction="row">
          {isNil(cellars) ||
            (isNotNil(cellars) && length(cellars) === 1 && (
              <Button
                onClick={() => handleAddClick(cellars[0].id)}
                startDecorator={<MdAdd />}
                disabled={isDisabled}
                loading={isLoading}
              >
                Add to Cellar
              </Button>
            ))}

          {isNotNil(cellars) && gt(length(cellars), 1) && (
            <ButtonGroup>
              <Dropdown>
                <MenuButton
                  disabled={isDisabled}
                  loading={isLoading}
                  endDecorator={<MdArrowDownward />}
                >
                  Add to Cellar
                </MenuButton>
                <Menu>
                  {cellars.map((x) => (
                    <MenuItem key={x.id} onClick={() => handleAddClick(x.id)}>
                      {x.name}
                    </MenuItem>
                  ))}
                </Menu>
              </Dropdown>
            </ButtonGroup>
          )}
        </Stack>
      }
    />
  );
};
