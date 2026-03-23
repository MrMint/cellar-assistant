"use client";

import type { ResultOf } from "@cellar-assistant/shared";
import {
  Avatar,
  Box,
  Card,
  CardContent,
  Grid,
  IconButton,
  Stack,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/joy";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { isNotNil } from "ramda";
import { MdAdd, MdHistory, MdPlace, MdStar, MdViewList } from "react-icons/md";
import { ItemTypeIcon } from "@/components/common/ItemTypeIcon";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
  formatVintage,
  getNextPlaceholder,
  getNhostStorageUrl,
} from "@/utilities";
import { RichTextDisplay } from "../common/RichTextDisplay";
import { UserAvatar } from "../common/UserAvatar";
import type {
  RecentReviewsQuery,
  RecentTierListItemsQuery,
  SearchDiscoveryQuery,
} from "./fragments";
import { fadeInLeft, staggerContainerFast } from "./motion-variants";

// ─── Types ───────────────────────────────────────────────────────────────────

type CellarItem = ResultOf<
  typeof SearchDiscoveryQuery
>["recent_cellar_items"][number];

type ReviewItem = ResultOf<typeof RecentReviewsQuery>["item_reviews"][number];

type TierListItem = ResultOf<
  typeof RecentTierListItemsQuery
>["tier_list_items"][number];

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
    }
  | {
      kind: "tier-listed";
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
      tierListName: string;
      rank: number;
    };

// ─── Activity kind filters ───────────────────────────────────────────────────

export type ActivityKind = ActivityEntry["kind"];

const ACTIVITY_KIND_FILTERS: {
  id: ActivityKind;
  label: string;
  icon: React.FC;
}[] = [
  { id: "added", label: "Added", icon: MdAdd },
  { id: "reviewed", label: "Reviews", icon: MdStar },
  { id: "tier-listed", label: "Tier Lists", icon: MdViewList },
];

// ─── Item type icon helper ──────────────────────────────────────────────────

