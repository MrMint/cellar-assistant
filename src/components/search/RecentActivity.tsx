"use client";

import type { ResultOf } from "@cellar-assistant/shared";
import {
  Avatar,
  Box,
  Card,
  CardContent,
  Grid,
  Stack,
  Typography,
} from "@mui/joy";
import Image from "next/image";
import Link from "next/link";
import { formatDistanceToNow, parseISO } from "date-fns";
import { isNotNil } from "ramda";
import {
  MdAdd,
  MdCoffee,
  MdHistory,
  MdLocalBar,
  MdSportsBar,
  MdStar,
  MdWineBar,
} from "react-icons/md";
import {
  formatVintage,
  getNextPlaceholder,
  getNhostStorageUrl,
} from "@/utilities";
import { RichTextDisplay } from "../common/RichTextDisplay";
import { UserAvatar } from "../common/UserAvatar";
import type { RecentReviewsQuery, SearchDiscoveryQuery } from "./fragments";

// ─── Types ───────────────────────────────────────────────────────────────────

type CellarItem = ResultOf<
  typeof SearchDiscoveryQuery
>["recent_cellar_items"][number];

type ReviewItem = ResultOf<typeof RecentReviewsQuery>["item_reviews"][number];

type ActivityEntry =
  | {
      kind: "added";
      id: string;
      timestamp: string;
      itemName: string;
      itemType: string;
      itemImageId?: string;
      itemPlaceholder?: string | null;
      itemHref: string;
      userId: string;
      userName: string;
      userAvatar: string;
      cellarName: string;
    }
  | {
      kind: "reviewed";
      id: string;
      timestamp: string;
      itemName: string;
      itemType: string;
      itemImageId?: string;
      itemPlaceholder?: string | null;
      itemHref: string;
      userId: string;
      userName: string;
      userAvatar: string;
      score: number | null;
      reviewText: string | null;
    };

// ─── Item type icon helper ──────────────────────────────────────────────────

function getItemTypeIcon(type: string) {
  switch (type) {
    case "WINE":
      return <MdWineBar />;
    case "BEER":
      return <MdSportsBar />;
    case "SPIRIT":
      return <MdLocalBar />;
    case "COFFEE":
      return <MdCoffee />;
    default:
      return <MdLocalBar />;
  }
}

function getItemTypeColor(type: string) {
  switch (type) {
    case "WINE":
      return "danger";
    case "BEER":
      return "warning";
    case "SPIRIT":
      return "neutral";
    case "COFFEE":
      return "success";
    default:
      return "neutral";
  }
}

// ─── Item detail extractors ──────────────────────────────────────────────────

function getItemFromCellarItem(ci: CellarItem) {
  if (isNotNil(ci.beer))
    return {
      name: ci.beer.name,
      imageId: ci.beer.item_images[0]?.file_id,
      placeholder: ci.beer.item_images[0]?.placeholder,
      href: `/beers/${ci.beer.id}`,
    };
  if (isNotNil(ci.wine))
    return {
      name: ci.wine.vintage
        ? `${formatVintage(ci.wine.vintage)} ${ci.wine.name}`
        : ci.wine.name,
      imageId: ci.wine.item_images[0]?.file_id,
      placeholder: ci.wine.item_images[0]?.placeholder,
      href: `/wines/${ci.wine.id}`,
    };
  if (isNotNil(ci.spirit))
    return {
      name: ci.spirit.name,
      imageId: ci.spirit.item_images[0]?.file_id,
      placeholder: ci.spirit.item_images[0]?.placeholder,
      href: `/spirits/${ci.spirit.id}`,
    };
  if (isNotNil(ci.coffee))
    return {
      name: ci.coffee.name,
      imageId: ci.coffee.item_images[0]?.file_id,
      placeholder: ci.coffee.item_images[0]?.placeholder,
      href: `/coffees/${ci.coffee.id}`,
    };
  if (isNotNil(ci.sake))
    return {
      name: ci.sake.vintage
        ? `${formatVintage(ci.sake.vintage)} ${ci.sake.name}`
        : ci.sake.name,
      imageId: ci.sake.item_images[0]?.file_id,
      placeholder: ci.sake.item_images[0]?.placeholder,
      href: `/sakes/${ci.sake.id}`,
    };
  return null;
}

