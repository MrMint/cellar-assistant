import { ICON_STROKE, Search } from "@/components/app/icons";
import { LoadingShell, ShellBlocks } from "@/components/app/LoadingShell";
import { Page } from "@/components/app/Page";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Home while it loads (X24, X10), in `TodayHeader`'s frame: the heading's
 * line and the collection line (placeholders), the search field drawn as
 * itself — it is a link on the page, and goes nowhere until the page has
 * arrived — then the Continue shelf's cards and a block of rows.
 */
export function TodayShell() {
  return (
    <LoadingShell label="home">
      <Page>
        <div className="flex flex-col gap-4 pt-2 sm:pt-6">
          <ShellBlocks className="flex flex-col gap-1">
            <div className="flex min-h-10 items-end">
              <Skeleton className="h-8 w-60" />
            </div>
            <div className="flex min-h-6 items-center">
              <Skeleton className="h-5 w-44" />
            </div>
          </ShellBlocks>
          <div className="flex h-12 items-center gap-2 rounded-md bg-surface-2 px-3 text-ink-3">
            <Search aria-hidden strokeWidth={ICON_STROKE} className="size-5" />
            <span className="type-body">Search bottles, places, recipes</span>
          </div>
        </div>
        <ShellBlocks className="flex flex-col gap-2">
          <Skeleton className="mx-4 h-4 w-20" />
          <div className="flex gap-3 overflow-hidden">
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-72 w-36 shrink-0 rounded-md" />
            ))}
          </div>
        </ShellBlocks>
        <ShellBlocks className="flex flex-col gap-2">
          <Skeleton className="mx-4 h-4 w-24" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </ShellBlocks>
      </Page>
    </LoadingShell>
  );
}
