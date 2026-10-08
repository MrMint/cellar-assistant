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
 * - the headline is "8 read · 2 matched · 3 to confirm · 3 new" — only a
 *   confirmed line is matched — and says "matching…" instead of guessing
 *   while the run is still going. A menu longer than the loaded page is
 *   counted by the server (`MenuScan.matchCounts`), re-read after each
 *   Accept / Reject;
 * - Accept turns the line "Matched" at once, and an accepted suggestion
 *   stays the line's match: the old page waited for `place_menu_items` to
 *   learn the match through an outbox hop (and for a cocktail it never
 *   does), so the line re-rendered "not yet matched". Accept / Reject stays
 *   the one way to confirm an AI match (decision D6).
 */

import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "urql";
import {
  Back,
  Check,
  Close,
  ErrorIcon,
  Help,
  ICON_STROKE,
  Price,
  Success,
  Warning,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { itemTypeTokens, TypeGlyph } from "@/components/app/TypeChip";
import { Timestamp } from "@/components/common/Timestamp";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { failureFromTransport, unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";
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
import { ScanStatusBadge, type ScanTone } from "./ScanStatusBadge";
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

const ITEM_TYPES = ["BEER", "WINE", "SPIRIT", "COFFEE", "SAKE", "TEA"] as const;
type LineItemType = (typeof ITEM_TYPES)[number];

const lineType = (type?: string | null): LineItemType | null => {
  const upper = type?.toUpperCase();
  return ITEM_TYPES.find((t) => t === upper) ?? null;
};

/** The line's type glyph on its type's tint; a question mark otherwise. */
function LineTypeMark({ type }: { type?: string | null }) {
  const known = lineType(type);
  const token = known ? itemTypeTokens[known] : null;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-sm p-2",
        token ? [token.tintClass, token.textClass] : "bg-surface-3 text-ink-2",
      )}
    >
      {known ? (
        <TypeGlyph type={known} className="size-5" />
      ) : (
        <Help aria-hidden strokeWidth={ICON_STROKE} className="size-5" />
      )}
    </span>
  );
}

/** One chip for both halves of the pipeline. */
const statusChip = (
  progress: ScanProgress,
): { label: string; tone: ScanTone } => {
  if (progress.processingStatus === "failed") {
    return { label: "failed", tone: "danger" };
  }
  if (!isExtractionDone(progress)) return { label: "reading", tone: "working" };
  if (!isScanSettled(progress)) return { label: "matching", tone: "working" };
  return { label: "complete", tone: "success" };
};

/**
 * A full-width notice row: Joy's soft `Alert` on the tokens. Only a danger
 * notice is an `alert`; a line's match status is not news to announce.
 */