function getItemFromReview(r: ReviewItem) {
  if (isNotNil(r.beer))
    return {
      name: r.beer.name,
      type: "BEER",
      imageId: r.beer.item_images[0]?.file_id,
      placeholder: r.beer.item_images[0]?.placeholder,
      href: `/beers/${r.beer.id}`,
    };
  if (isNotNil(r.wine))
    return {
      name: r.wine.vintage
        ? `${formatVintage(r.wine.vintage)} ${r.wine.name}`
        : r.wine.name,
      type: "WINE",
      imageId: r.wine.item_images[0]?.file_id,
      placeholder: r.wine.item_images[0]?.placeholder,
      href: `/wines/${r.wine.id}`,
    };
  if (isNotNil(r.spirit))
    return {
      name: r.spirit.name,
      type: "SPIRIT",
      imageId: r.spirit.item_images[0]?.file_id,
      placeholder: r.spirit.item_images[0]?.placeholder,
      href: `/spirits/${r.spirit.id}`,
    };
  if (isNotNil(r.coffee))
    return {
      name: r.coffee.name,
      type: "COFFEE",
      imageId: r.coffee.item_images[0]?.file_id,
      placeholder: r.coffee.item_images[0]?.placeholder,
      href: `/coffees/${r.coffee.id}`,
    };
  if (isNotNil(r.sake))
    return {
      name: r.sake.vintage
        ? `${formatVintage(r.sake.vintage)} ${r.sake.name}`
        : r.sake.name,
      type: "SAKE",
      imageId: r.sake.item_images[0]?.file_id,
      placeholder: r.sake.item_images[0]?.placeholder,
      href: `/sakes/${r.sake.id}`,
    };
  return null;
}

// ─── Build the merged, sorted feed ───────────────────────────────────────────

function buildActivityFeed(
  cellarItems: CellarItem[],
  reviews: ReviewItem[],
): ActivityEntry[] {
  const entries: ActivityEntry[] = [];

  for (const ci of cellarItems) {
    const item = getItemFromCellarItem(ci);
    if (!item) continue;
    entries.push({
      kind: "added",
      id: `added-${ci.id}`,
      timestamp: ci.createdAt,
      itemName: item.name,
      itemType: ci.type ?? "WINE",
      itemImageId: item.imageId,
      itemPlaceholder: item.placeholder,
      itemHref: item.href,
      userId: ci.createdBy.id,
      userName: ci.createdBy.displayName,
      userAvatar: ci.createdBy.avatarUrl,
      cellarName: ci.cellar.name,
    });
  }

  for (const r of reviews) {
    const item = getItemFromReview(r);
    if (!item) continue;
    entries.push({
      kind: "reviewed",
      id: `review-${r.id}`,
      timestamp: r.createdAt,
      itemName: item.name,
      itemType: item.type,
      itemImageId: item.imageId,
      itemPlaceholder: item.placeholder,
      itemHref: item.href,
      userId: r.user.id,
      userName: r.user.displayName,
      userAvatar: r.user.avatarUrl,
      score: r.score,
      reviewText: r.text,
    });
  }

  // Sort descending by time
  entries.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  // Cap at 8 entries
  return entries.slice(0, 8);
}

// ─── Component ───────────────────────────────────────────────────────────────

interface RecentActivityProps {
  cellarItems: CellarItem[];
  reviews: ReviewItem[];
  currentUserId: string;
}

