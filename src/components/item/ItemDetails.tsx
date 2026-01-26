"use client";

import type { ItemTypeValue } from "@cellar-assistant/shared";
import {
  addFavoriteMutation,
  deleteFavoriteMutation,
} from "@cellar-assistant/shared/queries";
import { Card, IconButton, Stack, Typography } from "@mui/joy";
import { isNil, isNotNil, without } from "ramda";
import type { MouseEvent } from "react";
import { MdFavorite, MdFavoriteBorder } from "react-icons/md";
import { useMutation } from "urql";
import { typeToIdKey } from "@/utilities";

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
  const [{ fetching: fetchingAdd }, addFavorite] =
    useMutation(addFavoriteMutation);
  const [{ fetching: fetchingDelete }, deleteFavorite] = useMutation(
    deleteFavoriteMutation,
  );
  const handleFavoriteClick = async (
    event: MouseEvent<HTMLAnchorElement, globalThis.MouseEvent>,
  ) => {
    event.stopPropagation();
    if (isNil(favoriteId)) {
      await addFavorite({
        object: { [typeToIdKey(type)]: itemId },
      });
    } else {
      await deleteFavorite({
        id: favoriteId,
      });
    }
  };

  const favoriteButton = (
    <IconButton
      disabled={fetchingAdd || fetchingDelete}
      onClick={handleFavoriteClick}
    >
      {isNotNil(favoriteId) ? (
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
