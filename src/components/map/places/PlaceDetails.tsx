"use client";

import { readFragment } from "@cellar-assistant/shared/gql";
import {
  CheckCircle,
  Coffee,
  Directions,
  Favorite,
  FavoriteBorder,
  Language,
  LocalBar,
  Map as MapIcon,
  Phone,
  Place as PlaceIcon,
  RadioButtonUnchecked,
  Restaurant,
  Schedule,
  Share,
  SportsBar,
  Star,
  WineBar as Wine,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Snackbar,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Typography,
} from "@mui/joy";
import Link from "next/link";
import { useState } from "react";
import { MdFormatListNumbered } from "react-icons/md";
import { useMutation, useQuery } from "urql";
import {
  PlaceCoreFragment,
  PlaceDetailsFragment,
  PlaceWithMenuFragment,
} from "../../shared/fragments/place-fragments";
import { AddToTierListModal } from "../../tier-list/AddToTierListModal";
import { ItemTierLists } from "../../item/ItemTierLists";
import {
  GET_PLACE_DETAILS,
  MARK_PLACE_VISITED,
  TOGGLE_FAVORITE_PLACE,
} from "../queries";
import { MenuScanner } from "../scanning/MenuScanner";
import { formatCategoryName } from "./PlaceDetailsContent";
import { PlaceMenuItems } from "./PlaceMenuItems";

// ── Constants ──────────────────────────────────────────────────────────

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// ── Utilities ──────────────────────────────────────────────────────────

function formatTime(time: string): string {
  const hours = Number.parseInt(time.slice(0, 2), 10);
  const minutes = time.slice(2);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  return `${displayHours}:${minutes} ${period}`;
}

function getCategoryIcon(category: string) {
  switch (category) {
    case "restaurant":
      return Restaurant;
    case "bar":
    case "pub":
      return LocalBar;
    case "cafe":
    case "coffee_shop":
      return Coffee;
    case "brewery":
      return SportsBar;
    case "winery":
      return Wine;
    default:
      return PlaceIcon;
  }
}

function getPriceLevelText(level?: number | null) {
  if (!level) return null;
  return "$".repeat(level);
}

// ── Sub-components ─────────────────────────────────────────────────────

function HoursDisplay({ hours }: { hours: unknown }) {
  if (typeof hours === "string") {
    return (
      <Typography level="body-sm" sx={{ mt: 1 }}>
        {hours}
      </Typography>
    );
  }

  if (
    hours &&
    typeof hours === "object" &&
    "periods" in hours &&
    Array.isArray((hours as { periods: unknown[] }).periods)
  ) {
    type HourPeriod = {
      open: { day: number; time: string };
      close?: { day: number; time: string };
    };
    const periods = (hours as { periods: HourPeriod[] }).periods;

    const byDay = new Map<number, HourPeriod[]>();
    for (const period of periods) {
      const day = period.open.day;
      const existing = byDay.get(day) ?? [];
      existing.push(period);
      byDay.set(day, existing);
    }

    return (
      <Stack spacing={0.5} sx={{ mt: 1 }}>
        {Array.from({ length: 7 }, (_, i) => {
          const dayPeriods = byDay.get(i);
          return (
            <Stack key={DAY_NAMES[i]} direction="row" spacing={2}>
              <Typography
                level="body-sm"
                sx={{ minWidth: 90, fontWeight: "md" }}
              >
                {DAY_NAMES[i]}
              </Typography>
              <Typography level="body-sm" sx={{ color: "text.secondary" }}>
                {dayPeriods
                  ? dayPeriods
                      .map(
                        (p) =>
                          `${formatTime(p.open.time)}${p.close ? ` – ${formatTime(p.close.time)}` : " – Open"}`,
                      )
                      .join(", ")
                  : "Closed"}
              </Typography>
            </Stack>
          );
        })}
      </Stack>
    );
  }

  return (
    <Typography level="body-sm" sx={{ mt: 1 }}>
      {String(hours)}
    </Typography>
  );
}

