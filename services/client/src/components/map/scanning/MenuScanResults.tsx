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
import { AppBar } from "@/components/app/AppBar";
import { EmptyState } from "@/components/app/EmptyState";
import { AI, Check, ErrorIcon, NoResults } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { Page } from "@/components/app/Page";
import { CountFilters } from "@/components/app/parts/CountStrip";
import { Timestamp } from "@/components/common/Timestamp";
import { MenuLineList } from "@/components/menu-lines/MenuLineList";
import { MenuLineNote } from "@/components/menu-lines/MenuLineRow";
import { Button } from "@/components/ui/button";
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
import { HeaderRenameOffer } from "./HeaderRenameOffer";
import { MenuLineSkeleton, ScanSteps } from "./ScanSteps";
import {
  isScanSettled,
  type LineMatch,
  lineMatch,
  type PendingDecision,
  type ScanProgress,
  scanHeadline,
  scanPhase,
} from "./scan-progress";
import { usePollWhile } from "./use-poll-while";

interface MenuScanResultsProps {
  scanId: string;
}

type LineFilter = LineMatch["kind"];

/** A calm notice row: what happened, and at most one way on. */
function Notice({
  tone,
  children,
  action,
  className,
}: {
  tone: "neutral" | "danger";
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
        "t-body flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-4 py-2.5",
        tone === "neutral" && "border-edge text-ink",
        tone === "danger" && "border-danger text-ink",
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

/** The bar: "Menu scan" over the place's name (Places-Menus 01, 03). */
function ScanBar({ placeName }: { placeName?: string | null }) {
  return (
    <AppBar
      parent="/map"
      title={
        <span className="flex min-w-0 flex-col">
          <span className="t-head truncate text-ink">Menu scan</span>
          {placeName && (
            <span className="t-cap truncate text-ink-2">{placeName}</span>
          )}
        </span>
      }
    />
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
  const [filter, setFilter] = useState<LineFilter | null>(null);

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
      <Page>
        <ScanBar />
        <MenuLineSkeleton />
      </Page>
    );
  }

  const error = transportError
    ? failureFromTransport(transportError).message
    : !result.ok && data !== undefined && result.error.code !== "NOT_FOUND"
      ? result.error.message
      : null;

  if (error || !scanNode) {
    return (
      <Page>
        <ScanBar />
        {error ? (
          <EmptyState
            illustration={
              <ErrorIcon aria-hidden className="size-7 text-glyph" />
            }
            title="Couldn't open this scan"
            description={error}
            action={
              <Button variant="outline" onClick={refresh}>
                Try again
              </Button>
            }
          />
        ) : (
          <EmptyState
            illustration={
              <NoResults aria-hidden className="size-7 text-glyph" />
            }
            title="Scan not found"
            description="It's gone, or it isn't yours."
          />
        )}
      </Page>
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
  const failed = scanNode.processingStatus === "failed";
  const phase = scanPhase(scanProgress);

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

  /**
   * Under each line: its match, or the suggestion asked as a question with
   * an inline Not this / That's it (Places-Menus 03): secondary, outlined —
   * the teal primary is the screen's main job, not a row's (CROSS-LOT).
   */
  const lineStatus = (item: MenuItemView): ReactNode => {
    const match = matchByLine.get(item.id) ?? { kind: "new" as const };
    if (match.kind === "matched") {
      const lineName = menuLineText(item.menu_item_name);
      if (match.name.trim().toLowerCase() === lineName.trim().toLowerCase()) {
        return <MenuLineNote icon={Check}>Matched</MenuLineNote>;
      }
      return (
        <MenuLineNote icon={Check}>
          <span className="sr-only">Matched to </span>
          {match.href ? (
            // 24px tall at least (WCAG 2.5.8): the line sits on the row's
            // own open button.
            <Link
              href={match.href}
              underline="none"
              className="inline-flex min-h-6 items-center text-ink-2"
            >
              {match.name}
            </Link>
          ) : (
            match.name
          )}
        </MenuLineNote>
      );
    }
    if (match.kind === "suggested") {
      const suggestedName =
        match.suggestion.suggested?.name ?? "a catalog item";
      const lineName = menuLineText(item.menu_item_name);
      return (
        <div data-slot="line-suggestion" className="flex flex-col gap-2">
          <MenuLineNote icon={AI}>Is it {suggestedName}?</MenuLineNote>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              aria-label={`Not this: ${suggestedName} for ${lineName}`}
              onClick={() => handleSuggestion(match.suggestion, "REJECT")}
            >
              Not this
            </Button>
            <Button
              variant="outline"
              aria-label={`That's it: ${suggestedName} for ${lineName}`}
              onClick={() => handleSuggestion(match.suggestion, "ACCEPT")}
            >
              That&apos;s it
            </Button>
          </div>
        </div>
      );
    }
    return (
      <p className="t-cap text-ink-2">
        {settled ? "Not in the catalog yet" : "Matching…"}
      </p>
    );
  };

  const shownItems =
    filter === null
      ? items
      : items.filter(
          (item) => (matchByLine.get(item.id)?.kind ?? "new") === filter,
        );

  return (
    <Page>
      <ScanBar placeName={scan.place?.name} />

      {!settled && !failed && <ScanSteps phase={phase} slow={gaveUp} />}

      {settled && !failed && items.length > 0 && (
        <div className="flex flex-col gap-2">
          <p aria-live="polite" className="t-cap tabular text-ink-2">
            {items.length} {items.length === 1 ? "line" : "lines"}
            {scan.scanned_at && (
              <>
                {" · Read "}
                <Timestamp iso={scan.scanned_at} precision="date" />
              </>
            )}
            <span className="sr-only"> · {headline.text}</span>
          </p>
          <CountFilters<LineFilter>
            aria-label="Show lines"
            value={filter}
            onValueChange={setFilter}
            cells={[
              { value: "matched", label: "Matched", count: headline.matched },
              {
                value: "suggested",
                label: "To check",
                count: headline.toConfirm,
              },
              { value: "new", label: "New", count: headline.fresh },
            ]}
          />
        </div>
      )}

      {scanNode.matchStatus === "failed" && !failed && (
        <Notice tone="neutral">
          Matching didn&apos;t finish, so some lines show as new.
        </Notice>
      )}
      {gaveUp && (
        <Notice
          tone="neutral"
          action={
            <Button variant="outline" onClick={restart}>
              Check again
            </Button>
          }
        >
          This is taking longer than usual.
        </Notice>
      )}

      {/* L10: the menu's printed name, offered as a rename — never applied unconfirmed. */}
      {settled && scan.place && (
        <HeaderRenameOffer scanId={scan.id} onRenamed={refresh} />
      )}

      {actionError && <Notice tone="danger">{actionError}</Notice>}

      {failed ? (
        <EmptyState
          illustration={<ErrorIcon aria-hidden className="size-7 text-glyph" />}
          title="Couldn't read this menu"
          description={
            scan.processing_error ?? "Try a sharper photo, closer in."
          }
          action={
            scan.place ? (
              <Button variant="outline" asChild>
                <Link href={`/places/${scan.place.id}`} underline="none">
                  Back to {scan.place.name}
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : items.length === 0 && !settled ? (
        <MenuLineSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          illustration={<NoResults aria-hidden className="size-7 text-glyph" />}
          title="No drinks on this menu"
          description={
            scan.items_detected > 0
              ? // Read, but never filed on a place (no place was known, or
                // filing failed), so there are no lines to show or match.
                "The lines weren't saved to a place."
              : "Nothing on it read as a drink."
          }
        />
      ) : (
        <MenuLineList
          lines={shownItems}
          place={scan.place}
          renderStatus={lineStatus}
          onChanged={refresh}
        />
      )}
    </Page>
  );
}
