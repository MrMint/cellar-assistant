"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useMutation } from "urql";
import { Add, ChevronDown } from "@/components/app/icons";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddItemToCellarFromItemMutation } from "@/lib/api/items";
import { unwrapResult } from "@/lib/api/result";
import { LoadingButton } from "./LoadingButton";

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
    <p role="alert" className="type-footnote text-destructive">
      {error}
    </p>
  );

  // Single cellar - show simple button
  if (cellars.length === 1) {
    return (
      <div className="flex flex-col gap-1">
        <LoadingButton
          onClick={() => handleAddClick(cellars[0].id)}
          disabled={isDisabled}
          loading={isLoading}
        >
          {!isLoading && <Add aria-hidden />}
          Add to Cellar
        </LoadingButton>
        {errorText}
      </div>
    );
  }

  // Multiple cellars - a menu of them (Joy's ButtonGroup + Menu).
  if (cellars.length > 1) {
    return (
      <div className="flex flex-col gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={isDisabled || isLoading}>
            <LoadingButton loading={isLoading} disabled={isDisabled}>
              Add to Cellar
              {!isLoading && <ChevronDown aria-hidden />}
            </LoadingButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {cellars.map((x) => (
              <DropdownMenuItem
                key={x.id}
                className="min-h-11 text-base"
                onSelect={() => handleAddClick(x.id)}
              >
                {x.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {errorText}
      </div>
    );
  }

  return null;
};
