"use client";

/**
 * `82450ad1:src/components/map/places/PlaceMenuItems.tsx`, restored.
 *
 * - Lines arrive adapted (`menuItemFrom`): the four per-type relations are one
 *   `matched_item` (G18), so sake and tea matches show too.
 * - "Add to Cellar" was an `alert()` over a dead mutation (§4,
 *   `ADD_MENU_ITEM_TO_CELLAR`). For a matched line it now opens the matched
 *   item's page, where adding to a cellar is real; an unmatched line has no
 *   item to add, so it shows no button rather than a pretend one, and its
 *   badge no longer promises that adding will create one.
 */

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
import NextLink from "next/link";
import { useState } from "react";
import {
  MdAdd,
  MdCheckCircle,
  MdCoffee,
  MdHelp,
  MdLocalBar,
  MdMonetizationOn,
  MdSportsBar,
  MdWineBar,
} from "react-icons/md";
import { type MenuItemView, matchedItemHref } from "../adapter";

// A menu line with its optional match suggestions (none are passed today,
// as none were by the old place query).
interface MenuItemWithSuggestions extends MenuItemView {
  item_match_suggestions?: Array<{
    id: string;
    confidence_score: number;
    match_reasoning?: string;
    suggested?: { id: string; name: string };
  }>;
}

interface PlaceMenuItemsProps {
  placeId: string;
  /** The old query's `$userId`; unused — the API knows the viewer. */
  userId?: string;
  menuItems: MenuItemWithSuggestions[];
}

export function PlaceMenuItems({
  placeId: _placeId,
  menuItems,
}: PlaceMenuItemsProps) {
  const [selectedItem, setSelectedItem] =
    useState<MenuItemWithSuggestions | null>(null);
  const unmaskedItems = menuItems;

  const getItemIcon = (type?: string | null) => {
    switch (type) {
      case "wine":
        return <MdWineBar />;
      case "beer":
        return <MdSportsBar />;
      case "spirit":
        return <MdLocalBar />;
      case "coffee":
        return <MdCoffee />;
      default:
        return <MdHelp />;
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

  const getMatchedItem = (item: MenuItemWithSuggestions) => item.matched_item;
  const addHref = (item: MenuItemWithSuggestions) =>
    item.matched_item ? matchedItemHref(item.matched_item) : null;

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
                                  <MdCheckCircle size={16} />
                                  Matched to: {matchedItem.name}
                                </Alert>
                              ) : suggestion ? (
                                <Alert color="warning" size="sm" sx={{ mt: 1 }}>
                                  <MdHelp size={16} />
                                  Suggested match:{" "}
                                  {suggestion.suggested?.name ?? "Unknown"} (
                                  {(suggestion.confidence_score * 100).toFixed(
                                    0,
                                  )}
                                  % confidence)
                                </Alert>
                              ) : (
                                <Alert color="neutral" size="sm" sx={{ mt: 1 }}>
                                  New item - not yet matched
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
                                <MdMonetizationOn
                                  size={20}
                                  style={{
                                    color: "var(--joy-palette-text-secondary)",
                                  }}
                                />
                                <Typography level="body-sm" fontWeight="lg">
                                  ${item.menu_item_price}
                                </Typography>
                              </Stack>
                            )}
                          </Stack>

                          {/* Action buttons */}
                          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                            {addHref(item) && (
                              <Button
                                size="sm"
                                startDecorator={<MdAdd />}
                                component={NextLink}
                                href={addHref(item) ?? ""}
                              >
                                Add to Cellar
                              </Button>
                            )}

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
                                {suggestion.suggested?.name ?? "Unknown"}
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

              {addHref(selectedItem) && (
                <Button
                  size="lg"
                  startDecorator={<MdAdd />}
                  component={NextLink}
                  href={addHref(selectedItem) ?? ""}
                  onClick={() => setSelectedItem(null)}
                >
                  Add to Cellar
                </Button>
              )}
            </Stack>
          )}
        </ModalDialog>
      </Modal>
    </>
  );
}
