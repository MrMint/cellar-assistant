"use client";

import type { ItemTypeValue } from "@cellar-assistant/shared";
import { Card, IconButton, Stack, Typography } from "@mui/joy";
import { isNil, isNotNil, without } from "ramda";
import type { MouseEvent } from "react";
import { useState, useTransition } from "react";
import { MdFavorite, MdFavoriteBorder } from "react-icons/md";
import {
  addFavoriteAction,
  deleteFavoriteAction,
} from "@/app/actions/favorites";

export type ItemDetailsProp = {
  itemId: string;
  favoriteId?: string;
  type: ItemTypeValue;
  title: string;
  subTitlePhrases: Array<string | null | undefined>;
  description: string | null | undefined;
};

const ItemDetails = ({
  itemId,
  favoriteId,
  type,
  title,
  subTitlePhrases,
  description,
}: ItemDetailsProp) => {
  const [isPending, startTransition] = useTransition();
  const [localFavoriteId, setLocalFavoriteId] = useState(favoriteId);

  const handleFavoriteClick = (
    event: MouseEvent<HTMLAnchorElement, globalThis.MouseEvent>,
  ) => {
    event.stopPropagation();
    startTransition(async () => {
      if (isNil(localFavoriteId)) {
        const result = await addFavoriteAction(itemId, type);
        if (result.success && result.favoriteId) {
          setLocalFavoriteId(result.favoriteId);
        }
      } else {
        const result = await deleteFavoriteAction(localFavoriteId);
        if (result.success) {
          setLocalFavoriteId(undefined);
        }
      }
    });
  };

  const favoriteButton = (
    <IconButton disabled={isPending} onClick={handleFavoriteClick}>
      {isNotNil(localFavoriteId) ? (
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
          {without([null, undefined], subTitlePhrases).join(" - ")}
        </Typography>
        <Typography level="body-sm">{description}</Typography>
      </Stack>
    </Card>
  );
};
export default ItemDetails;
