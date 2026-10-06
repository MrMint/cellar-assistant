"use client";

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
import { isNotNil } from "ramda";
import { useCallback, useEffect, useState } from "react";
import { MdAdd, MdHistory, MdPlace, MdStar, MdViewList } from "react-icons/md";
import { ItemTypeIcon } from "@/components/common/ItemTypeIcon";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { formatDistance } from "@/lib/items/distance";
import { getNextPlaceholder } from "@/utilities";
import { RichTextDisplay } from "../common/RichTextDisplay";
import { UserAvatar } from "../common/UserAvatar";
import type { ActivityEntry, ActivityKind } from "./adapter";
import { fadeInLeft, staggerContainerFast } from "./motion-variants";
import { useHasMounted } from "./useHasMounted";

/**
 * `82450ad1:src/components/search/RecentActivity.tsx`, restored (UI parity
 * G31, restored at the user's request).
 *
 * Markup, copy, filters and motion are the old feed's. What changed under it:
 *
 * - **The feed arrives built.** The old component took three Hasura result
 *   sets — queried with a browser-built `$userIds` — and merged them here.
 *   `me.recentActivity` decides whose activity server-side and filters lists
 *   and cellars through the visibility policy; `activityFeedFromNodes`
 *   (`./adapter.ts`) turns its entries into the old `ActivityEntry` and keeps
 *   the old newest-first, cap-of-eight merge.
 * - **Thumbnails** are the presigned `file { url }` instead of a Nhost storage
 *   URL built from a file id; same `next/image` props.
 * - **"· 3 days ago"** is computed after mount (`formatDistance`, the
 *   date-fns wording), not during render: a relative time is a hydration
 *   mismatch by construction (`hydration-safety.test.ts`). The first paint
 *   shows the line without it.
 */

export type { ActivityKind } from "./adapter";

// ─── Activity kind filters ───────────────────────────────────────────────────

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
    case "TEA":
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
    case "TEA":
      return "success";
    case "PLACE":
      return "primary";
    default:
      return "neutral";
  }
}

/** `formatDistanceToNow(…, { addSuffix: true })`, once mounted. */
function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
  }, []);
  return now;
}

const timeAgoText = (iso: string, now: number | null): string | null => {
  if (now === null) return null;
  const distance = formatDistance(iso, now);
  if (distance === "") return null;
  return Date.parse(iso) > now ? `in ${distance}` : `${distance} ago`;
};

// ─── Component ───────────────────────────────────────────────────────────────

interface RecentActivityProps {
  feed: ActivityEntry[];
  selectedKinds: ActivityKind[];
}

export function RecentActivity({ feed, selectedKinds }: RecentActivityProps) {
  const now = useNow();
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefersReducedMotion = useMediaQuery(
    "(prefers-reduced-motion: reduce)",
  );
  // The server's render and the hydration pass start visible; only what
  // mounts afterwards (a filter change) plays the entrance. See ./AnimateIn.
  const animateEntrance = useHasMounted();

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
            initial={animateEntrance ? { opacity: 0 } : false}
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
            initial={
              animateEntrance && !prefersReducedMotion ? "hidden" : false
            }
            animate="show"
            exit="exit"
          >
            <Grid container spacing={1} columns={{ xs: 1, md: 2 }}>
              {feed.map((entry) => {
                const timeAgo = timeAgoText(entry.timestamp, now);
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
                            {entry.itemImageUrl ? (
                              <Image
                                src={entry.itemImageUrl}
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
                                {timeAgo !== null && ` \u00B7 ${timeAgo}`}
                              </>
                            ) : entry.kind === "tier-listed" ? (
                              <>
                                #{entry.rank} in {entry.tierListName}
                                {timeAgo !== null && ` \u00B7 ${timeAgo}`}
                              </>
                            ) : (
                              <>
                                Rated{" "}
                                {isNotNil(entry.score)
                                  ? entry.score.toFixed(1)
                                  : ""}
                                {timeAgo !== null && ` \u00B7 ${timeAgo}`}
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
