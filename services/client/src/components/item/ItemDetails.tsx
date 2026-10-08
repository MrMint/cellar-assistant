"use client";

import type { MouseEvent } from "react";
import { useState, useTransition } from "react";
import { useMutation } from "urql";
import { IconButton } from "@/components/app/IconButton";
import { Love } from "@/components/app/icons";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { ToggleFavoriteMutation } from "@/lib/api/items";
import { unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";
import { ItemSection } from "./ItemSection";

export type ItemDetailsProp = {
  itemId: string;
  /** `Item.isFavorite` — was the viewer's `item_favorites` row id. */
  isFavorite: boolean;
  type: ApiItemType;
  title: string;
  subTitlePhrases: Array<string | null | undefined>;
  description: string | null | undefined;
};

/**
 * `82450ad1:src/components/item/ItemDetails.tsx`, restored.
 *
 * `addFavoriteAction` / `deleteFavoriteAction(favoriteId)` →
 * `toggleFavorite(itemId, type)`, which reports the state after the toggle;
 * the heart trusts that over its own guess, as `ItemCard` does.
 *
 * The heart is the brand claret when set (design §3.1: never a pure red
 * heart), an outline otherwise.
 */
const ItemDetails = ({
  itemId,
  isFavorite,
  type,
  title,
  subTitlePhrases,
  description,
}: ItemDetailsProp) => {
  const [isPending, startTransition] = useTransition();
  const [localFavorite, setLocalFavorite] = useState(isFavorite);
  const [, toggleFavorite] = useMutation(ToggleFavoriteMutation);

  const handleFavoriteClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    startTransition(async () => {
      const response = await toggleFavorite({ itemId, type });
      const result = unwrapResult(
        response.data?.toggleFavorite,
        "ToggleFavoritePayload",
      );
      if (result.ok) {
        setLocalFavorite(result.data.favorited);
      } else {
        console.error("Failed to toggle favorite:", result.error.message);
      }
    });
  };

  const phrases = subTitlePhrases
    .filter(
      (phrase): phrase is string => phrase !== null && phrase !== undefined,
    )
    .join(" - ");

  return (
    <ItemSection>
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          {/* The page's heading: the AppBar above leaves its title to this. */}
          <h1 className="type-title-1 min-w-0 flex-1 break-words text-ink-1">
            {title}
          </h1>
          <IconButton
            disabled={isPending}
            onClick={handleFavoriteClick}
            aria-label={
              localFavorite ? "Remove from favorites" : "Add to favorites"
            }
            aria-pressed={localFavorite}
            className="-mr-2 shrink-0"
          >
            <Love
              aria-hidden
              className={cn(
                "size-7",
                localFavorite ? "fill-brand text-brand" : "text-ink-2",
              )}
            />
          </IconButton>
        </div>
        <p className="type-body text-ink-2">{phrases}</p>
        <p className="type-callout text-ink-2">{description}</p>
      </div>
    </ItemSection>
  );
};
export default ItemDetails;
