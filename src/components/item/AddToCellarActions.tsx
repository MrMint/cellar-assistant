"use client";

import type { ItemTypeValue } from "@cellar-assistant/shared";
import {
  Button,
  ButtonGroup,
  Dropdown,
  Menu,
  MenuButton,
  MenuItem,
} from "@mui/joy";
import { gt, isNil, length } from "ramda";
import { useTransition } from "react";
import { MdAdd, MdArrowDownward } from "react-icons/md";
import { addCellarItemAction } from "@/app/actions/cellarItems";

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
  const [isPending, startTransition] = useTransition();

  const isLoading = isNil(cellars) || isPending;
  const isDisabled = isNil(cellars);

  const handleAddClick = (cellarId: string) => {
    startTransition(async () => {
      await addCellarItemAction(cellarId, itemId, itemType);
    });
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
