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
