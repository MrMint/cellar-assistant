"use client";

import type { ItemTypeValue } from "@cellar-assistant/shared";
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
import {
  addFavoriteAction,
  deleteFavoriteAction,
} from "@/app/actions/favorites";
import { InteractiveCard } from "@/components/common/InteractiveCard";
import { ItemTypeIcon } from "@/components/common/ItemTypeIcon";
import { Link } from "@/components/common/Link";
import beer1 from "@/images/beer1.png";
import coffee1 from "@/images/coffee1.png";
import spirit1 from "@/images/spirit1.png";
import sake1 from "@/images/wine1.png";
import wine1 from "@/images/wine1.png";
import {
  formatItemType,
  formatVintage,
  getNhostStorageUrl,
  getNextPlaceholder,
} from "@/utilities";

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
  ])(type);

export type ItemCardItem = {
  id: string;
  itemId: string;
  name: string;
  vintage?: string;
  subtitle?: string;
  displayImageId?: string;
  placeholder?: string | null;
  score?: number | null;
  reviewCount?: number | null;
  reviewed?: boolean | null;
  favoriteCount?: number | null;
  favoriteId?: string | null;
};

export type ItemCardProps = {
  item: ItemCardItem;
  href?: string;
  onClick?: (itemId: string) => void;
  type: ItemTypeValue;
};

export const ItemCard = ({ item, href, onClick, type }: ItemCardProps) => {
  const [isPending, startTransition] = useTransition();
  const [localFavoriteId, setLocalFavoriteId] = useState(item.favoriteId);
  const fallback = getFallback(type);

  const handleFavoriteClick = (
    event: MouseEvent<HTMLAnchorElement, globalThis.MouseEvent>,
  ) => {
    event.stopPropagation();
    startTransition(async () => {
      const previousFavoriteId = localFavoriteId;

      try {
        if (isNil(localFavoriteId)) {
          // Optimistic update: show as favorited immediately
          setLocalFavoriteId("pending");
          const result = await addFavoriteAction(item.itemId, type);
          if (result.success && result.favoriteId) {
            setLocalFavoriteId(result.favoriteId);
          } else {
            // Revert on failure
            setLocalFavoriteId(previousFavoriteId);
            console.error("Failed to add favorite:", result.error);
          }
        } else {
          // Store the current favorite ID before clearing (we know it's defined in this branch)
          const currentFavoriteId = localFavoriteId;
          // Optimistic update: show as unfavorited immediately
          setLocalFavoriteId(undefined);
          const result = await deleteFavoriteAction(currentFavoriteId);
          if (!result.success) {
            // Revert on failure
            setLocalFavoriteId(currentFavoriteId);
            console.error("Failed to delete favorite:", result.error);
          }
        }
      } catch (error) {
        // Revert on unexpected error
        setLocalFavoriteId(previousFavoriteId);
        console.error("Error toggling favorite:", error);
      }
    });
  };

  return (
    <InteractiveCard
      onClick={isNotNil(onClick) ? () => onClick(item.id) : undefined}
    >
      <CardOverflow
        sx={{ aspectRatio: { xs: 1.2, sm: 1 }, padding: 0, overflow: "hidden" }}
      >
        {isNotNil(item.displayImageId) && (
          <Image
            style={{
              aspectRatio: "1",
              objectFit: "cover",
              height: "auto",
              width: "auto",
            }}
            src={getNhostStorageUrl(item.displayImageId)}
            alt={fallback.alt}
            height={400}
            width={400}
            placeholder={getNextPlaceholder(item.placeholder)}
          />
        )}
        {isNil(item.displayImageId) && (
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
          <Link
            overlay
            href={`${formatItemType(type).toLowerCase()}s/${item.id}`}
          >
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
              {item.subtitle ?? "\u00A0"}
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
              {item.subtitle ?? "\u00A0"}
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
            endDecorator={
              isNotNil(localFavoriteId) ? (
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
        {/* {isNil(item.reviewCount) && (
          <Typography sx={overflowItemStyles}>No Reviews</Typography>
        )} */}
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
        {/* {isNil(item.score) && (
          <Typography sx={overflowItemStyles}>No Scores</Typography>
        )} */}
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
