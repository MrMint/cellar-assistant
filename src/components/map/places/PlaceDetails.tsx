"use client";

import { readFragment } from "@cellar-assistant/shared/gql";
import {
  CheckCircle,
  Favorite,
  FavoriteBorder,
  Language,
  LocationOn,
  Phone,
  RadioButtonUnchecked,
  Restaurant,
  Schedule,
  Star,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  Snackbar,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Typography,
} from "@mui/joy";
import { useState } from "react";
import { useMutation, useQuery } from "urql";
import {
  PlaceCoreFragment,
  PlaceDetailsFragment,
  PlaceWithMenuFragment,
} from "../../shared/fragments/place-fragments";
import {
  GET_PLACE_DETAILS,
  MARK_PLACE_VISITED,
  TOGGLE_FAVORITE_PLACE,
} from "../queries";
import { ItemTierLists } from "../../item/ItemTierLists";
import { MenuScanner } from "../scanning/MenuScanner";
import { formatCategoryName } from "./PlaceDetailsContent";
import { PlaceMenuItems } from "./PlaceMenuItems";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatTime(time: string): string {
  const hours = Number.parseInt(time.slice(0, 2), 10);
  const minutes = time.slice(2);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  return `${displayHours}:${minutes} ${period}`;
}

function HoursDisplay({ hours }: { hours: unknown }) {
  // Handle string hours (e.g. "Mon-Fri 9-5")
  if (typeof hours === "string") {
    return (
      <Typography level="body-sm" sx={{ mt: 1 }}>
        {hours}
      </Typography>
    );
  }

  // Handle structured hours with periods array
  if (
    hours &&
    typeof hours === "object" &&
    "periods" in hours &&
    Array.isArray((hours as { periods: unknown[] }).periods)
  ) {
    const periods = (
      hours as {
        periods: Array<{
          open: { day: number; time: string };
          close?: { day: number; time: string };
        }>;
      }
    ).periods;

    // Group periods by day
    const byDay = new Map<number, typeof periods>();
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

  // Fallback: display as readable text
  return (
    <Typography level="body-sm" sx={{ mt: 1 }}>
      {String(hours)}
    </Typography>
  );
}

interface PlaceDetailsProps {
  placeId: string;
  userId: string;
}

export function PlaceDetails({ placeId, userId }: PlaceDetailsProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [isTogglingFavorite, setIsTogglingFavorite] = useState(false);
  const [isMarkingVisited, setIsMarkingVisited] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [{ data, fetching, error }, refetch] = useQuery({
    query: GET_PLACE_DETAILS,
    variables: { id: placeId },
  });

  const [, toggleFavorite] = useMutation(TOGGLE_FAVORITE_PLACE);
  const [, markVisited] = useMutation(MARK_PLACE_VISITED);

  const placeRaw = data?.places_by_pk;
  // Unmask nested fragments: PlaceWithMenu → PlaceDetails → PlaceCore
  // gql.tada requires unmasking each fragment layer to access its typed fields
  const placeWithMenu = placeRaw
    ? readFragment(PlaceWithMenuFragment, placeRaw)
    : null;
  const placeDetails = placeWithMenu
    ? readFragment(PlaceDetailsFragment, placeWithMenu)
    : null;
  const placeCore = placeDetails
    ? readFragment(PlaceCoreFragment, placeDetails)
    : null;

  // Combine all fragment data into a single object for easy access
  // This gives us proper types for all fields from all fragment layers
  const placeData =
    placeCore && placeDetails && placeWithMenu
      ? {
          ...placeCore,
          // Add PlaceDetails fields (hours, price_level, rating, review_count, etc.)
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

  // Get user interaction and menu data from unmasked PlaceWithMenuFragment
  const userInteraction = placeWithMenu?.user_place_interactions?.[0];
  const currentMenu = placeWithMenu?.place_menus?.[0];
  // Menu items are now typed properly through the fragment
  const menuItems = currentMenu?.place_menu_items ?? [];

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
        console.error("Error toggling favorite:", result.error);
        setErrorMessage("Failed to update favorite status");
      } else {
        // Refetch data to update UI
        refetch();
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
      setErrorMessage("Failed to update favorite status");
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
        console.error("Error marking visited:", result.error);
        setErrorMessage("Failed to update visited status");
      } else {
        // Refetch data to update UI
        refetch();
      }
    } catch (error) {
      console.error("Error marking visited:", error);
      setErrorMessage("Failed to update visited status");
    } finally {
      setIsMarkingVisited(false);
    }
  };

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

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="flex-start">
            <Box sx={{ flex: 1 }}>
              <Typography level="h2">{placeData.name}</Typography>
              {placeData.display_name &&
                placeData.display_name !== placeData.name && (
                  <Typography level="body-lg" sx={{ color: "text.secondary" }}>
                    {placeData.display_name}
                  </Typography>
                )}

              {placeData.street_address && (
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ mt: 1 }}
                >
                  <LocationOn fontSize="small" />
                  <Typography level="body-sm">
                    {placeData.street_address}
                    {placeData.locality && `, ${placeData.locality}`}
                    {placeData.region && `, ${placeData.region}`}
                  </Typography>
                </Stack>
              )}

              {/* Categories */}
              {placeData.categories && placeData.categories.length > 0 && (
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ mt: 2, flexWrap: "wrap" }}
                >
                  {placeData.categories.map((category: string) => (
                    <Chip key={category} variant="soft" size="sm">
                      {formatCategoryName(category)}
                    </Chip>
                  ))}
                </Stack>
              )}

              {/* Rating and contact */}
              <Stack direction="row" spacing={3} sx={{ mt: 2 }}>
                {placeData.rating && (
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Star fontSize="small" color="warning" />
                    <Typography level="body-sm">
                      {placeData.rating.toFixed(1)}
                      {placeData.review_count && ` (${placeData.review_count})`}
                    </Typography>
                  </Stack>
                )}

                {placeData.phone && (
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Phone fontSize="small" />
                    <Typography level="body-sm">{placeData.phone}</Typography>
                  </Stack>
                )}

                {placeData.website && (
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Language fontSize="small" />
                    <Typography
                      component="a"
                      href={placeData.website}
                      target="_blank"
                      level="body-sm"
                      sx={{ textDecoration: "none" }}
                    >
                      Website
                    </Typography>
                  </Stack>
                )}
              </Stack>
            </Box>

            {/* Action buttons */}
            <Stack direction="row" spacing={1}>
              <IconButton
                aria-label="Toggle favorite"
                variant={userInteraction?.is_favorite ? "solid" : "outlined"}
                color="danger"
                onClick={handleToggleFavorite}
                loading={isTogglingFavorite}
                disabled={isTogglingFavorite}
              >
                {userInteraction?.is_favorite ? (
                  <Favorite />
                ) : (
                  <FavoriteBorder />
                )}
              </IconButton>

              <IconButton
                aria-label="Mark as visited"
                variant={userInteraction?.is_visited ? "solid" : "outlined"}
                color="success"
                onClick={handleMarkVisited}
                loading={isMarkingVisited}
                disabled={isMarkingVisited}
              >
                {userInteraction?.is_visited ? (
                  <CheckCircle />
                ) : (
                  <RadioButtonUnchecked />
                )}
              </IconButton>
            </Stack>
          </Stack>

          {/* Visit info */}
          {userInteraction?.last_visited_at && (
            <Typography level="body-xs" sx={{ mt: 2, color: "text.secondary" }}>
              Last visited:{" "}
              {new Date(userInteraction.last_visited_at).toLocaleDateString()}
              {userInteraction.visit_count &&
                userInteraction.visit_count > 1 &&
                ` (${userInteraction.visit_count} times)`}
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* Tier lists this place belongs to */}
      <Box sx={{ mb: 3 }}>
        <ItemTierLists entityId={placeData.id} entityType="place" />
      </Box>

      {/* Content tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, value) => setActiveTab(value as number)}
      >
        <TabList>
          <Tab>
            Menu
            {menuItems.length > 0 && (
              <Chip size="sm" sx={{ ml: 1 }}>
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
            <Card>
              <CardContent sx={{ textAlign: "center", py: 4 }}>
                <Restaurant
                  sx={{ fontSize: 48, color: "text.secondary", mb: 2 }}
                />
                <Typography level="h4" sx={{ mb: 1 }}>
                  No menu discovered yet
                </Typography>
                <Typography level="body-md" sx={{ color: "text.secondary" }}>
                  You can scan a menu at this location using the "Menu Scanner"
                  tab above.
                </Typography>
              </CardContent>
            </Card>
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
                  {placeData.categories && placeData.categories.length > 0 && (
                    <Typography level="body-sm">
                      <strong>Categories:</strong>{" "}
                      {placeData.categories
                        .map((c: string) => formatCategoryName(c))
                        .join(", ")}
                    </Typography>
                  )}
                  {placeData.confidence && (
                    <Typography level="body-sm">
                      <strong>Data Confidence:</strong>{" "}
                      {(placeData.confidence * 100).toFixed(0)}%
                    </Typography>
                  )}
                  {placeData.price_level && (
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
                  {placeData.overture_id && (
                    <Typography level="body-sm">
                      <strong>Overture ID:</strong> {placeData.overture_id}
                    </Typography>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </TabPanel>
      </Tabs>

      <Snackbar
        open={errorMessage !== null}
        autoHideDuration={4000}
        onClose={() => setErrorMessage(null)}
        color="danger"
        variant="soft"
      >
        {errorMessage}
      </Snackbar>
    </Box>
  );
}
