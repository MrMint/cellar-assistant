import { Skeleton } from "@/components/ui/skeleton";

/**
 * The items grid's columns: two on a phone, then 3 / 4 / 6 from md / lg / xl.
 * `useColumnCount` mirrors these for the virtualizer, so the two must change
 * together. (The restored grid went to one column for six bottles or fewer;
 * a 3:4 BottleCard at full phone width is one bottle per screen.)
 */
export function cellarItemsGridClass(): string {
  return "grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6";
}

/** One placeholder tile, shaped like a `BottleCard`: plate, title, state, level. */
export function CellarItemSkeletonCard() {
  return (
    <div
      aria-hidden
      className="flex min-w-0 flex-col overflow-hidden rounded-md bg-surface-2"
    >
      <Skeleton className="aspect-3/4 rounded-none" />
      <div className="flex flex-col gap-1.5 px-3 pt-2.5 pb-3">
        <Skeleton className="h-10 w-4/5" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-1 w-full" />
      </div>
    </div>
  );
}

/**
 * Skeleton placeholder for the items grid.
 * Used as Suspense fallback while items are loading.
 */
export function CellarItemsGridSkeleton() {
  return (
    <div className={cellarItemsGridClass()}>
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <CellarItemSkeletonCard key={i} />
      ))}
    </div>
  );
}
