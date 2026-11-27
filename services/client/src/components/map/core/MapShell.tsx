import { ICON_STROKE, Search } from "@/components/app/icons";
import { LoadingShell, ShellBlocks } from "@/components/app/LoadingShell";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function SearchPill() {
  return (
    <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-md border border-edge-2 bg-card px-3">
      <Search
        aria-hidden
        strokeWidth={ICON_STROKE}
        className="size-5 text-ink-3"
      />
      <span className="t-body truncate text-ink-3">Search places...</span>
    </div>
  );
}

function ListBlocks({ rows }: { rows: number }) {
  return (
    <ShellBlocks className="flex flex-col gap-3">
      <div className="flex gap-2">
        {["mine", "coffee", "food", "bar"].map((chip) => (
          <Skeleton key={chip} className="h-11 w-20 shrink-0 rounded-md" />
        ))}
      </div>
      <Skeleton className="h-5 w-24 rounded-xs" />
      {Array.from({ length: rows }, (_, n) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity.
        <Skeleton key={n} className="h-14 rounded-md" />
      ))}
    </ShellBlocks>
  );
}

/**
 * The map before MapLibre has drawn (X24): the canvas's theme surface edge to
 * edge — never a spinner on a blank page, never a cream flash (N22) — and the
 * list where the map will put it, so the search is already in reach. On a
 * phone that is the dock resting over the lower map (Map board: two and a
 * half rows); from `md` the list column beside the map (desktop/Places).
 *
 * One shell for every stage the map passes through: the route's
 * `loading.tsx`, the page's Suspense fallback, the renderer's lazy chunk and
 * the wait for a location (`status`, a line over the canvas). Each stage
 * swaps the same frame for the same frame, so nothing jumps.
 */
export function MapShell({
  status,
  className,
}: {
  /**
   * A visible line over the canvas ("Getting your location..."), which is
   * also what the shell's status line announces — the wait it names, not
   * "Loading the map…".
   */
  status?: string;
  className?: string;
}) {
  return (
    <LoadingShell
      label="the map"
      announce={status}
      data-slot="map-shell"
      className={cn(
        "relative flex h-full min-h-0 w-full flex-auto overflow-hidden bg-surface-1",
        className,
      )}
    >
      {/* Desktop: the list column beside the map. */}
      <div className="hidden h-full w-[min(45%,800px)] min-w-[400px] shrink-0 flex-col gap-4 border-edge border-r bg-bg px-6 pt-5 md:flex">
        <Skeleton className="h-7 w-40 rounded-xs" />
        <SearchPill />
        <ListBlocks rows={6} />
      </div>
      <div className="relative flex min-w-0 flex-1 flex-col">
        {status !== undefined && (
          <div className="flex flex-1 items-center justify-center pb-[348px] md:pb-0">
            <p
              aria-hidden
              className="t-body rounded-md bg-surface-2 px-4 py-3 text-ink"
            >
              {status}
            </p>
          </div>
        )}
        {/* Phone: the dock at rest. */}
        <div className="absolute inset-x-0 bottom-0 flex h-[348px] flex-col gap-3 rounded-t-lg border-edge border-t bg-surface-1 px-4 pt-9 shadow-dock md:hidden">
          <div className="flex gap-2">
            <SearchPill />
            <Skeleton className="size-11 shrink-0 rounded-md" />
          </div>
          <ListBlocks rows={3} />
        </div>
      </div>
    </LoadingShell>
  );
}
