"use client";

/**
 * A place's menu — `82450ad1:src/components/map/places/PlaceMenuItems.tsx`,
 * rebuilt for X07 on the shared `MenuLineList`.
 *
 * - Lines arrive adapted (`menuItemFrom`): the per-type relations are one
 *   `matched_item` (G18), so sake and tea matches show too.
 * - Grouped by the line's **type**, not `menu_category`: the read leaves the
 *   category null on most menus, so every line used to land under "Other".
 * - Each line opens a sheet of actions — I'm having this, Want to try, Add to
 *   tier list, Add to cellar, Not this — instead of the old "Add to Cellar"
 *   link (which only opened the item page) and the "View Details" dialog of
 *   percentages. Confidence numbers are gone from the UI: no affinity or
 *   match percentages (X07).
 * - "Load more" under the list: the API pages a place's menu at 100 lines,
 *   so the owner (`usePlaceDetails`) passes `hasMore` / `onLoadMore`.
 */

import { MenuLineList } from "@/components/menu-lines/MenuLineList";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { MenuItemView } from "../adapter";

interface PlaceMenuItemsProps {
  placeId: string;
  /** Named in a new log's "Where" and the line sheet's subtitle. */
  placeName: string;
  /** The old query's `$userId`; unused — the API knows the viewer. */
  userId?: string;
  menuItems: MenuItemView[];
  /** More lines past those loaded (`pageInfo.hasNextPage`). */
  hasMore?: boolean;
  loadingMore?: boolean;
  /** The last "Load more" failure, if any. */
  loadMoreError?: string | null;
  onLoadMore?: () => void;
  /** After a line changed (its match, a save): re-read the menu. */
  onChanged?: () => void;
}

export function PlaceMenuItems({
  placeId,
  placeName,
  menuItems,
  hasMore = false,
  loadingMore = false,
  loadMoreError = null,
  onLoadMore,
  onChanged,
}: PlaceMenuItemsProps) {
  if (menuItems.length === 0) {
    return (
      <div className="rounded-lg bg-surface-1 px-4 py-8 text-center">
        <p className="type-body text-ink-2">No menu items available</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <MenuLineList
        lines={menuItems}
        place={{ id: placeId, name: placeName }}
        onChanged={onChanged}
      />
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
  );
}
