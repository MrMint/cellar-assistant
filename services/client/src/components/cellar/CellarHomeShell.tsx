import { LoadingShell, ShellBlocks } from "@/components/app/LoadingShell";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CellarItemSkeletonCard,
  cellarItemsGridClass,
} from "./CellarItemsGridSkeleton";

/**
 * `/cellars/[id]/items` while it loads (X24 shells, X04's page): the bar and
 * the search, an "Open now" shelf of narrow cards with their Pour buttons,
 * the four stat tiles, the trend card, then the collection's controls and the
 * grid — the merged page's own geometry, so the dashboard does not push the
 * grid down when it lands. The cellar's name is the server's to say, so the
 * title is a block, not text.
 */
export function CellarHomeShell() {
  return (
    <LoadingShell label="cellar" className="flex flex-col gap-4">
      <ShellBlocks className="flex flex-col gap-4">
        <div className="flex min-h-11 items-center">
          <Skeleton className="h-6 w-1/2" />
        </div>
        <Skeleton className="h-11 w-full rounded-md sm:w-60" />
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-28" />
            <div className="-mx-4 flex gap-3 overflow-hidden px-4 sm:mx-0 sm:px-0">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex w-34 shrink-0 flex-col gap-2">
                  <CellarItemSkeletonCard />
                  <Skeleton className="h-11 w-full rounded-md" />
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-40 rounded-lg" />
        </div>
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-11 w-full rounded-md sm:max-w-sm" />
        <div className={cellarItemsGridClass()}>
          {[1, 2, 3, 4].map((i) => (
            <CellarItemSkeletonCard key={i} />
          ))}
        </div>
      </ShellBlocks>
    </LoadingShell>
  );
}
