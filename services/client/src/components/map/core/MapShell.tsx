import { ICON_STROKE, Search } from "@/components/app/icons";
import { LoadingShell, ShellBlocks } from "@/components/app/LoadingShell";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The map before MapLibre has drawn (X24): the canvas's theme surface edge to
 * edge — never a spinner on a blank page, never a cream flash (N22) — and the
 * search panel where `MapControls` will put it, so the one thing a thumb
 * reaches for is already in place. On a phone that is the full-width card
 * with the type toggles and the actions under the box; from 769 px the box
 * alone, top left.
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
        "relative flex h-full min-h-0 w-full flex-auto flex-col overflow-hidden bg-surface-1",
        className,
      )}
    >
      {/* `min-[769px]`: MapControls' own phone/desktop switch (768 px). */}
      <div className="absolute inset-x-2 top-2 min-[769px]:inset-x-auto min-[769px]:top-4 min-[769px]:left-4 min-[769px]:w-[calc(50%-24px)] min-[769px]:max-w-[375px]">
        <div className="rounded-md bg-surface-1 p-2 shadow-md">
          <div className="flex h-10 items-center gap-2 px-3">
            <Search
              aria-hidden
              strokeWidth={ICON_STROKE}
              className="size-4 text-ink-2"
            />
            <span className="type-body text-ink-3">Search places...</span>
          </div>
          {/* Phones: the six type toggles and the filter, then the actions. */}
          <ShellBlocks className="mt-1 flex flex-col gap-2 border-line border-t pt-2 min-[769px]:hidden">
            <div className="flex h-9 items-center gap-2 px-1">
              {["wine", "beer", "spirit", "coffee", "sake", "tea"].map((t) => (
                <Skeleton key={t} className="size-7 rounded-full" />
              ))}
              <Skeleton className="ml-auto size-9 rounded-md" />
            </div>
            <div className="flex h-9 items-center gap-2 px-1">
              {["add-place", "locate", "theme"].map((a) => (
                <Skeleton key={a} className="size-8 rounded-md" />
              ))}
            </div>
          </ShellBlocks>
        </div>
      </div>
      {status !== undefined && (
        <div className="flex flex-1 items-center justify-center">
          <p
            aria-hidden
            className="type-callout rounded-md bg-surface-2 px-4 py-3 text-ink-1"
          >
            {status}
          </p>
        </div>
      )}
    </LoadingShell>
  );
}
