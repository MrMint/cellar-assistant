"use client";

import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Typography,
} from "@mui/joy";
import NextLink from "next/link";
import { useState } from "react";
import {
  MdCheck,
  MdClose,
  MdCoffee,
  MdFavorite,
  MdLocalBar,
  MdLocationOn,
  MdRestaurant,
  MdSportsBar,
  MdVisibility,
  MdWineBar,
} from "react-icons/md";
import { useMutation, useQuery } from "urql";
import { Timestamp } from "@/components/common/Timestamp";
import { failureFromTransport, unwrapResult } from "@/lib/api/result";
import { suggestionFrom } from "../adapter";
import {
  ActOnSuggestionMutation,
  DiscoveryDataQuery,
  SAVED_PLACES_PAGE_SIZE,
  SUGGESTIONS_PAGE_SIZE,
} from "../queries";

/*
 * `82450ad1:src/components/map/discovery/DiscoveryDashboard.tsx`, restored.
 *
 * The old component's raw-string queries named fields the schema never had
 * and a `processMatchSuggestion` that did not exist, so in production the
 * page always showed its error (§4). Its design is restored over the API:
 *
 * - Pending Matches: `myDiscoveries` — suggestions from the viewer's **own**
 *   scans (the old query reached other users' scans through any place the
 *   viewer had touched: a disclosure leak), with the line and place (G20);
 *   Accept / Reject → `actOnMenuScanSuggestion`.
 * - Saved Places: `myPlaceInteractions` filtered to favourite-or-visited, as
 *   the old `_or` did, with each place (G16) and its menu-line count.
 * - Recent Additions is **not restored**: it read `cellar_items` by
 *   `source_type in (menu_discovery, menu_scan)` across the viewer's cellars,
 *   and the API has no viewer-level query for that (G22).
 */

interface DiscoverySuggestion {
  id: string;
  menu_scan_id: string | null;
  confidence_score: number;
  match_reasoning?: string;
  place_menu_item?: {
    id: string;
    menu_item_name: string;
    menu_item_description?: string;
    detected_item_type?: string;
    place: { id: string; name: string; primary_category?: string };
  };
  suggested?: { id: string; name: string };
}

interface SavedPlaceInteraction {
  id: string;
  is_favorite?: boolean;
  is_visited?: boolean;
  last_visited_at?: string;
  visit_count?: number;
  place: {
    id: string;
    name: string;
    primary_category?: string;
    categories?: string[];
    street_address?: string;
    locality?: string;
    rating?: number;
    menu_items_count: number;
  };
}

interface DiscoveryDashboardProps {
  /** The old query's `$userId`; unused — the API knows the viewer. */
  userId?: string;
}

