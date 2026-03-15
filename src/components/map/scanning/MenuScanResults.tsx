"use client";

import {
  MdArrowBack,
  MdCheckCircle,
  MdError,
  MdHelp,
  MdMonetizationOn,
} from "react-icons/md";
import { ItemTypeIcon } from "@/components/common/ItemTypeIcon";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/joy";
import NextLink from "next/link";
import { useEffect, useState } from "react";
import type { MenuScanFullResult } from "@/app/actions/menuScanning";
import { getScanResults } from "@/app/actions/menuScanning";

interface MenuScanResultsProps {
  scanId: string;
}

const getItemIcon = (type?: string | null) => {
  const upper = type?.toUpperCase();
  switch (upper) {
    case "BEER":
    case "WINE":
    case "SPIRIT":
    case "COFFEE":
    case "SAKE":
      return <ItemTypeIcon type={upper} />;
    default:
      return <MdHelp />;
  }
};

const getItemTypeColor = (
  type?: string | null,
): "danger" | "warning" | "neutral" | "success" => {
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

const getStatusColor = (
  status: string,
): "success" | "warning" | "danger" | "neutral" => {
  switch (status) {
    case "completed":
      return "success";
    case "processing":
      return "warning";
    case "failed":
      return "danger";
    default:
      return "neutral";
  }
};

export function MenuScanResults({ scanId }: MenuScanResultsProps) {
  const [result, setResult] = useState<MenuScanFullResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await getScanResults(scanId);
        if (!data) {
          setError("Scan not found");
        } else {
          setResult(data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load results");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [scanId]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !result) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert color="danger" startDecorator={<MdError />}>
          {error || "Scan not found"}
        </Alert>
      </Box>
    );
  }

  const { scan, items } = result;

  // Group items by category
  const itemsByCategory = items.reduce(
    (acc, item) => {
      const category = item.menu_category || "Other";
      if (!acc[category]) acc[category] = [];
      acc[category].push(item);
      return acc;
    },
    {} as Record<string, MenuScanFullResult["items"]>,
  );

  const avgConfidence =
    items.length > 0
      ? items.reduce((sum, i) => sum + (i.confidence_score ?? 0), 0) /
        items.length
      : 0;

  return (
    <Stack spacing={3}>
      {/* Summary Card */}
      <Card>
        <CardContent>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="flex-start"
          >
            <Box>
              <Typography level="h3">Scan Results</Typography>
              {scan.place && (
                <Typography level="body-md" sx={{ color: "text.secondary" }}>
                  {scan.place.name}
                </Typography>
              )}
              {scan.scanned_at && (
                <Typography level="body-xs" sx={{ color: "text.secondary" }}>
                  Scanned {new Date(scan.scanned_at).toLocaleDateString()}
                </Typography>
              )}
            </Box>
            <Chip
              variant="solid"
              color={getStatusColor(scan.processing_status)}
              size="sm"
            >
              {scan.processing_status}
            </Chip>
          </Stack>

          <Stack direction="row" spacing={3} sx={{ mt: 2 }}>
            <Typography level="body-sm">
              <strong>{scan.items_detected ?? 0}</strong> items detected
            </Typography>
            {avgConfidence > 0 && (
              <Typography level="body-sm">
                <strong>{(avgConfidence * 100).toFixed(0)}%</strong> avg
                confidence
              </Typography>
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* Items by Category */}
      {items.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: "center", py: 4 }}>
            <Typography level="body-md" sx={{ color: "text.secondary" }}>
              No items were extracted from this scan.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        Object.entries(itemsByCategory).map(([category, categoryItems]) => (
          <Box key={category}>
            <Typography level="h4" sx={{ mb: 2 }}>
              {category}
            </Typography>

            <Stack spacing={2}>
              {categoryItems.map((item) => {
                const matchedItem =
                  item.wine || item.beer || item.spirit || item.coffee;

                return (
                  <Card key={item.id} variant="outlined">
                    <CardContent>
                      <Stack
                        direction="row"
                        spacing={2}
                        alignItems="flex-start"
                      >
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

                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Stack
                            direction="row"
                            alignItems="flex-start"
                            justifyContent="space-between"
                          >
                            <Box sx={{ flex: 1 }}>
                              <Typography level="title-md">
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

                              {matchedItem ? (
                                <Alert color="success" size="sm" sx={{ mt: 1 }}>
                                  <MdCheckCircle size={16} />
                                  Matched to: {matchedItem.name}
                                </Alert>
                              ) : (
                                <Alert color="neutral" size="sm" sx={{ mt: 1 }}>
                                  New item - not yet matched
                                </Alert>
                              )}

                              {item.confidence_score != null && (
                                <Typography
                                  level="body-xs"
                                  sx={{ mt: 0.5, color: "text.secondary" }}
                                >
                                  Detection confidence:{" "}
                                  {(item.confidence_score * 100).toFixed(0)}%
                                </Typography>
                              )}
                            </Box>

                            {item.menu_item_price != null && (
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
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>
          </Box>
        ))
      )}

      {/* Back button */}
      {scan.place && (
        <Button
          variant="outlined"
          startDecorator={<MdArrowBack />}
          component={NextLink}
          href={`/map?placeId=${scan.place_id}`}
        >
          Back to {scan.place.name}
        </Button>
      )}
    </Stack>
  );
}
