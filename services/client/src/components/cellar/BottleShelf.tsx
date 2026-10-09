"use client";

import { useId } from "react";
import { useNow } from "@/hooks/useNow";
import { type CellarGridItem, cellarBottleHref } from "./adapter";
import { BottleCard } from "./BottleCard";
import { PourButton } from "./PourButton";

/**
 * A row of bottles on the cellar dashboard (X04): "Open now" and "Recently
 * added". The same `BottleCard` the collection draws, narrower, in a
 * horizontal scroller that snaps a card to the gutter — a thumb flicks along
 * it without the page moving — each with its one action under it: Pour for
 * the cellar's owners, Check in for anyone else (`PourButton`).
 *
 * It bleeds to the screen's edges on a phone (the page's 16 px gutter becomes
 * the scroller's padding), so the next card peeks in and says "there is more".
 */
export function BottleShelf({
  title,
  detail,
  cellarId,
  cells,
  asOf,
  canPour,
  slot,
}: {
  title: string;
  /** A short count beside the title ("3", "2 this month"). */
  detail?: string;
  cellarId: string;
  cells: readonly CellarGridItem[];
  /** The server's request time: the first render's "now" (`useNow`). */
  asOf: number | null;
  /**
   * The viewer owns (or co-owns) the cellar, so Pour (X03) may open and
   * level its bottles; anyone else who may see it gets Check in.
   */
  canPour: boolean;
  /** `data-slot`, for tests. */
  slot: string;
}) {
  const now = useNow(asOf);
  const headingId = useId();
  if (cells.length === 0) return null;
  return (
    <section
      aria-labelledby={headingId}
      data-slot={slot}
      className="flex flex-col gap-2"
    >
      <div className="flex items-baseline gap-2">
        <h2 id={headingId} className="type-headline">
          {title}
        </h2>
        {detail !== undefined && (
          <span className="type-callout text-ink-3">{detail}</span>
        )}
      </div>
      <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:scroll-px-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        {cells.map((cell) => (
          <li
            key={cell.item.id}
            className="flex w-34 shrink-0 snap-start flex-col gap-2"
          >
            <BottleCard
              cell={cell}
              now={now}
              href={cellarBottleHref(cellarId, cell)}
            />
            <PourButton cellarId={cellarId} cell={cell} canPour={canPour} />
          </li>
        ))}
      </ul>
    </section>
  );
}
