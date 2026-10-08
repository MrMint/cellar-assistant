"use client";

import { useState } from "react";
import { useMutation, useQuery } from "urql";
import { EmptyState } from "@/components/app/EmptyState";
import {
  Check,
  Close,
  ICON_STROKE,
  Info,
  Love,
  Place,
  Restaurant,
  Visible,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { ITEM_TYPES_IN_ORDER, TypeGlyph } from "@/components/app/TypeChip";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { Timestamp } from "@/components/common/Timestamp";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { failureFromTransport, unwrapResult } from "@/lib/api/result";
import { pageOf } from "@/lib/paging/paged-connection";
import { usePagedConnection } from "@/lib/paging/use-paged-connection";
import { suggestionFrom } from "../adapter";
import {
  ActOnSuggestionMutation,
  DiscoveryDataQuery,
  SAVED_PLACES_PAGE_SIZE,
  SavedPlacesQuery,
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
 *   the old `_or` did, with each place (G16) and its menu-line count. The
 *   API pages it at 100, so "Load more" walks the rest (the old read was
 *   unbounded); the tab's count is of the saved places loaded so far.
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
  const [activeTab, setActiveTab] = useState("pending");

  const [{ data, fetching, error }, reexecute] = useQuery({
    query: DiscoveryDataQuery,
    variables: { suggestions: SUGGESTIONS_PAGE_SIZE },
  });
  const saved = usePagedConnection({
    query: SavedPlacesQuery,
    variables: (_args: null, after) => ({
      first: SAVED_PLACES_PAGE_SIZE,
      after,
    }),
    select: (answer) =>
      pageOf(
        unwrapResult(answer?.myPlaceInteractions, "PlaceInteractionConnection"),
        (edge): SavedPlaceInteraction | null => {
          const node = edge.node;
          if (!node.isFavorite && !node.isVisited) return null;
          return {
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
          };
        },
      ),
    initial: null,
    initialArgs: null,
  });

  const [, actOnSuggestion] = useMutation(ActOnSuggestionMutation);
  const [actionError, setActionError] = useState<string | null>(null);

  const discoveries = unwrapResult(
    data?.myDiscoveries,
    "MatchSuggestionConnection",
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
  const savedPlaces = saved.rows.filter(
    (row): row is SavedPlaceInteraction => row !== null,
  );

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

  if (fetching || (saved.status === "resetting" && saved.rows.length === 0)) {
    return (
      <div className="flex justify-center p-8">
        <Spinner className="size-10 text-ink-2" />
      </div>
    );
  }

  if (error || (data !== undefined && !discoveries.ok) || saved.failure) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertDescription>Failed to load discovery data</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList
          variant="line"
          className="w-full justify-start group-data-[orientation=horizontal]/tabs:h-11"
        >
          <TabsTrigger value="pending" className="flex-none px-3">
            Pending Matches
            {pendingMatches.length > 0 && (
              <CountPill>{pendingMatches.length}</CountPill>
            )}
          </TabsTrigger>
          <TabsTrigger value="saved" className="flex-none px-3">
            Saved Places
            {savedPlaces.length > 0 && (
              <CountPill>{savedPlaces.length}</CountPill>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Pending Matches Tab */}
        <TabsContent value="pending" className="pt-4">
          <div className="flex flex-col gap-6">
            {pendingMatches.length === 0 ? (
              <div className="rounded-lg bg-surface-1">
                <EmptyState
                  illustration={<Check className="text-success" />}
                  title="All caught up!"
                  description="No pending matches to review right now."
                />
              </div>
            ) : (
              <>
                <Alert>
                  <Info aria-hidden />
                  <AlertDescription className="type-callout text-ink-2">
                    Review these AI-suggested matches for menu items. Accept
                    good matches to link items to your database, or reject to
                    keep them as standalone discoveries.
                  </AlertDescription>
                </Alert>

                {actionError && (
                  <Alert variant="destructive">
                    <AlertDescription>{actionError}</AlertDescription>
                  </Alert>
                )}
                <ul className="flex flex-col gap-6">
                  {pendingMatches.map((suggestion: DiscoverySuggestion) => {
                    const menuItem = suggestion.place_menu_item;
                    const suggestedItem = suggestion.suggested;

                    // Skip rendering if required data is missing
                    if (!menuItem || !suggestedItem) return null;

                    return (
                      <li
                        key={suggestion.id}
                        className="flex flex-col gap-4 rounded-lg bg-surface-1 p-4"
                      >
                        <div className="flex flex-row items-start gap-4">
                          <ItemGlyph type={menuItem.detected_item_type} />
                          <div className="min-w-0 flex-1">
                            <p className="type-headline text-ink-1">
                              {menuItem.menu_item_name}
                            </p>
                            <p className="type-callout mt-1 flex flex-row items-center gap-2 text-ink-2">
                              <Place
                                aria-hidden
                                strokeWidth={ICON_STROKE}
                                className="size-5 shrink-0"
                              />
                              {menuItem.place.name}
                            </p>
                            {menuItem.menu_item_description && (
                              <p className="type-callout mt-2 text-ink-2">
                                {menuItem.menu_item_description}
                              </p>
                            )}
                          </div>

                          <Badge variant="secondary" className="tabular">
                            {(suggestion.confidence_score * 100).toFixed(0)}%
                            match
                          </Badge>
                        </div>

                        <p className="type-callout rounded-sm bg-surface-2 px-3 py-2 text-ink-1">
                          <strong>Suggested match:</strong> {suggestedItem.name}
                          {suggestion.match_reasoning && (
                            <>
                              <br />
                              <em className="text-ink-2">
                                {suggestion.match_reasoning}
                              </em>
                            </>
                          )}
                        </p>

                        <div className="flex flex-row flex-wrap justify-end gap-2">
                          <Button variant="outline" asChild>
                            <Link
                              href={`/places/${menuItem.place.id}`}
                              underline="none"
                            >
                              <Visible aria-hidden />
                              View Place
                            </Link>
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() =>
                              handleProcessMatch(suggestion, false)
                            }
                          >
                            <Close aria-hidden />
                            Reject
                          </Button>
                          <Button
                            onClick={() => handleProcessMatch(suggestion, true)}
                          >
                            <Check aria-hidden />
                            Accept Match
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </TabsContent>

        {/* Saved Places Tab */}
        <TabsContent value="saved" className="pt-4">
          <div className="flex flex-col gap-4">
            {savedPlaces.length === 0 ? (
              <div className="rounded-lg bg-surface-1">
                <EmptyState
                  illustration={<Love />}
                  title="No saved places"
                  description="Places you favorite or visit will appear here."
                />
              </div>
            ) : (
              <ul className="flex flex-col gap-4">
                {savedPlaces.map((interaction: SavedPlaceInteraction) => {
                  const place = interaction.place;
                  const menuItemsCount = place.menu_items_count;

                  return (
                    <li
                      key={interaction.id}
                      className="flex flex-row items-start gap-4 rounded-lg bg-surface-1 p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-row items-center gap-2">
                          <p className="type-headline text-ink-1">
                            {place.name}
                          </p>
                          {interaction.is_favorite && (
                            <Love
                              role="img"
                              aria-label="Favorite"
                              strokeWidth={ICON_STROKE}
                              className="size-4 shrink-0 fill-brand text-brand"
                            />
                          )}
                        </div>

                        <p className="type-callout mt-1 flex flex-row items-center gap-2 text-ink-2">
                          <Place
                            aria-hidden
                            strokeWidth={ICON_STROKE}
                            className="size-5 shrink-0"
                          />
                          {place.street_address}, {place.locality}
                        </p>

                        <div className="mt-2 flex flex-row flex-wrap gap-2">
                          {place.categories
                            ?.slice(0, 3)
                            .map((category: string) => (
                              <Badge key={category} variant="secondary">
                                {category}
                              </Badge>
                            ))}
                        </div>

                        <div className="mt-2 flex flex-row flex-wrap gap-4">
                          {menuItemsCount > 0 && (
                            <span className="type-footnote text-success">
                              {menuItemsCount} menu items discovered
                            </span>
                          )}
                          {interaction.last_visited_at && (
                            <span className="type-footnote text-ink-2">
                              Visited{" "}
                              <Timestamp
                                iso={interaction.last_visited_at}
                                precision="date"
                              />
                              {(interaction.visit_count ?? 0) > 1 &&
                                ` (${interaction.visit_count}x)`}
                            </span>
                          )}
                        </div>
                      </div>

                      <Button variant="outline" asChild>
                        <Link href={`/places/${place.id}`} underline="none">
                          <Visible aria-hidden />
                          View Details
                        </Link>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            {saved.hasNextPage && (
              <Button
                variant="outline"
                disabled={!saved.canLoadMore || saved.status === "loadingMore"}
                aria-busy={saved.status === "loadingMore" || undefined}
                onClick={() => void saved.loadMore()}
              >
                {saved.status === "loadingMore" && <Spinner />}
                Load more
              </Button>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** A tab's count (the old Joy badge / chip). */
function CountPill({ children }: { children: number }) {
  return (
    <span className="tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-surface-3 px-1.5 font-semibold text-ink-1 text-xs">
      {children}
    </span>
  );
}

/** A suggestion line's type in its own hue; anything else is a plate. */
function ItemGlyph({ type }: { type?: string }) {
  const key = type?.toUpperCase();
  const known = ITEM_TYPES_IN_ORDER.find((t) => t === key) as
    | ApiItemType
    | undefined;
  return known ? (
    <TypeGlyph type={known} className="mt-0.5 size-5" />
  ) : (
    <Restaurant
      aria-hidden
      strokeWidth={ICON_STROKE}
      className="mt-0.5 size-5 shrink-0 text-ink-2"
    />
  );
}
