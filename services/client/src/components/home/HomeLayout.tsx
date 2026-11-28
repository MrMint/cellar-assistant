import type { ReactNode } from "react";
import { EmptyState } from "@/components/app/EmptyState";
import { Camera, ICON_STROKE } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { ShellBlocks } from "@/components/app/LoadingShell";
import { SpiritGlyph } from "@/components/app/parts/glyphs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Home's two columns from `md` (Shell-Home-desktop): the person's own things
 * at the left, friends at the right. On a phone they are one column, the
 * friends after the rest.
 */
export function HomeColumns({
  main,
  side,
}: {
  main: ReactNode;
  side: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] md:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] xl:gap-8">
      <div data-slot="home-main" className="flex min-w-0 flex-col gap-8">
        {main}
      </div>
      <aside
        aria-label="Friends"
        data-slot="home-side"
        className="flex min-w-0 flex-col gap-8"
      >
        {side}
      </aside>
    </div>
  );
}

/**
 * A Home section's head: its name in t-head, its count in ink-3, and one
 * trailing action ("See all", "Map") as a 44-tall quiet text button.
 */
export function SectionHead({
  id,
  title,
  count,
  action,
}: {
  id: string;
  title: string;
  /** Tabular, beside the name; omitted for none. */
  count?: number | string | null;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-2">
      <h2 id={id} className="t-head m-0 flex items-baseline gap-2 text-ink">
        {title}
        {count !== undefined && count !== null && (
          <span className="t-cap tabular text-ink-3">{count}</span>
        )}
      </h2>
      {action}
    </div>
  );
}

/** The "See all" on a section head: quiet act-ink text, 44 tall. Its box ends at the 16 px gutter (F-130: a `-mr-2` pulled it 8 px past). */
export const SEE_ALL_CLASS =
  "t-head flex min-h-11 min-w-11 items-center justify-end rounded-md text-act-ink outline-none focus-visible:outline-2 focus-visible:outline-act-ink active:opacity-60 [@media(hover:hover)]:hover:opacity-70";

/**
 * The new-person Home (Shell-Home "New person"): the bottle glyph, one line,
 * and the one way on, the camera. No count that isn't theirs (CROSS-LOT 3):
 * nothing here, and no count line over it.
 */
export function NewPersonHero() {
  return (
    <section
      aria-label="Start with a bottle"
      data-slot="new-person"
      className="flex min-h-[50dvh] items-center justify-center"
    >
      <EmptyState
        illustration={<SpiritGlyph aria-hidden strokeWidth={ICON_STROKE} />}
        title="Start with a bottle"
        description="Snap its label to add it"
        action={
          <Button asChild>
            <Link href="/add?mode=bottle" underline="none">
              <Camera aria-hidden strokeWidth={ICON_STROKE} />
              Open camera
            </Link>
          </Button>
        }
      />
    </section>
  );
}

/** A section's placeholder while it streams: a head, then rows or tiles. */
export function HomeRowsFallback({ tiles = false }: { tiles?: boolean }) {
  return (
    <ShellBlocks className="flex flex-col gap-2">
      <Skeleton className="h-5 w-28" />
      {tiles ? (
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2].map((key) => (
            <Skeleton
              key={key}
              className={cn("aspect-[3/4] w-40 shrink-0 rounded-md md:w-48")}
            />
          ))}
        </div>
      ) : (
        <Skeleton className="h-40 w-full rounded-md" />
      )}
    </ShellBlocks>
  );
}
