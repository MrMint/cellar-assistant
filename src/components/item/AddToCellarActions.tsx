"use client";

import type { ItemTypeValue } from "@cellar-assistant/shared";
import { addCellarItemMutation } from "@cellar-assistant/shared/queries";
import {
  Button,
  ButtonGroup,
  Dropdown,
  Menu,
  MenuButton,
  MenuItem,
} from "@mui/joy";
import { gt, isNil, length } from "ramda";
import { MdAdd, MdArrowDownward } from "react-icons/md";
import { useMutation } from "urql";

type AddToCellarActionsProps = {
  itemId: string;
  itemType: ItemTypeValue;
  cellars?: {
    id: string;
    name: string;
  }[];
};

export const AddToCellarActions = ({
  itemType,
  itemId,
  cellars,
}: AddToCellarActionsProps) => {
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

  // Don't render anything if no cellars
  if (isNil(cellars)) {
    return null;
  }

  // Single cellar - show simple button
  if (length(cellars) === 1) {
    return (
      <Button
        onClick={() => handleAddClick(cellars[0].id)}
        startDecorator={<MdAdd />}
        disabled={isDisabled}
        loading={isLoading}
      >
        Add to Cellar
      </Button>
    );
  }

  // Multiple cellars - show dropdown
  if (gt(length(cellars), 1)) {
    return (
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
    );
  }

  return null;
};
