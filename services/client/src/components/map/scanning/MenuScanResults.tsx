"use client";

/**
 * `82450ad1:src/components/map/scanning/MenuScanResults.tsx`, restored.
 *
 * - `getScanResults` (scan + `place_menu_items(where menu_scan_id)`) →
 *   `menuScan(id:)` with every extracted line (`MenuScan.menuItems`, G19) and
 *   each line's matched item (G18) — sake and tea matches included.
 * - Kept from D5: a line's pending AI suggestion shows under it with Accept /
 *   Reject (`actOnMenuScanSuggestion`), in the old "Suggested match" alert;
 *   a failed scan shows the API's one-sentence `processingError`; while the
 *   scan is still processing the page re-reads every 15 s (no subscriptions).
 * - "Not found" and "not yours" are one state (§1.6), as before.
 */

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
import { useEffect, useMemo, useState } from "react";
import {
  MdArrowBack,
  MdCheck,
  MdCheckCircle,
  MdClose,
  MdError,
  MdHelp,
  MdMonetizationOn,
} from "react-icons/md";
import { useMutation, useQuery } from "urql";
import { ItemTypeIcon } from "@/components/common/ItemTypeIcon";
import { Timestamp } from "@/components/common/Timestamp";
import { failureFromTransport, unwrapResult } from "@/lib/api/result";
import {
  type MenuItemView,
  matchedItemHref,
  menuItemFrom,
  type SuggestionView,
  suggestionFrom,
} from "../adapter";
import {
  ActOnSuggestionMutation,
  MENU_ITEMS_PAGE_SIZE,
  ScanResultsQuery,
  SUGGESTIONS_PAGE_SIZE,
} from "../queries";

const POLL_INTERVAL_MS = 15_000;

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
    case "TEA":
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
  const [{ data, fetching, error: transportError }, reexecute] = useQuery({
    query: ScanResultsQuery,
    variables: {
      id: scanId,
      menuItems: MENU_ITEMS_PAGE_SIZE,
      suggestions: SUGGESTIONS_PAGE_SIZE,
    },
  });
  const [, actOnSuggestion] = useMutation(ActOnSuggestionMutation);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const result = useMemo(
    () => unwrapResult(data?.menuScan, "MenuScan"),
    [data],
  );
  const scanNode = result.ok ? result.data : null;
  const status = scanNode?.processingStatus;

  // No subscriptions: re-read while the pipeline is still working.
  useEffect(() => {
    if (status !== "pending" && status !== "processing") return;
    const timer = setInterval(
      () => reexecute({ requestPolicy: "network-only" }),
      POLL_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, [status, reexecute]);

  if (fetching && !scanNode) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const error = transportError
    ? failureFromTransport(transportError).message
    : !result.ok && data !== undefined && result.error.code !== "NOT_FOUND"
      ? result.error.message
      : null;

  if (error || !scanNode) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert color="danger" startDecorator={<MdError />}>
          {error || "Scan not found"}
        </Alert>
      </Box>
    );
  }

  const scan = {
    id: scanNode.id,
    processing_status: scanNode.processingStatus,
    processing_error: scanNode.processingError ?? null,
    items_detected: scanNode.itemsDetected,
    place_id: scanNode.placeId ?? null,
    place: scanNode.place
      ? { id: scanNode.place.id, name: scanNode.place.name }
      : null,
    scanned_at: scanNode.scannedAt ?? null,
  };
  const items: MenuItemView[] = scanNode.menuItems.edges.map((edge) =>
    menuItemFrom(edge.node),
  );
  const pendingByLine = new Map<string, SuggestionView>();
  for (const edge of scanNode.suggestions.edges) {
    const suggestion = suggestionFrom(edge.node);
    if (suggestion.pending && !pendingByLine.has(suggestion.place_menu_item_id))
      pendingByLine.set(suggestion.place_menu_item_id, suggestion);
  }

  const handleSuggestion = async (
    suggestion: SuggestionView,
    action: "ACCEPT" | "REJECT",
  ) => {
    setActingOn(suggestion.id);
    setActionError(null);
    const response = await actOnSuggestion({
      menuScanId: scan.id,
      input: { suggestionId: suggestion.id, action },
    });
    setActingOn(null);
    const acted = response.error
      ? {
          ok: false as const,
          message: failureFromTransport(response.error).message,
        }
      : (() => {
          const r = unwrapResult(
            response.data?.actOnMenuScanSuggestion,
            "MatchSuggestionActionPayload",
          );
          return r.ok
            ? { ok: true as const }
            : { ok: false as const, message: r.error.message };
        })();
    if (!acted.ok) {
      setActionError(acted.message);
      return;
    }
    reexecute({ requestPolicy: "network-only" });
  };

  // Group items by category
  const itemsByCategory = items.reduce(
    (acc, item) => {
      const category = item.menu_category || "Other";
      if (!acc[category]) acc[category] = [];
      acc[category].push(item);
      return acc;
    },
    {} as Record<string, MenuItemView[]>,
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
                  Scanned <Timestamp iso={scan.scanned_at} precision="date" />
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
          {scan.processing_error && (
            <Alert color="danger" size="sm" sx={{ mt: 2 }}>
              {scan.processing_error}
            </Alert>
          )}
        </CardContent>
      </Card>

      {actionError && (
        <Alert color="danger" size="sm">
          {actionError}
        </Alert>
      )}

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
                const matchedItem = item.matched_item;
                const matchedHref = matchedItem
                  ? matchedItemHref(matchedItem)
                  : null;
                const suggestion = pendingByLine.get(item.id);

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
                                  Matched to:{" "}
                                  {matchedHref ? (
                                    <NextLink href={matchedHref}>
                                      {matchedItem.name}
                                    </NextLink>
                                  ) : (
                                    matchedItem.name
                                  )}
                                </Alert>
                              ) : suggestion ? (
                                <Alert
                                  color="warning"
                                  size="sm"
                                  sx={{ mt: 1, flexWrap: "wrap" }}
                                  endDecorator={
                                    <Stack direction="row" spacing={1}>
                                      <Button
                                        size="sm"
                                        variant="outlined"
                                        color="danger"
                                        startDecorator={<MdClose />}
                                        disabled={actingOn !== null}
                                        onClick={() =>
                                          handleSuggestion(suggestion, "REJECT")
                                        }
                                      >
                                        Reject
                                      </Button>
                                      <Button
                                        size="sm"
                                        color="success"
                                        startDecorator={<MdCheck />}
                                        loading={actingOn === suggestion.id}
                                        disabled={actingOn !== null}
                                        onClick={() =>
                                          handleSuggestion(suggestion, "ACCEPT")
                                        }
                                      >
                                        Accept
                                      </Button>
                                    </Stack>
                                  }
                                >
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
