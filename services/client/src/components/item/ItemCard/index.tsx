"use client";

import {
  Button,
  CardContent,
  CardOverflow,
  Divider,
  Typography,
} from "@mui/joy";
import type { SxProps } from "@mui/joy/styles/types";
import Image from "next/image";
import { always, cond, equals, isNil, isNotNil } from "ramda";
import type { MouseEvent } from "react";
import { useState, useTransition } from "react";
import {
  MdFavorite,
  MdFavoriteBorder,
  MdOutlineComment,
  MdStar,
} from "react-icons/md";
import { useMutation } from "urql";
import type { ApiItemType as ItemTypeValue } from "@/components/cellar-api/itemTypes";
import { InteractiveCard } from "@/components/common/InteractiveCard";
import { ItemTypeIcon } from "@/components/common/ItemTypeIcon";
import { Link } from "@/components/common/Link";
import beer1 from "@/images/beer1.png";
import coffee1 from "@/images/coffee1.png";
import sake1 from "@/images/sake1.png";
import spirit1 from "@/images/spirit1.png";
import tea1 from "@/images/tea1.png";
import wine1 from "@/images/wine1.png";
import { ToggleFavoriteMutation } from "@/lib/api/items";
import { unwrapResult } from "@/lib/api/result";
import { formatVintage, getNextPlaceholder } from "@/utilities";
import type { ItemCardItem } from "./types";

export type { ItemCardItem } from "./types";

const overflowItemStyles: SxProps = {
  justifyContent: "center",
  textAlign: "center",
  flexGrow: 1,
  py: 1,
};

const getFallback = (type: ItemTypeValue) =>
  cond([
    [equals("BEER"), always({ image: beer1, alt: "A beer glass" })],
    [equals("WINE"), always({ image: wine1, alt: "A wine bottle" })],
    [
      equals("COFFEE"),
      always({ image: coffee1, alt: "A bag of coffee beans" }),
    ],
    [equals("SPIRIT"), always({ image: spirit1, alt: "A bottle of spirits" })],
    [equals("SAKE"), always({ image: sake1, alt: "A sake bottle" })],
    [equals("TEA"), always({ image: tea1, alt: "A tea container" })],
  ])(type);

export type ItemCardProps = {
  item: ItemCardItem;
  href?: string;
  onClick?: (itemId: string) => void;
  type: ItemTypeValue;
};

/**
 * `82450ad1:src/components/item/ItemCard/index.tsx`, restored.
 *
 * Markup, sections and styles are the old card's. Four substitutions, each
 * listed in `src/components/LEGACY-RESTORE.md`:
 *
 * 1. **The image** is a plain `<img>` on the presigned `displayImageUrl`
 *    rather than `next/image` on a Nhost storage URL — `next.config.mjs`
 *    explains why presigned reads never go through the optimizer. The old
 *    blur placeholder becomes the `<img>`'s background. The bundled fallback
 *    art still goes through `next/image`, as before.
 * 2. **The favourite toggle** is `toggleFavorite` (one mutation that reports
 *    the state after the toggle) instead of the add/delete server actions
 *    keyed on a favourite row id. The optimistic flip and revert are the old
 *    ones.
 * 3. **The link** goes to `href` as given. The old card ignored the value and
 *    rebuilt a *relative* `wines/<id>`, which resolved differently per page
 *    (§7, "Relative hrefs everywhere"); callers now pass an absolute href.
 * 4. **`ItemTypeValue`** is the SDL's `ItemType`, not the shared package's.
 */