export function RecentActivity({
  cellarItems,
  reviews,
  currentUserId,
}: RecentActivityProps) {
  const feed = buildActivityFeed(cellarItems, reviews);

  if (feed.length === 0) return null;

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} alignItems="center">
        <MdHistory
          style={{
            color: "var(--joy-palette-neutral-400)",
            fontSize: "1.25rem",
          }}
        />
        <Typography level="title-lg">Recent Activity</Typography>
      </Stack>
      <Grid container spacing={1} columns={{ xs: 1, md: 2 }}>
        {feed.map((entry) => {
          const isOwn = entry.userId === currentUserId;
          const timeAgo = formatDistanceToNow(parseISO(entry.timestamp), {
            addSuffix: true,
          });
          const blurDataURL = getNextPlaceholder(entry.itemPlaceholder);
          const typeColor = getItemTypeColor(entry.itemType) as
            | "danger"
            | "warning"
            | "neutral"
            | "success";

          return (
            <Grid key={entry.id} xs={1}>
              <Card
                component={Link}
                href={entry.itemHref}
                variant="outlined"
                orientation="horizontal"
                sx={{
                  textDecoration: "none",
                  "--Card-padding": "0.625rem",
                  transition: "all 0.15s ease",
                  height: "100%",
                  "&:hover": {
                    boxShadow: "sm",
                    borderColor: "neutral.outlinedHoverBorder",
                  },
                }}
              >
                {/* Item thumbnail with action badge */}
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    flexShrink: 0,
                    position: "relative",
                  }}
                >
                  <Box
                    sx={{
                      width: "100%",
                      height: "100%",
                      borderRadius: "md",
                      overflow: "hidden",
                      position: "relative",
                    }}
                  >
                    {entry.itemImageId ? (
                      <Image
                        src={getNhostStorageUrl(entry.itemImageId)}
                        alt={entry.itemName}
                        fill
                        style={{ objectFit: "cover" }}
                        sizes="44px"
                        placeholder={blurDataURL ? "blur" : undefined}
                        blurDataURL={blurDataURL}
                      />
                    ) : (
                      <Avatar
                        variant="soft"
                        color={typeColor}
                        sx={{
                          width: "100%",
                          height: "100%",
                          borderRadius: "md",
                          fontSize: "md",
                        }}
                      >
                        {getItemTypeIcon(entry.itemType)}
                      </Avatar>
                    )}
                  </Box>

                  {/* Action icon */}
                  <Box
                    sx={{
                      position: "absolute",
                      top: -4,
                      left: -4,
                      lineHeight: 0,
                      filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))",
                    }}
                  >
                    {entry.kind === "added" ? (
                      <MdAdd
                        style={{
                          fontSize: "1rem",
                          color: "var(--joy-palette-success-400)",
                        }}
                      />
                    ) : (
                      <MdStar
                        style={{
                          fontSize: "1rem",
                          color: "var(--joy-palette-warning-400)",
                        }}
                      />
                    )}
                  </Box>
                </Box>

                <CardContent sx={{ gap: 0.25, minWidth: 0, flex: 1 }}>
                  {/* Item name */}
                  <Typography level="title-sm" noWrap>
                    {entry.itemName}
                  </Typography>

                  {/* Action line */}
                  <Typography
                    level="body-xs"
                    noWrap
                    sx={{ color: "text.tertiary" }}
                  >
                    {entry.kind === "added" ? (
                      <>
                        {isOwn ? "You" : entry.userName} added to{" "}
                        {entry.cellarName}
                        {" \u00B7 "}
                        {timeAgo}
                      </>
                    ) : (
                      <>
                        {isOwn ? "You" : entry.userName} rated{" "}
                        {isNotNil(entry.score) ? entry.score.toFixed(1) : ""}
                        {" \u00B7 "}
                        {timeAgo}
                      </>
                    )}
                  </Typography>

                  {/* Review text snippet */}
                  {entry.kind === "reviewed" && entry.reviewText && (
                    <Box
                      sx={{
                        maxHeight: "1.4em",
                        overflow: "hidden",
                        mt: 0.25,
                        fontSize: "xs",
                        color: "text.secondary",
                        fontStyle: "italic",
                        "& [contenteditable]": {
                          padding: 0,
                          maxHeight: "1.4em",
                          overflow: "hidden",
                        },
                        "& p": { margin: 0 },
                      }}
                    >
                      <RichTextDisplay text={entry.reviewText} />
                    </Box>
                  )}
                </CardContent>

                {/* User avatar on right */}
                <UserAvatar
                  avatarUrl={entry.userAvatar}
                  displayName={entry.userName}
                  size="sm"
                  sx={{
                    "--Avatar-size": "28px",
                    flexShrink: 0,
                    alignSelf: "center",
                  }}
                />
              </Card>
            </Grid>
          );
        })}
      </Grid>
    </Stack>
  );
}
