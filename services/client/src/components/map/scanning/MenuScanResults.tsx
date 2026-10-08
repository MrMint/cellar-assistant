"use client";

/**
 * `82450ad1:src/components/map/scanning/MenuScanResults.tsx`, restored.
 *
 * - `getScanResults` (scan + `place_menu_items(where menu_scan_id)`) →
 *   `menuScan(id:)` with every extracted line (`MenuScan.menuItems`, G19) and
 *   each line's matched item (G18) — sake and tea matches included.
 * - Kept from D5: a line's pending AI suggestion shows under it with Accept /
 *   Reject (`actOnMenuScanSuggestion`), in the old "Suggested match" alert;
 *   a failed scan shows the API's one-sentence `processingError`.
 * - "Not found" and "not yours" are one state (§1.6), as before.
 *
 * N06a ("menu-scan truth"), with the rules in `scan-progress.ts`:
 * - the page re-reads until `matchStatus` settles — not just until
 *   extraction completes, which is before any line is matched — on a
 *   backing-off schedule that gives up after a few minutes with a
 *   "Check again" (no subscriptions);
 * - the headline is "8 read · 2 matched · 6 new", and says "matching…"
 *   instead of guessing while the run is still going;
 * - Accept turns the line "Matched" at once, and an accepted suggestion
 *   stays the line's match: the old page waited for `place_menu_items` to
 *   learn the match through an outbox hop (and for a cocktail it never
 *   does), so the line re-rendered "not yet matched". Accept / Reject stays
 *   the one way to confirm an AI match (decision D6).
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
import { useCallback, useMemo, useState } from "react";
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
import {
  isExtractionDone,
  isScanSettled,
  type LineMatch,
  lineMatch,
  type PendingDecision,
  type ScanProgress,
  scanHeadline,
} from "./scan-progress";
import { usePollWhile } from "./use-poll-while";

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

/** One chip for both halves of the pipeline. */
const statusChip = (
  progress: ScanProgress,
): { label: string; color: "success" | "warning" | "danger" | "neutral" } => {
  if (progress.processingStatus === "failed") {
    return { label: "failed", color: "danger" };
  }
  if (!isExtractionDone(progress))
    return { label: "reading", color: "warning" };
  if (!isScanSettled(progress)) return { label: "matching", color: "warning" };
  return { label: "complete", color: "success" };
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
  // Decisions the viewer has made, shown before the server confirms them.
  const [decisions, setDecisions] = useState<
    ReadonlyMap<string, PendingDecision>
  >(() => new Map());
  const [actionError, setActionError] = useState<string | null>(null);

  const result = useMemo(
    () => unwrapResult(data?.menuScan, "MenuScan"),
    [data],
  );
  const scanNode = result.ok ? result.data : null;
  const progress: ScanProgress | null = scanNode
    ? {
        processingStatus: scanNode.processingStatus,
        matchStatus: scanNode.matchStatus,
      }
    : null;
  const settled = progress === null || isScanSettled(progress);

  // No subscriptions: re-read until the match run has settled.
  const refresh = useCallback(
    () => reexecute({ requestPolicy: "network-only" }),
    [reexecute],
  );
  const { gaveUp, restart } = usePollWhile(!settled, refresh);

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
  const suggestions = scanNode.suggestions.edges.map((edge) =>
    suggestionFrom(edge.node),
  );
  const matchByLine = new Map<string, LineMatch>(
    items.map((item) => [
      item.id,
      lineMatch(item, suggestions, decisions, matchedItemHref),
    ]),
  );
  const scanProgress: ScanProgress = {
    processingStatus: scanNode.processingStatus,
    matchStatus: scanNode.matchStatus,
  };
  const headline = scanHeadline(
    { ...scanProgress, itemsDetected: scan.items_detected },
    Array.from(matchByLine.values()),
  );
  const chip = statusChip(scanProgress);

  const decide = (suggestionId: string, action: PendingDecision | null) =>
    setDecisions((current) => {
      const next = new Map(current);
      if (action === null) next.delete(suggestionId);
      else next.set(suggestionId, action);
      return next;
    });

  const handleSuggestion = async (
    suggestion: SuggestionView,
    action: PendingDecision,
  ) => {
    // Optimistic: the line flips now, and stays flipped once the server
    // agrees (the accepted suggestion is the line's match). Undone on failure.
    decide(suggestion.id, action);
    setActionError(null);
    const response = await actOnSuggestion({
      menuScanId: scan.id,
      input: { suggestionId: suggestion.id, action },
    });
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
      decide(suggestion.id, null);
      setActionError(acted.message);
    }
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
            <Chip variant="solid" color={chip.color} size="sm">
              {chip.label}
            </Chip>
          </Stack>

          <Typography level="title-md" sx={{ mt: 2 }}>
            {headline.text}
          </Typography>
          {headline.toConfirm > 0 && (
            <Typography level="body-sm" sx={{ color: "text.secondary" }}>
              {headline.toConfirm === 1
                ? "1 suggested match to confirm below."
                : `${headline.toConfirm} suggested matches to confirm below.`}
            </Typography>
          )}
          {scanNode.matchStatus === "failed" && (
            <Alert color="warning" size="sm" sx={{ mt: 2 }}>
              Matching didn&apos;t finish, so some lines may show as new.
            </Alert>
          )}
          {gaveUp && (
            <Alert
              color="warning"
              size="sm"
              sx={{ mt: 2 }}
              endDecorator={
                <Button size="sm" variant="soft" onClick={restart}>
                  Check again
                </Button>
              }
            >
              This is taking longer than usual.
            </Alert>
          )}
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
      {items.length === 0 && !settled ? (
        <Card>
          <CardContent sx={{ textAlign: "center", py: 4 }}>
            <CircularProgress size="sm" />
            <Typography level="body-md" sx={{ color: "text.secondary", mt: 1 }}>
              Reading the menu lines...
            </Typography>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
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
                const match = matchByLine.get(item.id) ?? {
                  kind: "new" as const,
                };

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

                              {match.kind === "matched" ? (
                                <Alert color="success" size="sm" sx={{ mt: 1 }}>
                                  <MdCheckCircle size={16} />
                                  Matched to:{" "}
                                  {match.href ? (
                                    <NextLink href={match.href}>
                                      {match.name}
                                    </NextLink>
                                  ) : (
                                    match.name
                                  )}
                                </Alert>
                              ) : match.kind === "suggested" ? (
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
                                        onClick={() =>
                                          handleSuggestion(
                                            match.suggestion,
                                            "REJECT",
                                          )
                                        }
                                      >
                                        Reject
                                      </Button>
                                      <Button
                                        size="sm"
                                        color="success"
                                        startDecorator={<MdCheck />}
                                        onClick={() =>
                                          handleSuggestion(
                                            match.suggestion,
                                            "ACCEPT",
                                          )
                                        }
                                      >
                                        Accept
                                      </Button>
                                    </Stack>
                                  }
                                >
                                  <MdHelp size={16} />
                                  Suggested match:{" "}
                                  {match.suggestion.suggested?.name ??
                                    "Unknown"}{" "}
                                  (
                                  {(
                                    match.suggestion.confidence_score * 100
                                  ).toFixed(0)}
                                  % confidence)
                                </Alert>
                              ) : (
                                <Alert color="neutral" size="sm" sx={{ mt: 1 }}>
                                  {settled
                                    ? "New item - not yet matched"
                                    : "Matching..."}
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
