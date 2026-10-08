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
 * - Added: "Load more" under the list. The old read was unbounded; the API
 *   pages a place's menu at 100 lines, so the owner (`usePlaceDetails`)
 *   passes `hasMore` / `onLoadMore` and the next page is appended in place.
 */

import type { ReactNode } from "react";
import { useState } from "react";
import { Add, Help, ICON_STROKE, Price, Success } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { ITEM_TYPES_IN_ORDER, TypeGlyph } from "@/components/app/TypeChip";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
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
  /** More lines past those loaded (`pageInfo.hasNextPage`). */
  hasMore?: boolean;
  loadingMore?: boolean;
  /** The last "Load more" failure, if any. */
  loadMoreError?: string | null;
  onLoadMore?: () => void;
}

export function PlaceMenuItems({
  placeId: _placeId,
  menuItems,
  hasMore = false,
  loadingMore = false,
  loadMoreError = null,
  onLoadMore,
}: PlaceMenuItemsProps) {
  const [selectedItem, setSelectedItem] =
    useState<MenuItemWithSuggestions | null>(null);
  const unmaskedItems = menuItems;

  const getMatchedItem = (item: MenuItemWithSuggestions) => item.matched_item;
  const addHref = (item: MenuItemWithSuggestions) =>
    item.matched_item ? matchedItemHref(item.matched_item) : null;

  const handleViewDetails = (item: MenuItemWithSuggestions) => {
    setSelectedItem(item);
  };

  if (unmaskedItems.length === 0) {
    return (
      <div className="rounded-lg bg-surface-1 px-4 py-8 text-center">
        <p className="type-body text-ink-2">No menu items available</p>
      </div>
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
      <div className="flex flex-col gap-6">
        {Object.entries(itemsByCategory).map(([category, items]) => (
          <section key={category}>
            <h4 className="type-title-2 mb-4 text-ink-1">{category}</h4>

            <ul className="flex flex-col gap-4">
              {items.map((item) => {
                const matchedItem = getMatchedItem(item);
                const suggestion = item.item_match_suggestions?.[0];
                const href = addHref(item);

                return (
                  <li key={item.id} className="rounded-lg bg-surface-1 p-4">
                    <div className="flex flex-row items-start gap-4">
                      {/* Item icon */}
                      <MenuItemGlyph type={item.detected_item_type} />

                      {/* Item details */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-row items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="type-headline truncate text-ink-1">
                              {item.menu_item_name}
                            </p>

                            {item.menu_item_description && (
                              <p className="type-callout mt-1 text-ink-2">
                                {item.menu_item_description}
                              </p>
                            )}

                            {/* Extracted attributes */}
                            {item.extracted_attributes &&
                              Object.keys(item.extracted_attributes).length >
                                0 && (
                                <div className="mt-2 flex flex-row flex-wrap gap-2">
                                  {Object.entries(
                                    item.extracted_attributes,
                                  ).map(([key, value]) => (
                                    <Badge key={key} variant="secondary">
                                      {key}: {String(value)}
                                    </Badge>
                                  ))}
                                </div>
                              )}

                            {/* Match status */}
                            {matchedItem ? (
                              <MatchLine tone="success">
                                <Success
                                  aria-hidden
                                  strokeWidth={ICON_STROKE}
                                  className="size-4 shrink-0"
                                />
                                Matched to: {matchedItem.name}
                              </MatchLine>
                            ) : suggestion ? (
                              <MatchLine tone="suggested">
                                <Help
                                  aria-hidden
                                  strokeWidth={ICON_STROKE}
                                  className="size-4 shrink-0"
                                />
                                Suggested match:{" "}
                                {suggestion.suggested?.name ?? "Unknown"} (
                                {(suggestion.confidence_score * 100).toFixed(0)}
                                % confidence)
                              </MatchLine>
                            ) : (
                              <MatchLine tone="neutral">
                                New item - not yet matched
                              </MatchLine>
                            )}
                          </div>

                          {/* Price */}
                          {item.menu_item_price && (
                            <div className="flex shrink-0 flex-row items-center gap-1">
                              <Price
                                aria-hidden
                                strokeWidth={ICON_STROKE}
                                className="size-5 text-ink-2"
                              />
                              <span className="type-callout tabular font-semibold text-ink-1">
                                ${item.menu_item_price}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="mt-4 flex flex-row flex-wrap gap-2">
                          {href && (
                            <Button asChild>
                              <Link href={href} underline="none">
                                <Add aria-hidden />
                                Add to Cellar
                              </Link>
                            </Button>
                          )}

                          <Button
                            variant="outline"
                            onClick={() => handleViewDetails(item)}
                          >
                            View Details
                          </Button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {loadMoreError && (
          <Alert variant="destructive">
            <AlertDescription>{loadMoreError}</AlertDescription>
          </Alert>
        )}
        {hasMore && onLoadMore && (
          <Button
            variant="outline"
            disabled={loadingMore}
            aria-busy={loadingMore || undefined}
            onClick={onLoadMore}
          >
            {loadingMore && <Spinner />}
            Load more
          </Button>
        )}
      </div>

      {/* Item details sheet (a dialog from md up). `z-[1200]`: on /map this
          list sits in the Joy-era PlaceDetailsDrawer (z-index 950 desktop,
          1100 phone), which would otherwise cover the sheet; drop it when
          that drawer is converted. */}
      <ResponsiveDialog
        open={!!selectedItem}
        onOpenChange={(open) => {
          if (!open) setSelectedItem(null);
        }}
        title={selectedItem?.menu_item_name ?? ""}
        className="z-[1200] md:max-w-[600px]"
      >
        {selectedItem && (
          <div className="flex flex-col gap-6">
            {selectedItem.menu_item_description && (
              <p className="type-body text-ink-1">
                {selectedItem.menu_item_description}
              </p>
            )}

            <Separator />

            <div className="flex flex-col gap-4">
              <h4 className="type-headline text-ink-1">Item Analysis</h4>

              <div className="flex flex-row flex-wrap gap-4">
                <p className="type-callout text-ink-1">
                  <strong>Detected Type:</strong>{" "}
                  {selectedItem.detected_item_type || "Unknown"}
                </p>
                {selectedItem.confidence_score && (
                  <p className="type-callout text-ink-1">
                    <strong>Confidence:</strong>{" "}
                    {(selectedItem.confidence_score * 100).toFixed(0)}%
                  </p>
                )}
              </div>

              {selectedItem.extracted_attributes && (
                <div>
                  <p className="type-callout font-semibold text-ink-1">
                    Extracted Attributes:
                  </p>
                  <div className="mt-2 flex flex-col gap-2">
                    {Object.entries(selectedItem.extracted_attributes).map(
                      ([key, value]) => (
                        <p key={key} className="type-callout text-ink-1">
                          <strong>{key}:</strong> {String(value)}
                        </p>
                      ),
                    )}
                  </div>
                </div>
              )}
            </div>

            {selectedItem.item_match_suggestions &&
              selectedItem.item_match_suggestions.length > 0 && (
                <>
                  <Separator />
                  <div className="flex flex-col gap-4">
                    <h4 className="type-headline text-ink-1">
                      Match Suggestions
                    </h4>
                    {selectedItem.item_match_suggestions.map((suggestion) => (
                      <div
                        key={suggestion.id}
                        className="flex flex-col gap-2 rounded-lg bg-surface-1 p-4"
                      >
                        <p className="type-callout text-ink-1">
                          <strong>Suggested Match:</strong>{" "}
                          {suggestion.suggested?.name ?? "Unknown"}
                        </p>
                        <p className="type-callout text-ink-1">
                          <strong>Confidence:</strong>{" "}
                          {(suggestion.confidence_score * 100).toFixed(0)}%
                        </p>
                        {suggestion.match_reasoning && (
                          <p className="type-footnote text-ink-2">
                            {suggestion.match_reasoning}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}

            {addHref(selectedItem) && (
              <Button size="lg" asChild>
                <Link
                  href={addHref(selectedItem) ?? ""}
                  underline="none"
                  onClick={() => setSelectedItem(null)}
                >
                  <Add aria-hidden />
                  Add to Cellar
                </Link>
              </Button>
            )}
          </div>
        )}
      </ResponsiveDialog>
    </>
  );
}

/** A menu line's type, in the type's own hue; anything else is a "?". */
function MenuItemGlyph({ type }: { type?: string | null }) {
  const key = type?.toUpperCase();
  const known = ITEM_TYPES_IN_ORDER.find((t) => t === key) as
    | ApiItemType
    | undefined;
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-surface-2 text-ink-3">
      {known ? (
        <TypeGlyph type={known} className="size-5" />
      ) : (
        <Help aria-hidden strokeWidth={ICON_STROKE} className="size-5" />
      )}
    </div>
  );
}

const MATCH_TONE = {
  success: "bg-success/10 text-success",
  suggested: "bg-surface-2 text-ink-1",
  neutral: "bg-surface-2 text-ink-2",
} as const;

/** The line's match status — a quiet tinted row, not an alert. */
function MatchLine({
  tone,
  children,
}: {
  tone: keyof typeof MATCH_TONE;
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        "type-footnote mt-2 flex flex-row items-center gap-2 rounded-sm px-3 py-1.5",
        MATCH_TONE[tone],
      )}
    >
      {children}
    </p>
  );
}
