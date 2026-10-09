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
 *
 * X07: the lines are the shared `MenuLineList` — grouped by type, cased for
 * reading, each opening the same actions as on the place page — with the
 * suggestion's Accept / Reject as the row's status. The suggestion is asked
 * as a question ("Is it Barolo 2016?") with no percentage, and the read's
 * detection confidence is no longer printed under every line.
 */

import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "urql";
import {
  Back,
  Check,
  Close,
  ErrorIcon,
  Help,
  Success,
  Warning,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { Timestamp } from "@/components/common/Timestamp";
import { MenuLineList } from "@/components/menu-lines/MenuLineList";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { failureFromTransport, unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";
import { menuLineText } from "@/utilities/menu-line-text";
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

  /** Under each line: its match, or the suggestion to accept or reject. */
  const lineStatus = (item: MenuItemView): ReactNode => {
    const match = matchByLine.get(item.id) ?? { kind: "new" as const };
    if (match.kind === "matched") {
      return (
        <p className="type-footnote inline-flex flex-wrap items-center gap-1 text-success">
          <Success aria-hidden className="size-4 shrink-0" />
          Matched
          {match.href ? (
            <>
              {" to "}
              <Link href={match.href} underline="always" className="text-ink-1">
                {match.name}
              </Link>
            </>
          ) : (
            <span className="text-ink-1"> to {match.name}</span>
          )}
        </p>
      );
    }
    if (match.kind === "suggested") {
      const suggestedName =
        match.suggestion.suggested?.name ?? "a catalog item";
      const lineName = menuLineText(item.menu_item_name);
      return (
        <Notice
          tone="ai"
          action={
            <div className="flex flex-row flex-wrap gap-2">
              <Button
                variant="destructive"
                size="sm"
                aria-label={`Reject ${suggestedName} for ${lineName}`}
                onClick={() => handleSuggestion(match.suggestion, "REJECT")}
              >
                <Close aria-hidden />
                Reject
              </Button>
              <Button
                size="sm"
                aria-label={`Accept ${suggestedName} for ${lineName}`}
                onClick={() => handleSuggestion(match.suggestion, "ACCEPT")}
              >
                <Check aria-hidden />
                Accept
              </Button>
            </div>
          }
        >
          <span className="inline-flex flex-wrap items-center gap-1">
            <Help aria-hidden className="size-4 shrink-0 text-ai" />
            Is it {suggestedName}?
          </span>
        </Notice>
      );
    }
    return (
      <p className="type-footnote text-ink-3">
        {settled ? "Not in the catalog yet" : "Matching…"}
      </p>
    );
  };

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
        <MenuLineList
          lines={items}
          place={scan.place}
          renderStatus={lineStatus}
          onChanged={refresh}
        />
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
