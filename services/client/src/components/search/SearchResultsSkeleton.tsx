import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder cards — as many as a phone's first screen of results shows. */
const PLACEHOLDERS = [1, 2, 3, 4, 5, 6];

/**
 * The results skeleton (N01): shown while a search navigation is pending and
 * as the results' Suspense fallback, in the result grid's own columns.
 */
export function SearchResultsSkeleton() {
  return (
    <div
      data-testid="search-results-skeleton"
      className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6"
    >
      {PLACEHOLDERS.map((i) => (
        <div key={i} className="overflow-hidden rounded-md bg-surface-1">
          <Skeleton className="aspect-square rounded-none" />
          <Skeleton className="m-2 h-4" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder rows for the landing view's activity feed. */
const DISCOVERY_ROWS = [1, 2, 3, 4];

/**
 * The landing view's discovery section while it streams: clearing the box
 * used to leave the region empty for a second or more between the results
 * skeleton and Recent Activity (UX lane, 2026-10-08).
 */
export function SearchDiscoverySkeleton() {
  return (
    <div
      data-testid="search-discovery-skeleton"
      className="flex flex-col gap-4"
    >
      <Skeleton className="h-6 w-45" />
      {DISCOVERY_ROWS.map((i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="size-12 shrink-0" />
          <div className="flex flex-1 flex-col gap-1">
            <Skeleton className="h-4 w-[70%]" />
            <Skeleton className="h-3.5 w-[40%]" />
          </div>
        </div>
      ))}
    </div>
  );
}