export const ItemCard = ({ item, href, onClick, type }: ItemCardProps) => {
  const [isPending, startTransition] = useTransition();
  const [localFavorite, setLocalFavorite] = useState(item.isFavorite ?? false);
  const [, toggleFavorite] = useMutation(ToggleFavoriteMutation);
  const fallback = getFallback(type);

  const handleFavoriteClick = (
    event: MouseEvent<HTMLAnchorElement, globalThis.MouseEvent>,
  ) => {
    event.stopPropagation();
    startTransition(async () => {
      const previousFavorite = localFavorite;
      // Optimistic update: show the new state immediately
      setLocalFavorite(!previousFavorite);
      try {
        const response = await toggleFavorite({ itemId: item.itemId, type });
        const result = unwrapResult(
          response.data?.toggleFavorite,
          "ToggleFavoritePayload",
        );
        if (result.ok) {
          // The payload is the state *after* the toggle; trust it over the guess.
          setLocalFavorite(result.data.favorited);
        } else {
          // Revert on failure
          setLocalFavorite(previousFavorite);
          console.error("Failed to toggle favorite:", result.error.message);
        }
      } catch (error) {
        // Revert on unexpected error
        setLocalFavorite(previousFavorite);
        console.error("Error toggling favorite:", error);
      }
    });
  };

  const placeholder = getNextPlaceholder(item.placeholder);

  return (
    <InteractiveCard
      onClick={isNotNil(onClick) ? () => onClick(item.id) : undefined}
    >
      <CardOverflow
        sx={{ aspectRatio: { xs: 1.2, sm: 1 }, padding: 0, overflow: "hidden" }}
      >
        {isNotNil(item.displayImageUrl) && (
          // biome-ignore lint/performance/noImgElement: presigned reads must not go through /_next/image (next.config.mjs, D10).
          <img
            style={{
              aspectRatio: "1",
              objectFit: "cover",
              height: "auto",
              width: "auto",
              backgroundImage: isNotNil(placeholder)
                ? `url("${placeholder}")`
                : undefined,
              backgroundSize: "cover",
            }}
            src={item.displayImageUrl}
            alt={fallback.alt}
            height={400}
            width={400}
            loading="lazy"
            decoding="async"
          />
        )}
        {isNil(item.displayImageUrl) && (
          <Image
            src={fallback.image}
            alt={fallback.alt}
            fill
            placeholder="blur"
          />
        )}
      </CardOverflow>
      {isNotNil(href) && (
        <CardContent>
          <Link overlay href={href}>
            <Typography level="title-md" noWrap>
              {type === "WINE" && `${formatVintage(item.vintage)} ${item.name}`}
              {type !== "WINE" && item.name}
            </Typography>
          </Link>
          <Typography
            level="body-xs"
            noWrap
            sx={{
              color: "text.secondary",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 0.5,
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {item.subtitle ?? " "}
            </span>
            <ItemTypeIcon type={type} />
          </Typography>
        </CardContent>
      )}
      {isNil(href) && isNotNil(onClick) && (
        <>
          <Typography level="title-md" noWrap>
            {type === "WINE" && `${formatVintage(item.vintage)} ${item.name}`}
            {type !== "WINE" && item.name}
          </Typography>
          <Typography
            level="body-xs"
            noWrap
            sx={{
              color: "text.secondary",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 0.5,
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {item.subtitle ?? " "}
            </span>
            <ItemTypeIcon type={type} />
          </Typography>
        </>
      )}
      <CardOverflow
        variant="soft"
        sx={{
          display: "flex",
          flexDirection: "row",
          gap: 1,
          justifyContent: "space-around",
          overflow: "hidden",
          alignItems: "center",
          padding: 0,
          borderTop: "1px solid",
          borderColor: "divider",
        }}
      >
        {isNotNil(item.favoriteCount) && (
          <Button
            sx={{
              zIndex: 2,
              flexGrow: 1,
            }}
            onClick={handleFavoriteClick}
            variant="soft"
            color="neutral"
            size="sm"
            loading={isPending}
            aria-pressed={localFavorite}
            endDecorator={
              localFavorite ? (
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
              )
            }
          >
            <Typography level="title-md">{item.favoriteCount}</Typography>
          </Button>
        )}
        <Divider orientation="vertical" />
        {isNotNil(item.reviewCount) && (
          <Typography
            sx={overflowItemStyles}
            endDecorator={<MdOutlineComment />}
            level="title-md"
          >
            {item.reviewCount}
          </Typography>
        )}
        <Divider orientation="vertical" />
        {isNotNil(item.score) && (
          <Typography
            sx={overflowItemStyles}
            endDecorator={
              <MdStar
                style={{
                  color: item.reviewed ? "#ffba26" : "var(--Icon-color)",
                  fontSize: "2rem",
                }}
              />
            }
            level="title-md"
          >
            {item.score.toFixed(2)}
          </Typography>
        )}
      </CardOverflow>
    </InteractiveCard>
  );
};
