import { Close, ICON_STROKE, Search } from "@/components/app/icons";
import { LoadingShell, ShellBlocks } from "@/components/app/LoadingShell";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The search sheet while it loads (X24, X10), in its own frame: the title
 * and Close, then the box (drawn, not live — it takes a tap only once the
 * page has arrived, so the real input is the one that gets focus, N01).
 */
export function SearchLandingShell() {
  return (
    <LoadingShell
      label="search"
      className="mx-auto flex w-full max-w-[720px] flex-col gap-6"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="type-title-2 text-ink-1">Search</p>
        <span className="-mr-2 flex size-11 items-center justify-center text-ink-3">
          <Close aria-hidden strokeWidth={ICON_STROKE} className="size-5" />
        </span>
      </div>
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
    </LoadingShell>
  );
}
