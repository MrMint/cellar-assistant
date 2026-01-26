"use client";

import { type FragmentOf, readFragment } from "@cellar-assistant/shared/gql";
import {
  Add,
  CheckCircle,
  Coffee,
  Help,
  LocalBar,
  MonetizationOn,
  SportsBar,
  WineBar,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Typography,
} from "@mui/joy";
import { useMemo, useState } from "react";
import { useMutation } from "urql";
import { PlaceMenuItemFragment } from "../../shared/fragments/place-fragments";
import { ADD_MENU_ITEM_TO_CELLAR } from "../queries";

// Explicit interface for unmasked menu item data
interface UnmaskedMenuItem {
  id: string;
  menu_item_name: string;
  menu_item_description: string | null;
  menu_item_price: number | null;
  menu_category: string | null;
  detected_item_type: string | null;
  confidence_score: number | null;
  is_available: boolean | null;
  created_at: string;
  extracted_attributes: Record<string, unknown> | null;
  wine: {
    id: string;
    name: string;
    vintage: string | null;
    variety: string | null;
  } | null;
  beer: { id: string; name: string; style: string | null } | null;
  spirit: { id: string; name: string } | null;
  coffee: { id: string; name: string } | null;
}

// Type for menu items with optional match suggestions (added by parent query)
interface MenuItemWithSuggestions extends UnmaskedMenuItem {
  item_match_suggestions?: Array<{
    id: string;
    confidence_score: number;
    match_reasoning?: string;
    suggested_wine?: { id: string; name: string };
    suggested_beer?: { id: string; name: string };
    suggested_spirit?: { id: string; name: string };
    suggested_coffee?: { id: string; name: string };
  }>;
}

// Props accept either masked fragment data or explicit data
type MenuItem = FragmentOf<typeof PlaceMenuItemFragment> & {
  item_match_suggestions?: MenuItemWithSuggestions["item_match_suggestions"];
};

interface PlaceMenuItemsProps {
  placeId: string;
  userId: string;
  menuItems: MenuItem[];
}

// Helper to unmask a menu item
function unmaskMenuItem(item: MenuItem): MenuItemWithSuggestions {
  const unmasked = readFragment(PlaceMenuItemFragment, item);
  return {
    ...unmasked,
    // Cast extracted_attributes from unknown to our expected type
    extracted_attributes: unmasked.extracted_attributes as Record<
      string,
      unknown
    > | null,
    item_match_suggestions: item.item_match_suggestions,
  } as MenuItemWithSuggestions;
}

