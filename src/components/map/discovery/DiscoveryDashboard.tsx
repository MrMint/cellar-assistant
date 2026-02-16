"use client";

import {
  MdAccessTime,
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
import { useState } from "react";
import { useMutation, useQuery } from "urql";

// TODO: This component's GraphQL queries don't match the current database schema.
// The queries reference fields like `suggested_wine`, `match_reasoning`, `source_place`
// that don't exist in the current schema. This component needs a significant rewrite
// to work with the actual schema (item_match_suggestions uses `wine`, `beer`, etc.
// as relationship fields, not `suggested_*` prefixes).
// Using raw strings with type assertions until this is properly fixed.

// Type definitions for the expected data structure
interface DiscoverySuggestion {
  id: string;
  confidence_score: number;
  match_reasoning?: string;
  created_at: string;
  place_menu_item?: {
    id: string;
    menu_item_name: string;
    menu_item_description?: string;
    detected_item_type?: string;
    place: {
      id: string;
      name: string;
      primary_category?: string;
    };
  };
  suggested_wine?: {
    id: string;
    name: string;
    vintage?: string;
    variety?: string;
  };
  suggested_beer?: {
    id: string;
    name: string;
    brewery?: string;
    style?: string;
  };
  suggested_spirit?: {
    id: string;
    name: string;
    distillery?: string;
    age?: string;
  };
  suggested_coffee?: {
    id: string;
    name: string;
    roaster?: string;
    origin?: string;
  };
}

interface DiscoveryItem {
  id: string;
  created_at: string;
  source_type?: string;
  wine?: { id: string; name: string; vintage?: string; winery_id?: string };
  beer?: { id: string; name: string; brewery?: string; style?: string };
  spirit?: { id: string; name: string; distillery?: string; age?: string };
  coffee?: { id: string; name: string; roaster?: string; origin?: string };
  source_place?: {
    id: string;
    name: string;
    primary_category?: string;
  };
}

interface SavedPlaceInteraction {
  id: string;
  is_favorite?: boolean;
  is_visited?: boolean;
  last_visited_at?: string;
  visit_count?: number;
  notes?: string;
  updated_at: string;
  place: {
    id: string;
    name: string;
    primary_category?: string;
    categories?: string[];
    street_address?: string;
    locality?: string;
    rating?: number;
    place_menus_aggregate?: { aggregate?: { count?: number } };
    place_menu_items_aggregate?: { aggregate?: { count?: number } };
  };
}

interface DiscoveryData {
  item_match_suggestions?: DiscoverySuggestion[];
  recent_discoveries?: DiscoveryItem[];
  saved_places?: SavedPlaceInteraction[];
}

// GraphQL queries for the dashboard (raw strings - see TODO above)
const GET_DISCOVERY_DATA = `
  query GetDiscoveryData($userId: uuid!) {
    # Pending match suggestions
    item_match_suggestions(
      where: {
        place_menu_item: { place: { user_place_interactions: { user_id: { _eq: $userId } } } }
        accepted: { _is_null: true }
        rejected: { _is_null: true }
      }
      order_by: { confidence_score: desc }
      limit: 20
    ) {
      id
      confidence_score
      match_reasoning
      created_at
      place_menu_item {
        id
        menu_item_name
        menu_item_description
        detected_item_type
        place {
          id
          name
          primary_category
        }
      }
      suggested_wine { id name vintage variety }
      suggested_beer { id name brewery style }
      suggested_spirit { id name distillery age }
      suggested_coffee { id name roaster origin }
    }
    
    # Recent cellar additions from discoveries
    recent_discoveries: cellar_items(
      where: {
        user_id: { _eq: $userId }
        source_type: { _in: ["menu_discovery", "menu_scan"] }
      }
      order_by: { created_at: desc }
      limit: 20
    ) {
      id
      created_at
      source_type
      wine { id name vintage winery_id }
      beer { id name brewery style }
      spirit { id name distillery age }
      coffee { id name roaster origin }
      source_place {
        id
        name
        primary_category
      }
    }
    
    # Saved places (favorites and visited)
    saved_places: user_place_interactions(
      where: {
        user_id: { _eq: $userId }
        _or: [
          { is_favorite: { _eq: true } }
          { is_visited: { _eq: true } }
        ]
      }
      order_by: { updated_at: desc }
    ) {
      id
      is_favorite
      is_visited
      last_visited_at
      visit_count
      notes
      updated_at
      place {
        id
        name
        primary_category
        categories
        street_address
        locality
        rating
        place_menus_aggregate(where: { is_current: { _eq: true } }) {
          aggregate { count }
        }
        place_menu_items_aggregate {
          aggregate { count }
        }
      }
    }
  }
`;

const PROCESS_MATCH_SUGGESTION = `
  mutation ProcessMatchSuggestion($suggestionId: uuid!, $accept: Boolean!) {
    processMatchSuggestion(suggestionId: $suggestionId, accept: $accept) {
      success
      message
    }
  }
`;

interface DiscoveryDashboardProps {
  userId: string;
}

export function DiscoveryDashboard({ userId }: DiscoveryDashboardProps) {
  const [activeTab, setActiveTab] = useState(0);

  const [{ data, fetching, error }] = useQuery({
    query: GET_DISCOVERY_DATA,
    variables: { userId },
  });

  const [, processMatch] = useMutation(PROCESS_MATCH_SUGGESTION);

  // Cast data to DiscoveryData type (see TODO above about schema mismatch)
  const typedData = data as DiscoveryData | undefined;
  const pendingMatches: DiscoverySuggestion[] =
    typedData?.item_match_suggestions || [];
  const recentAdditions: DiscoveryItem[] = typedData?.recent_discoveries || [];
  const savedPlaces: SavedPlaceInteraction[] = typedData?.saved_places || [];

  const handleProcessMatch = async (suggestionId: string, accept: boolean) => {
    await processMatch({ suggestionId, accept });
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

  if (error) {
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
            Recent Additions
            {recentAdditions.length > 0 && (
              <Chip size="sm" sx={{ ml: 1 }}>
                {recentAdditions.length}
              </Chip>
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

                {pendingMatches.map((suggestion: DiscoverySuggestion) => {
                  const menuItem = suggestion.place_menu_item;
                  const suggestedItem =
                    suggestion.suggested_wine ||
                    suggestion.suggested_beer ||
                    suggestion.suggested_spirit ||
                    suggestion.suggested_coffee;

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
                                handleProcessMatch(suggestion.id, false)
                              }
                            >
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              color="success"
                              startDecorator={<MdCheck />}
                              onClick={() =>
                                handleProcessMatch(suggestion.id, true)
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

        {/* Recent Additions Tab */}
        <TabPanel value={1}>
          <Stack spacing={2}>
            {recentAdditions.length === 0 ? (
              <Card>
                <CardContent sx={{ textAlign: "center", py: 4 }}>
                  <MdRestaurant
                    size={48}
                    style={{
                      color: "var(--joy-palette-text-secondary)",
                      marginBottom: 16,
                    }}
                  />
                  <Typography level="h4">No discoveries yet</Typography>
                  <Typography level="body-md" sx={{ color: "text.secondary" }}>
                    Items you add from place menus and scans will appear here.
                  </Typography>
                </CardContent>
              </Card>
            ) : (
              recentAdditions.map((item: DiscoveryItem) => {
                const discoveredItem =
                  item.wine || item.beer || item.spirit || item.coffee;
                const itemType = item.wine
                  ? "wine"
                  : item.beer
                    ? "beer"
                    : item.spirit
                      ? "spirit"
                      : "coffee";

                // Skip rendering if no discovered item
                if (!discoveredItem) return null;

                return (
                  <Card key={item.id} variant="outlined">
                    <CardContent>
                      <Stack
                        direction="row"
                        spacing={2}
                        alignItems="flex-start"
                      >
                        {getItemIcon(itemType)}
                        <Box sx={{ flex: 1 }}>
                          <Typography level="title-md">
                            {discoveredItem.name}
                          </Typography>
                          {item.source_place && (
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
                                Discovered at {item.source_place.name}
                              </Typography>
                            </Stack>
                          )}
                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                            sx={{ mt: 0.5 }}
                          >
                            <MdAccessTime
                              size={20}
                              style={{
                                color: "var(--joy-palette-text-secondary)",
                              }}
                            />
                            <Typography
                              level="body-xs"
                              sx={{ color: "text.secondary" }}
                            >
                              Added{" "}
                              {new Date(item.created_at).toLocaleDateString()}
                            </Typography>
                            <Chip size="sm" variant="soft">
                              {(item.source_type ?? "unknown").replace(
                                "_",
                                " ",
                              )}
                            </Chip>
                          </Stack>
                        </Box>

                        <Button
                          size="sm"
                          variant="outlined"
                          startDecorator={<MdVisibility />}
                          href={`/${itemType}s/${discoveredItem.id}`}
                        >
                          View Item
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </Stack>
        </TabPanel>

        {/* Saved Places Tab */}
        <TabPanel value={2}>
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
                const menuItemsCount =
                  place.place_menu_items_aggregate?.aggregate?.count ?? 0;

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
                                {new Date(
                                  interaction.last_visited_at,
                                ).toLocaleDateString()}
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
