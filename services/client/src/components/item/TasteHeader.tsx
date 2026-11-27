import { Star } from "@/components/app/icons";
import { formatScore } from "@/components/app/Score";
import { ratingSummary } from "@/components/common/rating/rating";
import { cn } from "@/lib/utils";
import type { TasteCell } from "./item-page-model";

/**
 * What a screen reader hears for one cell: "Friends: rated 4.2 out of 5,
 * 3 friends", or "Friends: No friends' ratings".
 */
export const tasteCellLabel = (cell: TasteCell): string =>
  cell.value === null
    ? `${cell.label}: ${cell.note}`
    : `${cell.label}: ${ratingSummary(cell.value).toLowerCase()}, ${cell.note}`;

/**
 * X09's taste header — **You · Friends · Everyone** — under the hero: your
 * review's score, your friends' average with how many friends, everyone's
 * average with how many ratings (D1 put Rankings' three scopes here). Three
 * equal cells that never reflow; a cell with no number says so in words
 * rather than drawing a zero. No match percentage and no prediction: each
 * figure is an average of reviews somebody wrote (design §3.7).
 *
 * Each cell is a link down the page — You to your review, the other two to
 * the reviews — so the header is also the way to rate.
 */
export function TasteHeader({ cells }: { cells: readonly TasteCell[] }) {
  return (
    <nav
      aria-label="Ratings"
      data-testid="taste-header"
      className="grid grid-cols-3 divide-x divide-line overflow-hidden rounded-lg bg-surface-1"
    >
      {cells.map((cell) => (
        <a
          key={cell.key}
          href={cell.href}
          aria-label={tasteCellLabel(cell)}
          data-cell={cell.key}
          className="flex min-h-[92px] min-w-0 flex-col items-center justify-center gap-1 px-2 py-3 text-center outline-none transition-colors duration-(--ca-dur-short) ease-standard focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-surface-3"
        >
          <span aria-hidden className="t-micro text-ink-3">
            {cell.label}
          </span>
          {cell.value === null ? (
            <span aria-hidden className="t-title leading-none text-ink-3">
              –
            </span>
          ) : (
            <span
              aria-hidden
              className="t-title tabular inline-flex items-center gap-1 leading-none text-ink-1"
            >
              {formatScore(cell.value)}
              <Star
                className={cn(
                  "size-4 fill-current",
                  // Your own stars are brass, as in RatingInput and ItemCard.
                  cell.key === "you" ? "text-primary" : "text-ink-3",
                )}
                strokeWidth={0}
              />
            </span>
          )}
          <span
            aria-hidden
            className={cn(
              "t-cap text-ink-3 max-w-full truncate",
              cell.key === "you" && cell.value === null && "text-ink-1",
            )}
          >
            {cell.note}
          </span>
        </a>
      ))}
    </nav>
  );
}
