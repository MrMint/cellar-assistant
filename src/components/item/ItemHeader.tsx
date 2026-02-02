"use client";

import type { ItemTypeValue } from "@cellar-assistant/shared";
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
import { useTransition } from "react";
import { MdAdd, MdArrowDownward } from "react-icons/md";
import { addCellarItemAction } from "@/app/actions/cellarItems";
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
  const [isPending, startTransition] = useTransition();

  const isLoading = isNil(cellars) || isPending;
  const isDisabled = isNil(cellars);

  const handleAddClick = (cellarId: string) => {
    startTransition(async () => {
      await addCellarItemAction(cellarId, itemId, itemType);
    });
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