export function DiscoveryDashboard(_props: DiscoveryDashboardProps) {
  const [activeTab, setActiveTab] = useState(0);

  const [{ data, fetching, error }, reexecute] = useQuery({
    query: DiscoveryDataQuery,
    variables: {
      suggestions: SUGGESTIONS_PAGE_SIZE,
      places: SAVED_PLACES_PAGE_SIZE,
    },
  });

  const [, actOnSuggestion] = useMutation(ActOnSuggestionMutation);
  const [actionError, setActionError] = useState<string | null>(null);

  const discoveries = unwrapResult(
    data?.myDiscoveries,
    "MatchSuggestionConnection",
  );
  const interactions = unwrapResult(
    data?.myPlaceInteractions,
    "PlaceInteractionConnection",
  );
  const pendingMatches: DiscoverySuggestion[] = discoveries.ok
    ? discoveries.data.edges
        .map((edge) => edge.node)
        .filter((node) => node.accepted == null && node.rejected == null)
        .map((node) => {
          const view = suggestionFrom(node);
          const line = node.placeMenuItem;
          return {
            id: view.id,
            menu_scan_id: view.menu_scan_id,
            confidence_score: view.confidence_score,
            match_reasoning: view.match_reasoning ?? undefined,
            place_menu_item: {
              id: line?.id ?? view.place_menu_item_id,
              menu_item_name: line?.name ?? view.menu_item_name,
              menu_item_description: line?.description ?? undefined,
              detected_item_type: line?.detectedItemType ?? undefined,
              place: {
                id: node.place.id,
                name: node.place.name,
                primary_category: node.place.primaryCategory ?? undefined,
              },
            },
            suggested: view.suggested ?? undefined,
          };
        })
    : [];
  const savedPlaces: SavedPlaceInteraction[] = interactions.ok
    ? interactions.data.edges
        .map((edge) => edge.node)
        .filter((node) => node.isFavorite || node.isVisited)
        .map((node) => ({
          id: node.id,
          is_favorite: node.isFavorite,
          is_visited: node.isVisited,
          last_visited_at: node.lastVisitedAt ?? undefined,
          visit_count: node.visitCount,
          place: {
            id: node.place.id,
            name: node.place.name,
            primary_category: node.place.primaryCategory ?? undefined,
            categories: [...node.place.categories],
            street_address: node.place.streetAddress ?? undefined,
            locality: node.place.locality ?? undefined,
            rating: node.place.rating ?? undefined,
            menu_items_count: node.place.menuItems.totalCount ?? 0,
          },
        }))
    : [];

  const handleProcessMatch = async (
    suggestion: DiscoverySuggestion,
    accept: boolean,
  ) => {
    if (!suggestion.menu_scan_id) return;
    setActionError(null);
    const response = await actOnSuggestion({
      menuScanId: suggestion.menu_scan_id,
      input: {
        suggestionId: suggestion.id,
        action: accept ? "ACCEPT" : "REJECT",
      },
    });
    if (response.error) {
      setActionError(failureFromTransport(response.error).message);
      return;
    }
    const result = unwrapResult(
      response.data?.actOnMenuScanSuggestion,
      "MatchSuggestionActionPayload",
    );
    if (!result.ok) {
      setActionError(result.error.message);
      return;
    }
    reexecute({ requestPolicy: "network-only" });
  };

  const getItemIcon = (type?: string) => {
    switch (type) {
      case "wine":
        return <MdWineBar style={{ color: "var(--joy-palette-danger-500)" }} />;
      case "beer":
        return (
          <MdSportsBar style={{ color: "var(--joy-palette-warning-500)" }} />
        );
      case "spirit":
        return (
          <MdLocalBar style={{ color: "var(--joy-palette-neutral-500)" }} />
        );
      case "coffee":
        return <MdCoffee style={{ color: "var(--joy-palette-success-500)" }} />;
      default:
        return <MdRestaurant />;
    }
  };

  if (fetching) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || (data !== undefined && (!discoveries.ok || !interactions.ok))) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert color="danger">Failed to load discovery data</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 0 }}>
      <Tabs
        value={activeTab}
        onChange={(_, value) => setActiveTab(value as number)}
      >
        <TabList>
          <Tab>
            Pending Matches
            {pendingMatches.length > 0 && (
              <Badge
                badgeContent={pendingMatches.length}
                color="warning"
                sx={{ ml: 1 }}
              />
            )}
          </Tab>
          <Tab>
            Saved Places
            {savedPlaces.length > 0 && (
              <Chip size="sm" sx={{ ml: 1 }}>
                {savedPlaces.length}
              </Chip>
            )}
          </Tab>
        </TabList>

        {/* Pending Matches Tab */}
        <TabPanel value={0}>
          <Stack spacing={3}>
            {pendingMatches.length === 0 ? (
              <Card>
                <CardContent sx={{ textAlign: "center", py: 4 }}>
                  <MdCheck
                    size={48}
                    style={{
                      color: "var(--joy-palette-success-500)",
                      marginBottom: 16,
                    }}
                  />
                  <Typography level="h4">All caught up!</Typography>
                  <Typography level="body-md" sx={{ color: "text.secondary" }}>
                    No pending matches to review right now.
                  </Typography>
                </CardContent>
              </Card>
            ) : (
              <>
                <Alert color="primary">
                  <Typography level="body-sm">
                    Review these AI-suggested matches for menu items. Accept
                    good matches to link items to your database, or reject to
                    keep them as standalone discoveries.
                  </Typography>
                </Alert>

                {actionError && (
                  <Alert color="danger" size="sm">
                    {actionError}
                  </Alert>
                )}
                {pendingMatches.map((suggestion: DiscoverySuggestion) => {
                  const menuItem = suggestion.place_menu_item;
                  const suggestedItem = suggestion.suggested;

                  // Skip rendering if required data is missing
                  if (!menuItem || !suggestedItem) return null;

                  return (
                    <Card key={suggestion.id} variant="outlined">
                      <CardContent>
                        <Stack spacing={2}>
                          <Stack
                            direction="row"
                            spacing={2}
                            alignItems="flex-start"
                          >
                            {getItemIcon(menuItem.detected_item_type)}
                            <Box sx={{ flex: 1 }}>
                              <Typography level="title-md">
                                {menuItem.menu_item_name}
                              </Typography>
                              <Stack
                                direction="row"
                                spacing={1}
                                alignItems="center"
                                sx={{ mt: 0.5 }}
                              >
                                <MdLocationOn
                                  size={20}
                                  style={{
                                    color: "var(--joy-palette-text-secondary)",
                                  }}
                                />
                                <Typography
                                  level="body-sm"
                                  sx={{ color: "text.secondary" }}
                                >
                                  {menuItem.place.name}
                                </Typography>
                              </Stack>
                              {menuItem.menu_item_description && (
                                <Typography
                                  level="body-sm"
                                  sx={{ mt: 1, color: "text.secondary" }}
                                >
                                  {menuItem.menu_item_description}
                                </Typography>
                              )}
                            </Box>

                            <Chip color="warning" variant="soft" size="sm">
                              {(suggestion.confidence_score * 100).toFixed(0)}%
                              match
                            </Chip>
                          </Stack>

                          <Alert color="neutral" size="sm">
                            <Typography level="body-sm">
                              <strong>Suggested match:</strong>{" "}
                              {suggestedItem.name}
                              {suggestion.match_reasoning && (
                                <>
                                  <br />
                                  <em>{suggestion.match_reasoning}</em>
                                </>
                              )}
                            </Typography>
                          </Alert>

                          <Stack
                            direction="row"
                            spacing={1}
                            justifyContent="flex-end"
                          >
                            <Button
                              size="sm"
                              variant="outlined"
                              startDecorator={<MdVisibility />}
                              component={NextLink}
                              href={`/places/${menuItem.place.id}`}
                            >
                              View Place
                            </Button>
                            <Button
                              size="sm"
                              color="danger"
                              variant="outlined"
                              startDecorator={<MdClose />}
                              onClick={() =>
                                handleProcessMatch(suggestion, false)
                              }
                            >
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              color="success"
                              startDecorator={<MdCheck />}
                              onClick={() =>
                                handleProcessMatch(suggestion, true)
                              }
                            >
                              Accept Match
                            </Button>
                          </Stack>
                        </Stack>
                      </CardContent>
                    </Card>
                  );
                })}
              </>
            )}
          </Stack>
        </TabPanel>

        {/* Saved Places Tab */}
        <TabPanel value={1}>
          <Stack spacing={2}>
            {savedPlaces.length === 0 ? (
              <Card>
                <CardContent sx={{ textAlign: "center", py: 4 }}>
                  <MdFavorite
                    size={48}
                    style={{
                      color: "var(--joy-palette-text-secondary)",
                      marginBottom: 16,
                    }}
                  />
                  <Typography level="h4">No saved places</Typography>
                  <Typography level="body-md" sx={{ color: "text.secondary" }}>
                    Places you favorite or visit will appear here.
                  </Typography>
                </CardContent>
              </Card>
            ) : (
              savedPlaces.map((interaction: SavedPlaceInteraction) => {
                const place = interaction.place;
                const menuItemsCount = place.menu_items_count;

                return (
                  <Card key={interaction.id} variant="outlined">
                    <CardContent>
                      <Stack
                        direction="row"
                        spacing={2}
                        alignItems="flex-start"
                      >
                        <Box sx={{ flex: 1 }}>
                          <Stack
                            direction="row"
                            alignItems="center"
                            spacing={1}
                          >
                            <Typography level="title-md">
                              {place.name}
                            </Typography>
                            {interaction.is_favorite && (
                              <MdFavorite
                                size={16}
                                style={{
                                  color: "var(--joy-palette-danger-500)",
                                }}
                              />
                            )}
                          </Stack>

                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                            sx={{ mt: 0.5 }}
                          >
                            <MdLocationOn
                              size={20}
                              style={{
                                color: "var(--joy-palette-text-secondary)",
                              }}
                            />
                            <Typography
                              level="body-sm"
                              sx={{ color: "text.secondary" }}
                            >
                              {place.street_address}, {place.locality}
                            </Typography>
                          </Stack>

                          <Stack
                            direction="row"
                            spacing={1}
                            sx={{ mt: 1, flexWrap: "wrap" }}
                          >
                            {place.categories
                              ?.slice(0, 3)
                              .map((category: string) => (
                                <Chip key={category} size="sm" variant="soft">
                                  {category}
                                </Chip>
                              ))}
                          </Stack>

                          <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                            {menuItemsCount > 0 && (
                              <Typography
                                level="body-xs"
                                sx={{ color: "success.600" }}
                              >
                                {menuItemsCount} menu items discovered
                              </Typography>
                            )}
                            {interaction.last_visited_at && (
                              <Typography
                                level="body-xs"
                                sx={{ color: "text.secondary" }}
                              >
                                Visited{" "}
                                <Timestamp
                                  iso={interaction.last_visited_at}
                                  precision="date"
                                />
                                {(interaction.visit_count ?? 0) > 1 &&
                                  ` (${interaction.visit_count}x)`}
                              </Typography>
                            )}
                          </Stack>
                        </Box>

                        <Button
                          size="sm"
                          variant="outlined"
                          startDecorator={<MdVisibility />}
                          component={NextLink}
                          href={`/places/${place.id}`}
                        >
                          View Details
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </Stack>
        </TabPanel>
      </Tabs>
    </Box>
  );
}
