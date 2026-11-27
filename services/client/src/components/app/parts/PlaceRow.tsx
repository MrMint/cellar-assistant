import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { type AppIcon, ICON_STROKE } from "../icons";
import { type Band, RankChip } from "./Rank";
import { PublicRating } from "./Stars";

/**
 * KIT § 2 "Place row": a card, 56 minimum, with a 54 thumb (the photo, or
 * the place's kind glyph flat on raised: "Place its kind glyph, flat"), the
 * name in t-head, the kind glyph with "area · distance" in t-cap, and the
 * public rating at the right. A ranked place adds its band chip after the
 * name, and the owner's #1 its crown. Press .97. To make it a link, put an
 * `app/Link` with `overlay` in `name`.
 */
export function PlaceRow({
  name,
  glyph: Glyph,
  photoUrl,
  where,
  rating,
  ratingCount,
  rank,
  className,
}: {
  name: ReactNode;
  /** The place's kind glyph (coffee, food, bar…). */
  glyph: AppIcon;
  photoUrl?: string | null;
  /** "Wauwatosa · 1.7 km", with a narrow no-break space before the unit. */
  where: string;
  rating?: number | null;
  ratingCount?: number | null;
  /** The owner's rank on a list; `crown` only for their own #1. */
  rank?: { rank: number; band: Band; crown?: boolean };
  className?: string;
}) {
  return (
    <div
      data-slot="place-row"
      className={cn(
        "relative flex min-h-14 overflow-hidden rounded-md border border-edge bg-card transition-transform duration-(--ca-dur-micro) ease-standard has-[a[data-slot=link]:active]:scale-97 motion-reduce:has-[a[data-slot=link]:active]:scale-100",
        className,
      )}
    >
      <div className="relative flex w-[54px] shrink-0 items-center justify-center self-stretch bg-raised">
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt=""
            fill
            sizes="54px"
            className="object-cover"
          />
        ) : (
          <Glyph aria-hidden strokeWidth={1.25} className="size-6 text-glyph" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-px px-2.5 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="t-head min-w-0 flex-1 truncate text-ink">
            {name}
          </span>
          {rank !== undefined && (
            <RankChip
              rank={rank.rank}
              band={rank.band}
              crown={rank.crown ?? false}
            />
          )}
        </div>
        <div className="flex min-w-0 items-center gap-1 text-ink-2">
          <Glyph
            aria-hidden
            strokeWidth={ICON_STROKE}
            className="size-3.5 shrink-0 text-glyph"
          />
          <span className="t-cap tabular min-w-0 flex-1 truncate">{where}</span>
          <PublicRating value={rating} count={ratingCount} />
        </div>
      </div>
    </div>
  );
}
