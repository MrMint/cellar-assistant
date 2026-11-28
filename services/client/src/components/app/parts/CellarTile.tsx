import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { type AppIcon, ICON_STROKE } from "../icons";
import { formatKitScore, Stars } from "./Stars";

export type CellarTileProps = {
  /** The name; put an `app/Link` with `overlay` here to make the tile a link. */
  name: ReactNode;
  maker?: string | null;
  /** The style line under the maker, with its kind glyph. */
  style?: string | null;
  glyph?: AppIcon;
  /** The photo, or `plate` (a `LabelPlate`) when there is none. */
  photoUrl?: string | null;
  plate?: ReactNode;
  /** The owner's rating; null draws empty stars and no score. */
  rating?: number | null;
  /** The photo badge, e.g. "Open · 16%". */
  badge?: string | null;
  /** A `Heart`, sitting at the right of the style line. */
  heart?: ReactNode;
  /** Wide tile: spans two columns with the note beside the photo. */
  wide?: { note: string; date?: string };
  className?: string;
};

/**
 * KIT § 2 "Cellar tile": a card with a 1 px edge, r8; a square photo (or the
 * no-photo plate); the name in t-head (two lines then an ellipsis), the maker
 * in t-cap; a raised foot of the owner's stars and their score, or empty
 * stars when not rated (amendments: no "Rate" in the foot, no action in the
 * foot). The wide tile spans two columns and sets the note in t-quote beside
 * the photo, the date at the foot's end. Press .97 while its link is held.
 * The owner's stars never move.
 */
export function CellarTile({
  name,
  maker,
  style,
  glyph: Glyph,
  photoUrl,
  plate,
  rating,
  badge,
  heart,
  wide,
  className,
}: CellarTileProps) {
  const rated = rating !== null && rating !== undefined;
  const photo = (
    <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-raised">
      {photoUrl ? (
        <Image
          src={photoUrl}
          alt=""
          fill
          sizes={wide ? "180px" : "(min-width: 600px) 240px, 50vw"}
          className="object-cover"
        />
      ) : (
        plate
      )}
      {badge && (
        <span className="t-micro tabular absolute bottom-2.5 left-2 rounded-sm bg-glass px-[7px] py-[3px] text-on-glass">
          {badge}
        </span>
      )}
    </div>
  );
  return (
    <article
      data-slot="cellar-tile"
      data-wide={wide !== undefined ? "" : undefined}
      className={cn(
        "touch-none-select relative flex flex-col overflow-hidden rounded-md border border-edge bg-card transition-transform duration-(--ca-dur-micro) ease-standard has-[a[data-slot=link]:active]:scale-97 has-[a[data-slot=link]:focus-visible]:outline-2 has-[a[data-slot=link]:focus-visible]:outline-act-ink motion-reduce:has-[a[data-slot=link]:active]:scale-100",
        wide !== undefined && "col-span-2",
        className,
      )}
    >
      {wide !== undefined ? (
        <div className="flex">
          <div className="w-[min(46%,180px)] shrink-0">{photo}</div>
          <p className="t-quote m-0 min-w-0 flex-1 overflow-hidden border-rule border-l px-3.5 py-3 text-ink">
            {wide.note}
          </p>
        </div>
      ) : (
        photo
      )}
      <div className="flex min-h-[69px] flex-col px-3 pt-[5px] pb-1.5">
        <h3 className="t-head m-0 line-clamp-2 text-ink">{name}</h3>
        <div className="flex flex-col gap-0.5">
          {maker && <span className="t-cap truncate text-ink-2">{maker}</span>}
          {style && (
            <span className="mr-[26px] flex h-[17px] min-w-0 items-center gap-1.5 text-ink-2">
              {Glyph && (
                <Glyph
                  aria-hidden
                  strokeWidth={ICON_STROKE}
                  className="size-3.5 shrink-0 text-glyph"
                />
              )}
              <span className="t-cap truncate">{style}</span>
            </span>
          )}
        </div>
      </div>
      {heart !== undefined && (
        <div className="absolute right-0 bottom-[38px] z-10">{heart}</div>
      )}
      <div className="mt-auto flex h-[45px] items-center gap-2 border-rule border-t bg-raised pr-2.5 pl-[11px]">
        <Stars value={rating} size="md" />
        {rated && (
          <span className="t-title tabular text-ink">
            {formatKitScore(rating)}
          </span>
        )}
        {wide?.date !== undefined && (
          <span className="t-cap tabular mr-[30px] ml-auto text-ink-3">
            {wide.date}
          </span>
        )}
      </div>
    </article>
  );
}
