import { ICON_STROKE, Search } from "@/components/app/icons";
import { LoadingShell, ShellBlocks } from "@/components/app/LoadingShell";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchDiscoverySkeleton } from "./SearchResultsSkeleton";

/**
 * Home (`/search`) while it loads (X24), in `SearchPageLayout`'s landing
 * frame: the greeting and the collection line, the search box (drawn, not
 * live — it takes a tap only once the page has arrived, so the real input
 * is the one that gets focus, N01), then the discovery section's own
 * skeleton. (No quick-link chips: X01 took them off the page.)
 */
export function SearchLandingShell() {
  return (
    <LoadingShell label="home" className="flex flex-col gap-6 pt-4 sm:pt-8">
      <ShellBlocks className="flex flex-col items-center gap-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-5 w-44" />
      </ShellBlocks>
      <div className="w-full max-w-150 self-center">
        <div className="flex h-12 items-center gap-2 rounded-md bg-surface-2 px-3">
          <Search
            aria-hidden
            strokeWidth={ICON_STROKE}
            className="size-5 opacity-50"
          />
          <span className="type-body flex-1 text-ink-3">Search</span>
          {/* Where the box's Scan (and Photo) pills sit. */}
          <ShellBlocks>
            <Skeleton className="h-8 w-18 rounded-full" />
          </ShellBlocks>
        </div>
      </div>
      <ShellBlocks>
        <SearchDiscoverySkeleton />
      </ShellBlocks>
    </LoadingShell>
  );
}
