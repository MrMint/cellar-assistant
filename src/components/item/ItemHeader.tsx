import {
  Button,
  ButtonGroup,
  Dropdown,
  Menu,
  MenuButton,
  MenuItem,
  Stack,
} from "@mui/joy";
import { ItemType } from "@shared/gql/graphql";
import { addCellarItemMutation } from "@shared/queries";
import { gt, isNil, isNotNil, length } from "ramda";
import { MdAdd, MdArrowDownward } from "react-icons/md";
import { useMutation } from "urql";
import { HeaderBar } from "@/components/common/HeaderBar";
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

export const ItemHeader = ({
  itemType,
  itemId,
  itemName,
  cellars,
}: ItemHeaderProps) => {
  const [{ fetching }, addItem] = useMutation(addCellarItemMutation);

  const isLoading = isNil(cellars) || fetching;
  const isDisabled = isNil(cellars);

  const handleAddClick = async (cellarId: string) => {
    switch (itemType) {
      case ItemType.Beer:
        await addItem({ item: { cellar_id: cellarId, beer_id: itemId } });
        break;
      case ItemType.Spirit:
        await addItem({ item: { cellar_id: cellarId, spirit_id: itemId } });
        break;
      case ItemType.Wine:
        await addItem({ item: { cellar_id: cellarId, wine_id: itemId } });
        break;
      case ItemType.Coffee:
        await addItem({ item: { cellar_id: cellarId, coffee_id: itemId } });
        break;

      default:
        throw new Error(
          `Unsupported type ${itemType} provided to handleAddClick()`,
        );
    }
  };

  return (
    <HeaderBar
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
