"use client";

import type { MouseEvent } from "react";
import { useState, useTransition } from "react";
import { useMutation } from "urql";
import { IconButton } from "@/components/app/IconButton";
import { Love } from "@/components/app/icons";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { SetFavoriteMutation } from "@/lib/api/items";
import { unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";
import { WantToTryButton } from "../want-to-try/WantToTryButton";
import { ItemSection } from "./ItemSection";

export type ItemDetailsProp = {
  itemId: string;
  /** `Item.isFavorite` — was the viewer's `item_favorites` row id. */
  isFavorite: boolean;
  /**
   * `Item.isWantToTry` (X08). Omitted, no bookmark is drawn. Both item pages
   * pass it — the bottle page too, since owning a bottle is not having
   * tasted it.
   */
  isWantToTry?: boolean;
  type: ApiItemType;
  title: string;
  subTitlePhrases: Array<string | null | undefined>;
  description: string | null | undefined;
};

/**
 * `82450ad1:src/components/item/ItemDetails.tsx`, restored.
 *
 * `addFavoriteAction` / `deleteFavoriteAction(favoriteId)` →
 * `setFavorite(itemId, type, favorited)`, which sets the state the tap asked
 * for (a retry cannot flip it back) and reports it; the heart trusts that
 * over its own guess, as `ItemCard` does.
 *
 * The heart is the brand claret when set (design §3.1: never a pure red
 * heart), an outline otherwise. D27 names it Love — "Favorites" survives
 * only in the data model — and puts Save beside it: the Want to try
 * bookmark (X08), so the two verbs a person has before tasting something sit
 * together under the thumb.
 */
const ItemDetails = ({
  itemId,
  isFavorite,
  isWantToTry,
  type,
  title,
  subTitlePhrases,
  description,
}: ItemDetailsProp) => {
  const [isPending, startTransition] = useTransition();
  const [localFavorite, setLocalFavorite] = useState(isFavorite);
  const [, setFavorite] = useMutation(SetFavoriteMutation);

  const handleFavoriteClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const next = !localFavorite;
    startTransition(async () => {
      const response = await setFavorite({ itemId, type, favorited: next });
      const result = unwrapResult(
        response.data?.setFavorite,
        "SetFavoritePayload",
      );
      if (result.ok) {
        setLocalFavorite(result.data.favorited);
      } else {
        console.error("Failed to set favorite:", result.error.message);
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
          {isWantToTry !== undefined && (
            <WantToTryButton
              target={{ kind: "ITEM", itemType: type, itemId }}
              saved={isWantToTry}
              name={title}
              // The heart beside it draws its glyph at 28 px; the bookmark
              // matches it rather than sitting at IconButton's default 20.
              className="shrink-0 [&_svg:not([class*='size-'])]:size-7"
            />
          )}
          <IconButton
            disabled={isPending}
            onClick={handleFavoriteClick}
            aria-label={`Love ${title}`}
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