function getItemTypeIcon(type: string) {
  switch (type) {
    case "BEER":
    case "WINE":
    case "SPIRIT":
    case "COFFEE":
    case "SAKE":
      return <ItemTypeIcon type={type} />;
    case "PLACE":
      return <MdPlace />;
    default:
      return <MdPlace />;
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
    case "PLACE":
      return "primary";
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

function getItemFromTierListItem(tli: TierListItem) {
  if (isNotNil(tli.beer))
    return {
      name: tli.beer.name,
      type: "BEER",
      imageId: tli.beer.item_images[0]?.file_id,
      placeholder: tli.beer.item_images[0]?.placeholder,
      href: `/beers/${tli.beer.id}`,
    };
  if (isNotNil(tli.wine))
    return {
      name: tli.wine.vintage
        ? `${formatVintage(tli.wine.vintage)} ${tli.wine.name}`
        : tli.wine.name,
      type: "WINE",
      imageId: tli.wine.item_images[0]?.file_id,
      placeholder: tli.wine.item_images[0]?.placeholder,
      href: `/wines/${tli.wine.id}`,
    };
  if (isNotNil(tli.spirit))
    return {
      name: tli.spirit.name,
      type: "SPIRIT",
      imageId: tli.spirit.item_images[0]?.file_id,
      placeholder: tli.spirit.item_images[0]?.placeholder,
      href: `/spirits/${tli.spirit.id}`,
    };
  if (isNotNil(tli.coffee))
    return {
      name: tli.coffee.name,
      type: "COFFEE",
      imageId: tli.coffee.item_images[0]?.file_id,
      placeholder: tli.coffee.item_images[0]?.placeholder,
      href: `/coffees/${tli.coffee.id}`,
    };
  if (isNotNil(tli.sake))
    return {
      name: tli.sake.vintage
        ? `${formatVintage(tli.sake.vintage)} ${tli.sake.name}`
        : tli.sake.name,
      type: "SAKE",
      imageId: tli.sake.item_images[0]?.file_id,
      placeholder: tli.sake.item_images[0]?.placeholder,
      href: `/sakes/${tli.sake.id}`,
    };
  if (isNotNil(tli.place))
    return {
      name: tli.place.display_name ?? tli.place.name,
      type: "PLACE",
      imageId: tli.place.google_photos[0]?.storage_file_id,
      placeholder: undefined,
      href: `/places/${tli.place.id}`,
    };
  return null;
}

// ─── Build the merged, sorted feed ───────────────────────────────────────────

function buildActivityFeed(
  cellarItems: CellarItem[],
  reviews: ReviewItem[],
  tierListItems: TierListItem[],
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

  for (const tli of tierListItems) {
    const item = getItemFromTierListItem(tli);
    if (!item || !tli.createdAt) continue;
    const rank = tli.tier_list.items.findIndex((i) => i.id === tli.id) + 1 || 1;
    entries.push({
      kind: "tier-listed",
      id: `tier-${tli.id}`,
      timestamp: tli.createdAt,
      itemName: item.name,
      itemType: item.type,
      itemImageId: item.imageId,
      itemPlaceholder: item.placeholder,
      itemHref: item.href,
      userId: tli.tier_list.createdBy.id,
      userName: tli.tier_list.createdBy.displayName,
      userAvatar: tli.tier_list.createdBy.avatarUrl,
      tierListName: tli.tier_list.name,
      rank,
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
  tierListItems: TierListItem[];
  selectedKinds: ActivityKind[];
}

export function RecentActivity({
  cellarItems,
  reviews,
  tierListItems,
  selectedKinds,
}: RecentActivityProps) {
  const feed = buildActivityFeed(cellarItems, reviews, tierListItems);
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefersReducedMotion = useMediaQuery(
    "(prefers-reduced-motion: reduce)",
  );

  const handleKindsChange = useCallback(
    (_event: React.MouseEvent, newKinds: ActivityKind[]) => {
      const params = new URLSearchParams(searchParams.toString());
      if (newKinds.length === 0) {
        params.delete("activity");
      } else {
        params.set("activity", newKinds.join(","));
      }
      router.replace(`/search?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  if (feed.length === 0 && selectedKinds.length === 0) return null;

  return (
    <Stack spacing={1.5}>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        useFlexGap
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <MdHistory
            style={{
              color: "var(--joy-palette-neutral-400)",
              fontSize: "1.25rem",
            }}
          />
          <Typography level="title-lg">Recent Activity</Typography>
        </Stack>

        <ToggleButtonGroup
          variant="plain"
          spacing={0.5}
          value={selectedKinds}
          onChange={handleKindsChange}
          aria-label="Activity type filters"
        >
          {ACTIVITY_KIND_FILTERS.map(({ id, label, icon: Icon }) => (
            <Tooltip key={id} title={label}>
              <IconButton value={id} aria-label={label} size="sm">
                <Icon />
              </IconButton>
            </Tooltip>
          ))}
        </ToggleButtonGroup>
      </Stack>
      <AnimatePresence mode="wait">
        {feed.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Typography level="body-sm" sx={{ color: "text.tertiary", py: 2 }}>
              No recent activity for the selected filters
            </Typography>
          </motion.div>
        ) : (
          <motion.div
            key={selectedKinds.join(",")}
            variants={prefersReducedMotion ? undefined : staggerContainerFast}
            initial={prefersReducedMotion ? false : "hidden"}
            animate="show"
            exit="exit"
          >
            <Grid container spacing={1} columns={{ xs: 1, md: 2 }}>
              {feed.map((entry) => {
                const timeAgo = formatDistanceToNow(parseISO(entry.timestamp), {
                  addSuffix: true,
                });
                const blurDataURL = getNextPlaceholder(entry.itemPlaceholder);
                const typeColor = getItemTypeColor(entry.itemType) as
                  | "danger"
                  | "warning"
                  | "neutral"
                  | "success"
                  | "primary";

                return (
                  <Grid key={entry.id} xs={1}>
                    <motion.div
                      variants={prefersReducedMotion ? undefined : fadeInLeft}
                      whileHover={prefersReducedMotion ? undefined : { y: -2 }}
                      whileTap={
                        prefersReducedMotion ? undefined : { scale: 0.98 }
                      }
                      transition={{ duration: 0.15 }}
                    >
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
                            ) : entry.kind === "tier-listed" ? (
                              <MdViewList
                                style={{
                                  fontSize: "1rem",
                                  color: "var(--joy-palette-primary-400)",
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
                                Added to {entry.cellarName}
                                {" \u00B7 "}
                                {timeAgo}
                              </>
                            ) : entry.kind === "tier-listed" ? (
                              <>
                                #{entry.rank} in {entry.tierListName}
                                {" \u00B7 "}
                                {timeAgo}
                              </>
                            ) : (
                              <>
                                Rated{" "}
                                {isNotNil(entry.score)
                                  ? entry.score.toFixed(1)
                                  : ""}
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
                    </motion.div>
                  </Grid>
                );
              })}
            </Grid>
          </motion.div>
        )}
      </AnimatePresence>
    </Stack>
  );
}
