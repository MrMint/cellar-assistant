import { ICON_STROKE, People } from "@/components/app/icons";
import { formatScore } from "@/components/app/Score";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { ratingSummary } from "@/components/common/rating/rating";
import { cn } from "@/lib/utils";
import { FriendsRatingsCell } from "./friends/FriendsRatingsSheet";
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
 * The taste header (Cellars-Pour): **Your rating** on the left, and on the
 * right the two numbers to compare it with — "Friends 4.3" and everyone's
 * "4.0 (3)". A number nobody gave is a dash, never a zero, and no match
 * percentage or prediction: each figure is an average of reviews somebody
 * wrote (design §3.7). Your own stars sit under it, on the page.
 *
 * Each part is a link down the page — yours to your review, Everyone to the
 * reviews — so the header is also the way to rate. Friends, once a friend
 * has rated it, opens the Friends' ratings sheet instead (F-154,
 * Cellars-Pour); with no item to read it for, it stays a link.
 */
export function TasteHeader({
  cells,
  itemId,
  itemType,
}: {
  cells: readonly TasteCell[];
  itemId?: string;
  itemType?: ApiItemType;
}) {
  const you = cells.find((cell) => cell.key === "you");
  const others = cells.filter((cell) => cell.key !== "you");
  return (
    <nav
      aria-label="Ratings"
      data-testid="taste-header"
      className="flex min-h-11 items-center justify-between gap-3"
    >
      {you !== undefined && (
        <a
          href={you.href}
          aria-label={tasteCellLabel(you)}
          data-cell={you.key}
          className={cn(LINK, "t-cap font-semibold text-ink-2")}
        >
          Your rating
        </a>
      )}
      <span className="flex min-w-0 items-center gap-4">
        {others.map((cell) => {
          const body = (
            <>
              {cell.key === "friends" ? (
                <span aria-hidden>Friends</span>
              ) : (
                <People
                  aria-hidden
                  strokeWidth={ICON_STROKE}
                  className="size-4 text-ink-3"
                />
              )}
              <span
                aria-hidden
                className={cn(
                  "t-head tabular leading-none",
                  cell.value === null ? "text-ink-3" : "text-ink",
                )}
              >
                {cell.value === null ? "–" : formatScore(cell.value)}
              </span>
              {cell.key === "everyone" && cell.value !== null && (
                <span aria-hidden className="tabular text-ink-3">
                  ({countOf(cell.note)})
                </span>
              )}
            </>
          );
          const className = cn(LINK, "t-cap gap-1.5 text-ink-2");
          if (
            cell.key === "friends" &&
            cell.value !== null &&
            itemId !== undefined &&
            itemType !== undefined
          ) {
            return (
              <FriendsRatingsCell
                key={cell.key}
                itemId={itemId}
                itemType={itemType}
                label={tasteCellLabel(cell)}
                className={className}
              >
                {body}
              </FriendsRatingsCell>
            );
          }
          return (
            <a
              key={cell.key}
              href={cell.href}
              aria-label={tasteCellLabel(cell)}
              data-cell={cell.key}
              className={className}
            >
              {body}
            </a>
          );
        })}
      </span>
    </nav>
  );
}

const LINK =
  "inline-flex min-h-11 min-w-0 items-center rounded-md outline-none transition-colors duration-(--ca-dur-short) ease-standard focus-visible:ring-[3px] focus-visible:ring-ring/50 active:text-ink";

/** "12 ratings" → "12": the count the note already carries. */
const countOf = (note: string): string => note.split(" ")[0] ?? note;
