import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The items grid's columns (the old Joy `Grid` breakpoints xs 6 · sm 6 · md 4
 * · lg 3 · xl 2 of 12): one column on a phone for a cellar of six bottles or
 * fewer, two above that, then 2 / 3 / 4 / 6. `useColumnCount` mirrors these
 * for the virtualizer, so the two must change together.
 */
export function cellarItemsGridClass(itemCount: number): string {
  return cn(
    "grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6",
    itemCount > 6 ? "grid-cols-2" : "grid-cols-1",
  );
}

/** One placeholder tile, shaped like an `ItemCard`: art, a title line, a bar. */
export function CellarItemSkeletonCard() {
  return (
    <div
      aria-hidden
      className="flex min-w-0 flex-col overflow-hidden rounded-lg bg-surface-1"
    >
      <Skeleton className="aspect-[1.2] rounded-none sm:aspect-square" />
      <Skeleton className="m-2 h-4" />
      <Skeleton className="h-10 rounded-none" />
    </div>
  );
}

/**
 * Skeleton placeholder for the items grid.
 * Used as Suspense fallback while items are loading.
 */
export function CellarItemsGridSkeleton() {
  return (
    <div className={cellarItemsGridClass(8)}>
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <CellarItemSkeletonCard key={i} />
      ))}
    </div>
  );
}
