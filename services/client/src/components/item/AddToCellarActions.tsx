"use client";

import {
  Button,
  ButtonGroup,
  Dropdown,
  Menu,
  MenuButton,
  MenuItem,
  Typography,
} from "@mui/joy";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MdAdd, MdArrowDownward } from "react-icons/md";
import { useMutation } from "urql";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { AddItemToCellarFromItemMutation } from "@/lib/api/items";
import { unwrapResult } from "@/lib/api/result";

type AddToCellarActionsProps = {
  itemId: string;
  itemType: ApiItemType;
  cellars?: {
    id: string;
    name: string;
  }[];
};

/**
 * `82450ad1:src/components/item/AddToCellarActions.tsx`, restored.
 *
 * `addCellarItemAction(cellarId, itemId, type)` → `addItemToCellar` with a
 * client-minted `cellarItemId`, so a retry after a dropped response files one
 * bottle, not two. The old action revalidated the page; `router.refresh()`
 * re-reads "Located in:" the same way. A refusal is shown under the button
 * instead of being dropped, which is what the old transition did.
 */
export const AddToCellarActions = ({
  itemType,
  itemId,
  cellars,
}: AddToCellarActionsProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [, addItemToCellar] = useMutation(AddItemToCellarFromItemMutation);

  const isLoading = cellars === undefined || isPending;
  const isDisabled = cellars === undefined;

  const handleAddClick = (cellarId: string) => {
    startTransition(async () => {
      setError(null);
      const response = await addItemToCellar({
        cellarId,
        input: {
          cellarItemId: crypto.randomUUID(),
          item: { id: itemId, type: itemType },
        },
      });
      const result = unwrapResult(response.data?.addItemToCellar, "CellarItem");
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  };

  // Don't render anything if no cellars
  if (cellars === undefined) {
    return null;
  }

  const errorText = error !== null && (
    <Typography level="body-xs" color="danger">
      {error}
    </Typography>
  );

  // Single cellar - show simple button
  if (cellars.length === 1) {
    return (
      <>
        <Button
          onClick={() => handleAddClick(cellars[0].id)}
          startDecorator={<MdAdd />}
          disabled={isDisabled}
          loading={isLoading}
        >
          Add to Cellar
        </Button>
        {errorText}
      </>
    );
  }

  // Multiple cellars - show dropdown
  if (cellars.length > 1) {
    return (
      <>
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
        {errorText}
      </>
    );
  }

  return null;
};
