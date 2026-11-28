"use client";

import { ChevronRight, Cocktail } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { PRESS_CLASS, pressFeedback } from "@/components/app/overlays/press";
import { cn } from "@/lib/utils";

/**
 * The "Your bar" card on `/recipes` (Recipes-Browse 01): a glyph disc, the
 * title, one line of counts ("1 ready · 5 one away") and a chevron. The
 * whole card is the link to What can I make; press .97 with the press sound.
 * A client part so the server-rendered `BarEntryCard` can stay async.
 */
export function BarEntryRow({ summary }: { summary: string }) {
  return (
    <div
      data-testid="bar-entry"
      {...pressFeedback()}
      className={cn(
        "relative flex min-h-16 items-center gap-3 rounded-lg border border-edge bg-card px-4 py-3",
        PRESS_CLASS,
      )}
    >
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-raised text-glyph"
      >
        <Cocktail className="size-5" strokeWidth={1.75} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <Link
          href="/recipes/bar"
          overlay
          underline="none"
          className="t-head text-ink"
        >
          Your bar
        </Link>
        <span className="truncate t-cap text-ink-2">{summary}</span>
      </div>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-3" />
    </div>
  );
}
