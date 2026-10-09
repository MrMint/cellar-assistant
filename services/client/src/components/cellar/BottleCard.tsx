import Image from "next/image";
import { LabelPlate } from "@/components/app/LabelPlate";
import { Link } from "@/components/app/Link";
import { Score } from "@/components/app/Score";
import { itemTypeTokens } from "@/components/app/TypeChip";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { cn } from "@/lib/utils";
import { getNextPlaceholder } from "@/utilities";
import type { CellarGridItem } from "./adapter";
import { bottleState } from "./bottle-state";

/**
 * The level bar's fill: the type's text-safe hue, which holds 3:1 against
 * the surface-3 track (a graphic carrying meaning, WCAG 1.4.11) where the
 * deep hue does not for coffee. Written out so Tailwind can see them.
 */
export const LEVEL_FILL: Readonly<Record<ApiItemType, string>> = {
  WINE: "bg-type-wine-text",
  BEER: "bg-type-beer-text",
  SPIRIT: "bg-type-spirit-text",
  SAKE: "bg-type-sake-text",
  COFFEE: "bg-type-coffee-text",
  TEA: "bg-type-tea-text",
};

/** "2016 Barolo" for a wine with a year, as the restored ItemCard titled it. */
const cardTitle = (cell: CellarGridItem): string =>
  cell.type === "WINE" && cell.item.vintage !== undefined
    ? `${cell.item.vintage} ${cell.item.name}`
    : cell.item.name;

/**
 * What a screen reader hears for a ×N card: the lead bottle's state, then the
 * rest — "Open 8 days, 40% left. 3 bottles, 1 open."
 */
export const groupSpoken = (
  spoken: string,
  group: CellarGridItem["group"],
): string => {
  if (group === undefined || group.count <= 1) return spoken;
  return `${spoken}. ${group.count} bottles, ${group.openCount} open.`;
};

export type BottleCardProps = {
  cell: CellarGridItem;
  href: string;
  /**
   * The instant ages are measured from ("Open · 8d"). The grid seeds it from
   * the server's request so the first render matches hydration, then moves
   * it on; null prints states without ages.
   */
  now: number | null;
  /** Runs before navigating (the grid saves its scroll position). */
  onClick?: () => void;
};

/**
 * A bottle in a cellar grid (N13b): the photo — or its LabelPlate (N28) —
 * with your own stars on it, the name, and the bottle's state: "Sealed",
 * "Open · 8d" with how much is left, or "Finished", over a level bar.
 *
 * Replaces the restored ItemCard here, whose footer was the catalog's
 * favourite and review counts — "0 ♥ 0 💬" on nearly every bottle you own
 * (visual-11). Love and reviews live on the item page.
 *
 * The whole tile is one target: the title link, stretched over it. Nothing
 * else on the card is interactive, so there is nothing for it to swallow.
 *
 * X04: a card can stand for identical bottles — "×3" on the plate, the lead
 * bottle's state under it (the one the list put first: the open one, under
 * "Open first"), and the link goes to that bottle. A search's meaning match
 * says so under the state, so a near neighbour never reads as the bottle
 * asked for.
 */
export function BottleCard({ cell, href, now, onClick }: BottleCardProps) {
  const { item, type } = cell;
  const state = bottleState(cell.bottle, now);
  const finished = state.kind === "finished";
  const title = cardTitle(cell);
  const photo = item.displayImageUrl;
  const count = cell.group?.count ?? 1;
  const similar = cell.group?.match === "MEANING";

  return (
    <div
      data-slot="bottle-card"
      data-state={state.kind}
      className="relative flex min-w-0 flex-col overflow-hidden rounded-md bg-surface-2 text-ink-1 transition-[background-color,transform] duration-(--ca-dur-micro) ease-standard hover:bg-surface-3 has-[a:active]:scale-97 motion-reduce:has-[a:active]:scale-100"
    >
      <div
        className={cn(
          "relative aspect-3/4 overflow-hidden",
          itemTypeTokens[type].tintClass,
        )}
      >
        {photo !== undefined ? (
          <Image
            src={photo}
            alt=""
            fill
            sizes="(min-width: 1536px) 17vw, (min-width: 1200px) 25vw, (min-width: 900px) 33vw, 50vw"
            placeholder={getNextPlaceholder(item.placeholder)}
            className={cn(
              "object-cover",
              finished && "opacity-55 grayscale-[35%]",
            )}
          />
        ) : (
          <LabelPlate
            type={type}
            plate={item.plate ?? { name: item.name }}
            muted={finished}
          />
        )}
        {count > 1 && (
          <span
            data-slot="bottle-card-count"
            aria-hidden
            className="surface-glass type-footnote absolute top-2 left-2 rounded-full px-2 py-0.5 font-semibold text-ink-1 tabular"
          >
            ×{count}
          </span>
        )}
        {item.myScore !== null && item.myScore !== undefined && (
          <span
            data-slot="bottle-card-score"
            className="surface-glass absolute top-2 right-2 rounded-full"
          >
            <Score
              variant="pill"
              value={item.myScore}
              className="bg-transparent"
            />
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5 px-3 pt-2.5 pb-3">
        <Link
          overlay
          underline="none"
          href={href}
          onClick={onClick}
          className="type-callout line-clamp-2 min-h-10 font-semibold text-ink-1 focus-visible:after:rounded-md focus-visible:after:ring-inset"
        >
          {title}
        </Link>
        <p
          data-slot="bottle-state"
          className="type-footnote flex items-center justify-between gap-2"
        >
          <span aria-hidden className="min-w-0 truncate">
            {state.label}
          </span>
          {state.kind === "open" && (
            <span aria-hidden className="tabular shrink-0">
              {Math.round(state.level)}%
            </span>
          )}
          <span className="sr-only">
            {groupSpoken(state.spoken, cell.group)}
          </span>
        </p>
        {similar && (
          <p data-slot="bottle-card-match" className="type-footnote text-ink-3">
            Similar to your search
          </p>
        )}
        <div
          aria-hidden
          data-slot="bottle-level"
          className="h-1 w-full overflow-hidden rounded-full bg-surface-3"
        >
          <div
            className={cn(
              "h-full w-full origin-left rounded-full transition-transform duration-(--ca-dur-medium) ease-standard motion-reduce:transition-none",
              state.kind === "open" ? LEVEL_FILL[type] : "bg-ink-3/40",
            )}
            style={{ transform: `scaleX(${state.level / 100})` }}
          />
        </div>
      </div>
    </div>
  );
}