export function PlaceMenuItems({
  placeId,
  userId,
  menuItems,
}: PlaceMenuItemsProps) {
  const [selectedItem, setSelectedItem] =
    useState<MenuItemWithSuggestions | null>(null);
  const [, _addToCellar] = useMutation(ADD_MENU_ITEM_TO_CELLAR);

  // Memoize unmasked menu items to prevent unnecessary re-unmasking on re-renders
  const unmaskedItems = useMemo(
    () => menuItems.map(unmaskMenuItem),
    [menuItems],
  );

  const getItemIcon = (type?: string | null) => {
    switch (type) {
      case "wine":
        return <WineBar />;
      case "beer":
        return <SportsBar />;
      case "spirit":
        return <LocalBar />;
      case "coffee":
        return <Coffee />;
      default:
        return <Help />;
    }
  };

  const getItemTypeColor = (type?: string | null) => {
    switch (type) {
      case "wine":
        return "danger";
      case "beer":
        return "warning";
      case "spirit":
        return "neutral";
      case "coffee":
        return "success";
      default:
        return "neutral";
    }
  };

  const getMatchedItem = (item: MenuItemWithSuggestions) => {
    return item.wine || item.beer || item.spirit || item.coffee;
  };

  const handleAddToCellar = async (item: MenuItemWithSuggestions) => {
    if (!userId) return;

    // TODO: Let user choose cellar - for now we'll just show success message
    // In a real implementation, you'd show a cellar picker modal
    try {
      // TODO: Implement actual add to cellar functionality
      alert(`"${item.menu_item_name}" would be added to your cellar!`);
    } catch {
      // Error handling - silently fail for now
    }
  };

  const handleViewDetails = (item: MenuItemWithSuggestions) => {
    setSelectedItem(item);
  };

  if (unmaskedItems.length === 0) {
    return (
      <Card>
        <CardContent sx={{ textAlign: "center", py: 4 }}>
          <Typography level="body-md" sx={{ color: "text.secondary" }}>
            No menu items available
          </Typography>
        </CardContent>
      </Card>
    );
  }

  // Group items by category
  const itemsByCategory = unmaskedItems.reduce(
    (acc, item) => {
      const category = item.menu_category || "Other";
      if (!acc[category]) acc[category] = [];
      acc[category].push(item);
      return acc;
    },
    {} as Record<string, MenuItemWithSuggestions[]>,
  );

  return (
    <>
      <Stack spacing={3}>
        {Object.entries(itemsByCategory).map(([category, items]) => (
          <Box key={category}>
            <Typography level="h4" sx={{ mb: 2 }}>
              {category}
            </Typography>

            <Stack spacing={2}>
              {items.map((item) => {
                const matchedItem = getMatchedItem(item);
                const suggestion = item.item_match_suggestions?.[0];

                return (
                  <Card key={item.id} variant="outlined">
                    <CardContent>
                      <Stack
                        direction="row"
                        spacing={2}
                        alignItems="flex-start"
                      >
                        {/* Item icon */}
                        <Box
                          sx={{
                            p: 1,
                            borderRadius: "sm",
                            backgroundColor: `${getItemTypeColor(item.detected_item_type)}.100`,
                            color: `${getItemTypeColor(item.detected_item_type)}.600`,
                            flexShrink: 0,
                          }}
                        >
                          {getItemIcon(item.detected_item_type)}
                        </Box>

                        {/* Item details */}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Stack
                            direction="row"
                            alignItems="flex-start"
                            justifyContent="space-between"
                          >
                            <Box sx={{ flex: 1 }}>
                              <Typography level="title-md" noWrap>
                                {item.menu_item_name}
                              </Typography>

                              {item.menu_item_description && (
                                <Typography
                                  level="body-sm"
                                  sx={{ color: "text.secondary", mt: 0.5 }}
                                >
                                  {item.menu_item_description}
                                </Typography>
                              )}

                              {/* Extracted attributes */}
                              {item.extracted_attributes &&
                                Object.keys(item.extracted_attributes).length >
                                  0 && (
                                  <Stack
                                    direction="row"
                                    spacing={1}
                                    sx={{ mt: 1, flexWrap: "wrap" }}
                                  >
                                    {Object.entries(
                                      item.extracted_attributes,
                                    ).map(([key, value]) => (
                                      <Chip key={key} size="sm" variant="soft">
                                        {key}: {String(value)}
                                      </Chip>
                                    ))}
                                  </Stack>
                                )}

                              {/* Match status */}
                              {matchedItem ? (
                                <Alert color="success" size="sm" sx={{ mt: 1 }}>
                                  <CheckCircle sx={{ fontSize: 16 }} />
                                  Matched to: {matchedItem.name}
                                </Alert>
                              ) : suggestion ? (
                                <Alert color="warning" size="sm" sx={{ mt: 1 }}>
                                  <Help sx={{ fontSize: 16 }} />
                                  Suggested match:{" "}
                                  {(suggestion.suggested_wine?.name ||
                                    suggestion.suggested_beer?.name ||
                                    suggestion.suggested_spirit?.name ||
                                    suggestion.suggested_coffee?.name) ??
                                    "Unknown"}{" "}
                                  (
                                  {(suggestion.confidence_score * 100).toFixed(
                                    0,
                                  )}
                                  % confidence)
                                </Alert>
                              ) : (
                                <Alert color="neutral" size="sm" sx={{ mt: 1 }}>
                                  New item - will be created when added
                                </Alert>
                              )}
                            </Box>

                            {/* Price */}
                            {item.menu_item_price && (
                              <Stack
                                direction="row"
                                alignItems="center"
                                spacing={0.5}
                              >
                                <MonetizationOn
                                  fontSize="small"
                                  sx={{ color: "text.secondary" }}
                                />
                                <Typography level="body-sm" fontWeight="lg">
                                  ${item.menu_item_price}
                                </Typography>
                              </Stack>
                            )}
                          </Stack>

                          {/* Action buttons */}
                          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                            <Button
                              size="sm"
                              startDecorator={<Add />}
                              onClick={() => handleAddToCellar(item)}
                            >
                              Add to Cellar
                            </Button>

                            <Button
                              size="sm"
                              variant="outlined"
                              onClick={() => handleViewDetails(item)}
                            >
                              View Details
                            </Button>
                          </Stack>
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>
          </Box>
        ))}
      </Stack>

      {/* Item details modal */}
      <Modal open={!!selectedItem} onClose={() => setSelectedItem(null)}>
        <ModalDialog size="lg" sx={{ maxWidth: 600 }}>
          <ModalClose />
          {selectedItem && (
            <Stack spacing={3}>
              <Typography level="h3">{selectedItem.menu_item_name}</Typography>

              {selectedItem.menu_item_description && (
                <Typography level="body-md">
                  {selectedItem.menu_item_description}
                </Typography>
              )}

              <Divider />

              <Stack spacing={2}>
                <Typography level="title-md">Item Analysis</Typography>

                <Stack direction="row" spacing={2}>
                  <Typography level="body-sm">
                    <strong>Detected Type:</strong>{" "}
                    {selectedItem.detected_item_type || "Unknown"}
                  </Typography>
                  {selectedItem.confidence_score && (
                    <Typography level="body-sm">
                      <strong>Confidence:</strong>{" "}
                      {(selectedItem.confidence_score * 100).toFixed(0)}%
                    </Typography>
                  )}
                </Stack>

                {selectedItem.extracted_attributes && (
                  <Box>
                    <Typography level="body-sm" fontWeight="lg">
                      Extracted Attributes:
                    </Typography>
                    <Stack spacing={1} sx={{ mt: 1 }}>
                      {Object.entries(selectedItem.extracted_attributes).map(
                        ([key, value]) => (
                          <Typography key={key} level="body-sm">
                            <strong>{key}:</strong> {String(value)}
                          </Typography>
                        ),
                      )}
                    </Stack>
                  </Box>
                )}
              </Stack>

              {selectedItem.item_match_suggestions &&
                selectedItem.item_match_suggestions.length > 0 && (
                  <>
                    <Divider />
                    <Stack spacing={2}>
                      <Typography level="title-md">
                        Match Suggestions
                      </Typography>
                      {selectedItem.item_match_suggestions.map((suggestion) => (
                        <Card key={suggestion.id} variant="outlined">
                          <CardContent>
                            <Stack spacing={1}>
                              <Typography level="body-sm">
                                <strong>Suggested Match:</strong>{" "}
                                {(suggestion.suggested_wine?.name ||
                                  suggestion.suggested_beer?.name ||
                                  suggestion.suggested_spirit?.name ||
                                  suggestion.suggested_coffee?.name) ??
                                  "Unknown"}
                              </Typography>
                              <Typography level="body-sm">
                                <strong>Confidence:</strong>{" "}
                                {(suggestion.confidence_score * 100).toFixed(0)}
                                %
                              </Typography>
                              {suggestion.match_reasoning && (
                                <Typography
                                  level="body-xs"
                                  sx={{ color: "text.secondary" }}
                                >
                                  {suggestion.match_reasoning}
                                </Typography>
                              )}
                            </Stack>
                          </CardContent>
                        </Card>
                      ))}
                    </Stack>
                  </>
                )}

              <Button
                size="lg"
                startDecorator={<Add />}
                onClick={() => {
                  handleAddToCellar(selectedItem);
                  setSelectedItem(null);
                }}
              >
                Add to Cellar
              </Button>
            </Stack>
          )}
        </ModalDialog>
      </Modal>
    </>
  );
}
