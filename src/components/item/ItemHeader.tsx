import type { ItemTypeValue } from "@cellar-assistant/shared";
import { addCellarItemMutation } from "@cellar-assistant/shared/queries";
import {
  Button,
  ButtonGroup,
  Dropdown,
  Menu,
  MenuButton,
  MenuItem,
  Stack,
} from "@mui/joy";
import { gt, isNil, isNotNil, length } from "ramda";
import { MdAdd, MdArrowDownward } from "react-icons/md";
import { useMutation } from "urql";
import { HeaderBar } from "@/components/common/HeaderBar";

type ItemHeaderProps = {
  itemId: string;
  itemName?: string;
  itemType: ItemTypeValue;
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
      case "BEER":
        await addItem({ item: { cellar_id: cellarId, beer_id: itemId } });
        break;
      case "SPIRIT":
        await addItem({ item: { cellar_id: cellarId, spirit_id: itemId } });
        break;
      case "WINE":
        await addItem({ item: { cellar_id: cellarId, wine_id: itemId } });
        break;
      case "COFFEE":
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
      serverBreadcrumbs={{
        itemName: itemName ?? "loading...",
      }}
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
