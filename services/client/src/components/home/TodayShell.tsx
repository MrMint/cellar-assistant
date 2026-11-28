import { ICON_STROKE, Search } from "@/components/app/icons";
import { LoadingShell, ShellBlocks } from "@/components/app/LoadingShell";
import { Page } from "@/components/app/Page";
import { Skeleton } from "@/components/ui/skeleton";
import { HomeColumns, HomeRowsFallback } from "./HomeLayout";
import { SEARCH_PLACEHOLDER } from "./TodayHeader";

/**
 * Home while it loads (X24, X10), in `TodayHeader`'s frame and the page's
 * columns: the heading and count line (placeholders), the search pill drawn
 * as itself — it is a link on the page, and goes nowhere until the page has
 * arrived — then the Open rail's tiles and rows, friends at the side.
 */
export function TodayShell() {
  return (
    <LoadingShell label="home">
      <Page wide className="pb-6">
        <div className="flex flex-col gap-3 pt-2 md:pt-6">
          <ShellBlocks className="flex min-h-10 items-center gap-3">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-20" />
          </ShellBlocks>
          <div className="flex h-11 items-center gap-2 rounded-md border border-edge bg-card px-3 text-ink-3">
            <Search
              aria-hidden
              strokeWidth={ICON_STROKE}
              className="size-5 text-glyph"
            />
            <span className="t-body">{SEARCH_PLACEHOLDER}</span>
          </div>
        </div>
        <HomeColumns
          main={
            <>
              <HomeRowsFallback tiles />
              <HomeRowsFallback />
            </>
          }
          side={<HomeRowsFallback />}
        />
      </Page>
    </LoadingShell>
  );
}