function Notice({
  tone,
  children,
  action,
  className,
}: {
  tone: "neutral" | "danger" | "success" | "ai";
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      data-slot="notice"
      data-tone={tone}
      className={cn(
        "type-callout flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-4 py-2.5",
        tone === "neutral" && "border-transparent bg-surface-2 text-ink-1",
        tone === "danger" && "border-destructive/60 text-destructive",
        tone === "success" && "border-transparent bg-success/10 text-success",
        tone === "ai" && "border-transparent bg-ai/10 text-ink-1",
        className,
      )}
    >
      {/* A 12rem basis, not 0: with an action beside it the text claims its
          own width first and the action wraps below, instead of squeezing it. */}
      <div className="min-w-0 flex-[1_1_12rem]">{children}</div>
      {action}
    </div>
  );
}

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
      <div className="flex justify-center p-8">
        <Spinner className="size-8 text-ink-2" />
      </div>
    );
  }

  const error = transportError
    ? failureFromTransport(transportError).message
    : !result.ok && data !== undefined && result.error.code !== "NOT_FOUND"
      ? result.error.message
      : null;

  if (error || !scanNode) {
    return (
      <div className="p-4">
        <Alert variant="destructive" className="border-destructive/60">
          <ErrorIcon aria-hidden />
          <AlertDescription className="text-destructive">
            {error || "Scan not found"}
          </AlertDescription>
        </Alert>
      </div>
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
  // Every line and suggestion is on the page, so its own count is exact. An
  // unknown total is treated as "more than loaded": the server counts it.
  const complete =
    items.length >=
      (scanNode.menuItems.totalCount ?? Number.POSITIVE_INFINITY) &&
    suggestions.length >=
      (scanNode.suggestions.totalCount ?? Number.POSITIVE_INFINITY);
  const headline = scanHeadline(
    { ...scanProgress, itemsDetected: scan.items_detected },
    Array.from(matchByLine.values()),
    { server: scanNode.matchCounts, complete },
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
      return;
    }
    // A menu longer than one page is counted by the server, whose numbers
    // only move on a re-read; the line itself already shows the decision.
    if (!complete) refresh();
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
    <div className="flex flex-col gap-6">
      {/* Summary */}
      <section className="rounded-xl bg-surface-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="type-title-1">Scan Results</h1>
            {scan.place && (
              <p className="type-body text-ink-2">{scan.place.name}</p>
            )}
            {scan.scanned_at && (
              <p className="type-footnote text-ink-2">
                Scanned <Timestamp iso={scan.scanned_at} precision="date" />
              </p>
            )}
          </div>
          <ScanStatusBadge tone={chip.tone}>{chip.label}</ScanStatusBadge>
        </div>

        <p aria-live="polite" className="type-headline tabular mt-4">
          {headline.text}
        </p>
        {headline.toConfirm > 0 && (
          <p className="type-callout text-ink-2">
            {headline.toConfirm === 1
              ? "Accept or reject the suggested match below."
              : "Accept or reject the suggested matches below."}
          </p>
        )}
        {scanNode.matchStatus === "failed" && (
          <Notice tone="neutral" className="mt-4">
            <span className="inline-flex items-center gap-2">
              <Warning aria-hidden className="size-4 shrink-0" />
              Matching didn&apos;t finish, so some lines may show as new.
            </span>
          </Notice>
        )}
        {gaveUp && (
          <Notice
            tone="neutral"
            className="mt-4"
            action={
              <Button variant="secondary" size="sm" onClick={restart}>
                Check again
              </Button>
            }
          >
            <span className="inline-flex items-center gap-2">
              <Warning aria-hidden className="size-4 shrink-0" />
              This is taking longer than usual.
            </span>
          </Notice>
        )}
        {scan.processing_error && (
          <Notice tone="danger" className="mt-4">
            {scan.processing_error}
          </Notice>
        )}
      </section>

      {actionError && <Notice tone="danger">{actionError}</Notice>}

      {/* Items by Category */}
      {items.length === 0 && !settled ? (
        <section className="flex flex-col items-center gap-2 rounded-xl bg-surface-1 px-4 py-8 text-center">
          <Spinner className="text-ink-2" />
          <p className="type-body text-ink-2">Reading the menu lines...</p>
        </section>
      ) : items.length === 0 ? (
        <section className="rounded-xl bg-surface-1 px-4 py-8 text-center">
          <p className="type-body text-ink-2">
            {scan.items_detected > 0
              ? // Read, but never filed on a place (no place was known, or
                // filing failed), so there are no lines to show or match.
                "The lines this scan read weren't saved to a place, so there's nothing to show here."
              : "No items were extracted from this scan."}
          </p>
        </section>
      ) : (
        Object.entries(itemsByCategory).map(([category, categoryItems]) => (
          <section key={category}>
            <h2 className="type-title-2 mb-4">{category}</h2>

            <ul className="flex flex-col gap-4">
              {categoryItems.map((item) => {
                const match = matchByLine.get(item.id) ?? {
                  kind: "new" as const,
                };
                const suggestedName =
                  match.kind === "suggested"
                    ? (match.suggestion.suggested?.name ?? "suggestion")
                    : "";

                return (
                  <li key={item.id} className="rounded-xl bg-surface-1 p-4">
                    <div className="flex items-start gap-4">
                      <LineTypeMark type={item.detected_item_type} />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="type-headline min-w-0 flex-1">
                            {item.menu_item_name}
                          </h3>
                          {item.menu_item_price != null && (
                            <p className="type-callout tabular flex shrink-0 items-center gap-1 font-semibold">
                              <Price
                                aria-hidden
                                strokeWidth={ICON_STROKE}
                                className="size-5 text-ink-2"
                              />
                              ${item.menu_item_price}
                            </p>
                          )}
                        </div>

                        {item.menu_item_description && (
                          <p className="type-callout mt-1 text-ink-2">
                            {item.menu_item_description}
                          </p>
                        )}

                        {item.extracted_attributes &&
                          Object.keys(item.extracted_attributes).length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {Object.entries(item.extracted_attributes).map(
                                ([key, value]) => (
                                  <Badge
                                    key={key}
                                    variant="secondary"
                                    className="whitespace-normal"
                                  >
                                    {key}: {String(value)}
                                  </Badge>
                                ),
                              )}
                            </div>
                          )}

                        {match.kind === "matched" ? (
                          <Notice tone="success" className="mt-2">
                            <span className="inline-flex flex-wrap items-center gap-1">
                              <Success
                                aria-hidden
                                className="size-4 shrink-0"
                              />
                              Matched to:{" "}
                              {match.href ? (
                                <Link
                                  href={match.href}
                                  underline="always"
                                  className="text-ink-1"
                                >
                                  {match.name}
                                </Link>
                              ) : (
                                match.name
                              )}
                            </span>
                          </Notice>
                        ) : match.kind === "suggested" ? (
                          <Notice
                            tone="ai"
                            className="mt-2"
                            action={
                              <div className="flex flex-row flex-wrap gap-2">
                                <Button
                                  variant="destructive"
                                  aria-label={`Reject ${suggestedName} for ${item.menu_item_name}`}
                                  onClick={() =>
                                    handleSuggestion(match.suggestion, "REJECT")
                                  }
                                >
                                  <Close aria-hidden />
                                  Reject
                                </Button>
                                <Button
                                  aria-label={`Accept ${suggestedName} for ${item.menu_item_name}`}
                                  onClick={() =>
                                    handleSuggestion(match.suggestion, "ACCEPT")
                                  }
                                >
                                  <Check aria-hidden />
                                  Accept
                                </Button>
                              </div>
                            }
                          >
                            <span className="inline-flex flex-wrap items-center gap-1">
                              <Help
                                aria-hidden
                                className="size-4 shrink-0 text-ai"
                              />
                              Suggested match:{" "}
                              {match.suggestion.suggested?.name ?? "Unknown"} (
                              {(
                                match.suggestion.confidence_score * 100
                              ).toFixed(0)}
                              % confidence)
                            </span>
                          </Notice>
                        ) : (
                          <Notice tone="neutral" className="mt-2">
                            {settled
                              ? "New item - not yet matched"
                              : "Matching..."}
                          </Notice>
                        )}

                        {item.confidence_score != null && (
                          <p className="type-footnote tabular mt-1 text-ink-2">
                            Detection confidence:{" "}
                            {(item.confidence_score * 100).toFixed(0)}%
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {/* Back button */}
      {scan.place && (
        <Button variant="outline" asChild>
          <Link href={`/map?placeId=${scan.place_id}`} underline="none">
            <Back aria-hidden />
            Back to {scan.place.name}
          </Link>
        </Button>
      )}
    </div>
  );
}