// ── Main Component ─────────────────────────────────────────────────────

interface PlaceDetailsProps {
  placeId: string;
  userId: string;
}

export function PlaceDetails({ placeId, userId }: PlaceDetailsProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);
  const [isMarkingVisited, setIsMarkingVisited] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    color: "success" | "danger" | "neutral";
  } | null>(null);
  const [tierListModalOpen, setTierListModalOpen] = useState(false);

  const [{ data, fetching, error }, refetch] = useQuery({
    query: GET_PLACE_DETAILS,
    variables: { id: placeId },
  });

  const [, toggleFavorite] = useMutation(TOGGLE_FAVORITE_PLACE);
  const [, markVisited] = useMutation(MARK_PLACE_VISITED);

  const placeRaw = data?.places_by_pk;
  const placeWithMenu = placeRaw
    ? readFragment(PlaceWithMenuFragment, placeRaw)
    : null;
  const placeDetails = placeWithMenu
    ? readFragment(PlaceDetailsFragment, placeWithMenu)
    : null;
  const placeCore = placeDetails
    ? readFragment(PlaceCoreFragment, placeDetails)
    : null;

  const placeData =
    placeCore && placeDetails && placeWithMenu
      ? {
          ...placeCore,
          hours: placeDetails.hours,
          price_level: placeDetails.price_level,
          rating: placeDetails.rating,
          review_count: placeDetails.review_count,
          access_count: placeDetails.access_count,
          last_accessed_at: placeDetails.last_accessed_at,
          first_cached_reason: placeDetails.first_cached_reason,
          source_tags: placeDetails.source_tags,
          last_sync_at: placeDetails.last_sync_at,
        }
      : null;

  const userInteraction = placeWithMenu?.user_place_interactions?.[0];
  const currentMenu = placeWithMenu?.place_menus?.[0];
  const menuItems = currentMenu?.place_menu_items ?? [];

  // ── Action Handlers ────────────────────────────────────────────────

  const handleDirections = () => {
    if (!placeData) return;
    const address = placeData.street_address
      ? `${placeData.street_address}, ${placeData.locality ?? ""}`
      : placeData.name;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`,
      "_blank",
    );
  };

  const handleCall = () => {
    if (!placeData?.phone) return;
    const cleanPhone = placeData.phone.replace(/[^\d+]/g, "");
    window.open(`tel:${cleanPhone}`, "_self");
  };

  const handleWebsite = () => {
    if (!placeData?.website) return;
    let url = placeData.website;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }
    window.open(url, "_blank");
  };

  const handleShare = async () => {
    if (!placeData) return;
    const placeUrl = `${window.location.origin}/places/${placeData.id}`;
    const shareData = {
      title: placeData.name,
      text: `Check out ${placeData.name}${placeData.street_address ? ` at ${placeData.street_address}` : ""}`,
      url: placeUrl,
    };
    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(
          `${shareData.title}\n${shareData.text}\n${shareData.url}`,
        );
        setFeedback({ message: "Link copied to clipboard", color: "success" });
      }
    } catch {
      setFeedback({ message: "Failed to share", color: "danger" });
    }
  };

  const handleToggleFavorite = async () => {
    if (!userId || !placeData) return;
    setIsTogglingFavorite(true);
    try {
      const result = await toggleFavorite({
        userId,
        placeId: placeData.id,
        isFavorite: !userInteraction?.is_favorite,
      });
      if (result.error) {
        setFeedback({
          message: "Failed to update favorite",
          color: "danger",
        });
      } else {
        setFeedback({
          message: userInteraction?.is_favorite
            ? "Removed from saved"
            : "Saved",
          color: "success",
        });
        refetch();
      }
    } catch {
      setFeedback({ message: "Failed to update favorite", color: "danger" });
    } finally {
      setIsTogglingFavorite(false);
    }
  };

  const handleMarkVisited = async () => {
    if (!userId || !placeData) return;
    setIsMarkingVisited(true);
    const willBeVisited = !userInteraction?.is_visited;
    try {
      const result = await markVisited({
        userId,
        placeId: placeData.id,
        isVisited: willBeVisited,
        visitedAt: new Date().toISOString(),
        visitCount: willBeVisited
          ? (userInteraction?.visit_count ?? 0) + 1
          : (userInteraction?.visit_count ?? 0),
      });
      if (result.error) {
        setFeedback({
          message: "Failed to update visited status",
          color: "danger",
        });
      } else {
        setFeedback({
          message: willBeVisited ? "Marked as visited" : "Unmarked",
          color: "success",
        });
        refetch();
      }
    } catch {
      setFeedback({
        message: "Failed to update visited status",
        color: "danger",
      });
    } finally {
      setIsMarkingVisited(false);
    }
  };

  // ── Loading / Error ────────────────────────────────────────────────

  if (fetching) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert color="danger">
          Failed to load place details: {error.message}
        </Alert>
      </Box>
    );
  }

  if (!placeData) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert color="warning">Place not found</Alert>
      </Box>
    );
  }

  // ── Derived ────────────────────────────────────────────────────────

  const MainCategoryIcon = getCategoryIcon(
    placeData.primary_category ?? placeData.categories[0],
  );

  const fullAddress = [
    placeData.street_address,
    placeData.locality,
    placeData.region,
    placeData.postcode,
  ]
    .filter(Boolean)
    .join(", ");

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <Box sx={{ maxWidth: 720, mx: "auto" }}>
      {/* Hero Header */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="flex-start">
            <Box
              sx={{
                p: 1.5,
                borderRadius: "md",
                backgroundColor: "primary.100",
                color: "primary.600",
                flexShrink: 0,
              }}
            >
              <MainCategoryIcon sx={{ fontSize: 28 }} />
            </Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography level="h2" sx={{ mb: 0.5 }}>
                {placeData.name}
              </Typography>
              {placeData.display_name &&
                placeData.display_name !== placeData.name && (
                  <Typography
                    level="body-lg"
                    sx={{ color: "text.secondary", mb: 0.5 }}
                  >
                    {placeData.display_name}
                  </Typography>
                )}

              {/* Rating / Price / Review count row */}
              <Stack
                direction="row"
                spacing={2}
                alignItems="center"
                sx={{ mb: 1, flexWrap: "wrap" }}
              >
                {placeData.rating != null && (
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Star sx={{ fontSize: 18, color: "warning.400" }} />
                    <Typography level="body-sm" sx={{ fontWeight: "md" }}>
                      {placeData.rating.toFixed(1)}
                      {placeData.review_count != null &&
                        ` (${placeData.review_count})`}
                    </Typography>
                  </Stack>
                )}
                {placeData.price_level != null && (
                  <Typography
                    level="body-sm"
                    sx={{ color: "success.600", fontWeight: "md" }}
                  >
                    {getPriceLevelText(placeData.price_level)}
                  </Typography>
                )}
                {placeData.is_verified && (
                  <Chip size="sm" variant="soft" color="success">
                    Verified
                  </Chip>
                )}
              </Stack>

              {/* Address with map link */}
              {fullAddress && (
                <Link
                  href={`/map?placeId=${placeData.id}`}
                  style={{ textDecoration: "none" }}
                >
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{
                      cursor: "pointer",
                      "&:hover .address-text": { color: "primary.500" },
                    }}
                  >
                    <MapIcon
                      sx={{ fontSize: 18, color: "primary.500", flexShrink: 0 }}
                    />
                    <Typography
                      className="address-text"
                      level="body-sm"
                      sx={{
                        color: "primary.600",
                        transition: "color 0.15s",
                      }}
                    >
                      {fullAddress}
                    </Typography>
                  </Stack>
                </Link>
              )}
            </Box>
          </Stack>

          {/* Categories */}
          {placeData.categories && placeData.categories.length > 0 && (
            <Stack
              direction="row"
              spacing={1}
              sx={{ mt: 2, flexWrap: "wrap", gap: 1 }}
            >
              {placeData.categories.map((category: string) => (
                <Chip key={category} variant="soft" color="neutral" size="sm">
                  {formatCategoryName(category)}
                </Chip>
              ))}
            </Stack>
          )}

          {/* Visit info */}
          {userInteraction?.last_visited_at && (
            <Typography level="body-xs" sx={{ mt: 2, color: "text.tertiary" }}>
              Last visited:{" "}
              {new Date(userInteraction.last_visited_at).toLocaleDateString()}
              {userInteraction.visit_count != null &&
                userInteraction.visit_count > 1 &&
                ` (${userInteraction.visit_count} visits)`}
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack spacing={1.5}>
            <Button
              variant="solid"
              color="primary"
              startDecorator={<Directions />}
              fullWidth
              onClick={handleDirections}
            >
              Directions
            </Button>

            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                color="neutral"
                startDecorator={<Phone />}
                disabled={!placeData.phone}
                sx={{ flex: 1 }}
                onClick={handleCall}
              >
                Call
              </Button>
              <Button
                variant="outlined"
                color="neutral"
                startDecorator={<Language />}
                disabled={!placeData.website}
                sx={{ flex: 1 }}
                onClick={handleWebsite}
              >
                Website
              </Button>
            </Stack>

            <Stack direction="row" spacing={1}>
              <Button
                variant={userInteraction?.is_favorite ? "solid" : "outlined"}
                color={userInteraction?.is_favorite ? "danger" : "neutral"}
                startDecorator={
                  userInteraction?.is_favorite ? (
                    <Favorite />
                  ) : (
                    <FavoriteBorder />
                  )
                }
                onClick={handleToggleFavorite}
                loading={isTogglingFavorite}
                disabled={isTogglingFavorite}
                sx={{ flex: 1 }}
              >
                {userInteraction?.is_favorite ? "Saved" : "Save"}
              </Button>
              <Button
                variant={userInteraction?.is_visited ? "solid" : "outlined"}
                color={userInteraction?.is_visited ? "success" : "neutral"}
                startDecorator={
                  userInteraction?.is_visited ? (
                    <CheckCircle />
                  ) : (
                    <RadioButtonUnchecked />
                  )
                }
                onClick={handleMarkVisited}
                loading={isMarkingVisited}
                disabled={isMarkingVisited}
                sx={{ flex: 1 }}
              >
                {userInteraction?.is_visited ? "Visited" : "Mark Visited"}
              </Button>
            </Stack>

            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                color="neutral"
                startDecorator={<Share />}
                sx={{ flex: 1 }}
                onClick={handleShare}
              >
                Share
              </Button>
              <Button
                variant="outlined"
                color="neutral"
                startDecorator={<MdFormatListNumbered />}
                sx={{ flex: 1 }}
                onClick={() => setTierListModalOpen(true)}
              >
                Add to Tier List
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {/* Contact Info */}
      {(placeData.phone || placeData.website) && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Stack spacing={1.5}>
              {placeData.phone && (
                <Stack
                  direction="row"
                  spacing={2}
                  alignItems="center"
                  sx={{ cursor: "pointer" }}
                  onClick={handleCall}
                >
                  <Phone sx={{ fontSize: 20, color: "text.secondary" }} />
                  <Typography level="body-sm" sx={{ color: "primary.500" }}>
                    {placeData.phone}
                  </Typography>
                </Stack>
              )}
              {placeData.phone && placeData.website && <Divider />}
              {placeData.website && (
                <Stack
                  direction="row"
                  spacing={2}
                  alignItems="center"
                  sx={{ cursor: "pointer" }}
                  onClick={handleWebsite}
                >
                  <Language sx={{ fontSize: 20, color: "text.secondary" }} />
                  <Typography level="body-sm" sx={{ color: "primary.500" }}>
                    {placeData.website
                      .replace(/^https?:\/\//, "")
                      .replace(/\/$/, "")}
                  </Typography>
                </Stack>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Tier lists this place belongs to */}
      <Box sx={{ mb: 3 }}>
        <ItemTierLists entityId={placeData.id} entityType="place" />
      </Box>

      {/* Content tabs */}
      <Card>
        <Tabs
          value={activeTab}
          onChange={(_, value) => setActiveTab(value as number)}
        >
          <TabList>
            <Tab>
              Menu
              {menuItems.length > 0 && (
                <Chip size="sm" variant="soft" color="primary" sx={{ ml: 1 }}>
                  {menuItems.length}
                </Chip>
              )}
            </Tab>
            <Tab>Camera Scan</Tab>
            <Tab>Info</Tab>
          </TabList>

          <TabPanel value={0}>
            {currentMenu && menuItems.length > 0 ? (
              <PlaceMenuItems
                placeId={placeData.id}
                userId={userId}
                menuItems={menuItems}
              />
            ) : (
              <Box sx={{ textAlign: "center", py: 4 }}>
                <Restaurant
                  sx={{ fontSize: 48, color: "text.tertiary", mb: 2 }}
                />
                <Typography level="title-lg" sx={{ mb: 1 }}>
                  No menu discovered yet
                </Typography>
                <Typography level="body-md" sx={{ color: "text.secondary" }}>
                  Scan a menu at this location using the &quot;Camera Scan&quot;
                  tab above.
                </Typography>
              </Box>
            )}
          </TabPanel>

          <TabPanel value={1}>
            <MenuScanner
              placeId={placeData.id}
              userId={userId}
              onScanComplete={() => refetch()}
            />
          </TabPanel>

          <TabPanel value={2}>
            <Stack spacing={2}>
              {placeData.hours != null && (
                <Card variant="outlined">
                  <CardContent>
                    <Typography level="title-md" startDecorator={<Schedule />}>
                      Hours
                    </Typography>
                    <HoursDisplay hours={placeData.hours} />
                  </CardContent>
                </Card>
              )}

              <Card variant="outlined">
                <CardContent>
                  <Typography level="title-md">Details</Typography>
                  <Stack spacing={1} sx={{ mt: 1 }}>
                    {placeData.primary_category && (
                      <Typography level="body-sm">
                        <strong>Primary Category:</strong>{" "}
                        {formatCategoryName(placeData.primary_category)}
                      </Typography>
                    )}
                    {placeData.categories &&
                      placeData.categories.length > 0 && (
                        <Typography level="body-sm">
                          <strong>Categories:</strong>{" "}
                          {placeData.categories
                            .map((c: string) => formatCategoryName(c))
                            .join(", ")}
                        </Typography>
                      )}
                    {placeData.confidence != null && (
                      <Typography level="body-sm">
                        <strong>Data Confidence:</strong>{" "}
                        {(placeData.confidence * 100).toFixed(0)}%
                      </Typography>
                    )}
                    {placeData.price_level != null && (
                      <Typography level="body-sm">
                        <strong>Price Level:</strong>{" "}
                        {"$".repeat(placeData.price_level)}
                      </Typography>
                    )}
                    {placeData.is_verified && (
                      <Typography level="body-sm">
                        <strong>Verified:</strong> Yes
                      </Typography>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Stack>
          </TabPanel>
        </Tabs>
      </Card>

      {/* Feedback Snackbar */}
      <Snackbar
        open={feedback !== null}
        autoHideDuration={3000}
        onClose={() => setFeedback(null)}
        color={feedback?.color ?? "neutral"}
        variant="soft"
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {feedback?.message}
      </Snackbar>

      {/* Add to Tier List Modal */}
      <AddToTierListModal
        open={tierListModalOpen}
        onClose={() => setTierListModalOpen(false)}
        placeId={placeData.id}
        placeName={placeData.name}
        userId={userId}
      />
    </Box>
  );
}
