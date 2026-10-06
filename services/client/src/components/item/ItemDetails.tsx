"use client";

import { Card, IconButton, Stack, Typography } from "@mui/joy";
import type { MouseEvent } from "react";
import { useState, useTransition } from "react";
import { MdFavorite, MdFavoriteBorder } from "react-icons/md";
import { useMutation } from "urql";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { ToggleFavoriteMutation } from "@/lib/api/items";
import { unwrapResult } from "@/lib/api/result";

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

  const favoriteButton = (
    <IconButton
      disabled={isPending}
      onClick={handleFavoriteClick}
      aria-label={localFavorite ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={localFavorite}
    >
      {localFavorite ? (
        <MdFavorite
          style={{
            color: "red",
            fontSize: "2rem",
          }}
        />
      ) : (
        <MdFavoriteBorder
          style={{
            fontSize: "2rem",
          }}
        />
      )}
    </IconButton>
  );
  return (
    <Card>
      <Stack spacing={1}>
        <Typography level="h3" endDecorator={favoriteButton}>
          {title}
        </Typography>
        <Typography level="body-md">
          {subTitlePhrases
            .filter(
              (phrase): phrase is string =>
                phrase !== null && phrase !== undefined,
            )
            .join(" - ")}
        </Typography>
        <Typography level="body-sm">{description}</Typography>
      </Stack>
    </Card>
  );
};
export default ItemDetails;
