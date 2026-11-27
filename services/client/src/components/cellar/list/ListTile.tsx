"use client";

import Image from "next/image";
import type { MouseEvent } from "react";
import { LabelPlate } from "@/components/app/LabelPlate";
import { Link } from "@/components/app/Link";
import { useHoldToPeek } from "@/components/app/overlays/useHoldToPeek";
import { CellarTile } from "@/components/app/parts/CellarTile";
import { Heart } from "@/components/app/parts/Heart";
import { PublicRating, Stars } from "@/components/app/parts/Stars";
import { itemTypeTokens } from "@/components/app/TypeChip";
import { cn } from "@/lib/utils";
import { type ListBottle, noteDateLabel, openBadge } from "./model";
import { useFavorite } from "./useFavorite";

export type TileSelect = "pointer" | "keyboard" | null;

export type ListItemProps = {
  bottle: ListBottle;
  /** Hold to peek (phone): opens the quick look on this tile. */
  onPeek: (key: string) => void;
  /**
   * Desktop: a click selects the tile and opens the pane instead of the
   * page. Absent on a phone, where a tap opens the page.
   */
  onOpen?: (key: string) => void;
  /** How it was selected, for the ring's colour; null when not selected. */
  selected?: TileSelect;
  /**
   * Carries the tile's element id (jumps and keyboard moves scroll to it).
   * False where the same bottle may show twice, as on shelves.
   */
  anchor?: boolean;
};

/** The element id a tile carries, for jump-to-letter and keyboard moves. */
export const tileId = (key: string): string => `cellar-tile-${key}`;

/** A click that should open the pane rather than leave for the page. */
const paneClick =
  (onOpen: ((key: string) => void) | undefined, key: string) =>
  (event: MouseEvent<HTMLElement>) => {
    if (onOpen === undefined) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
      return;
    event.preventDefault();
    onOpen(key);
  };

const selectionClass = (selected: TileSelect | undefined) =>
  selected === "keyboard"
    ? "rounded-md outline-2 outline-act-ink outline-offset-2"
    : selected === "pointer"
      ? "rounded-md outline-2 outline-ring-select outline-offset-2"
      : undefined;

/** The no-photo face: the kit's label plate (amendments). */
export function BottlePlate({ bottle }: { bottle: ListBottle }) {
  return (
    <LabelPlate
      type={bottle.type}
      plate={bottle.plate ?? { name: bottle.name }}
      className="absolute inset-0"
    />
  );
}

/**
 * A tile of the cellar list (combined-01): F2b's `CellarTile` with the
 * name as the page link, the heart, the open badge, ×N for identical
 * bottles, and the wide note tile when the owner wrote a note (combined-05).
 * Hold 400 ms to peek; on desktop a click selects it and opens the pane.
 */
export function ListTile({
  bottle,
  onPeek,
  onOpen,
  selected,
  anchor = true,
}: ListItemProps) {
  const hold = useHoldToPeek(() => onPeek(bottle.key));
  const favourite = useFavorite(bottle.itemId, bottle.type, bottle.favorite);
  const glyph = itemTypeTokens[bottle.type].glyph;
  return (
    <div
      id={anchor ? tileId(bottle.key) : undefined}
      data-slot="cellar-list-tile"
      data-key={bottle.key}
      data-hold={hold.phase}
      data-selected={selected ?? undefined}
      {...(onOpen === undefined ? hold.handlers : {})}
      className={cn(
        "relative scroll-mt-40 transition-transform duration-(--ca-dur-micro) ease-standard data-[hold=lifted]:scale-103 motion-reduce:data-[hold=lifted]:scale-100",
        bottle.note !== null && "col-span-2",
        selectionClass(selected),
        // Desktop hover (KIT § 3): the edge brightens to dash, the photo 1.03.
        "[@media(hover:hover)]:[&_article]:hover:border-dash [&_img]:transition-transform [&_img]:duration-(--ca-dur-short) [@media(hover:hover)]:[&:hover_img]:scale-103",
      )}
    >
      <CellarTile
        name={
          <Link
            href={bottle.href}
            overlay
            onClick={paneClick(onOpen, bottle.key)}
            className="outline-none"
          >
            {bottle.name}
          </Link>
        }
        maker={bottle.maker}
        style={bottle.style}
        glyph={glyph}
        photoUrl={bottle.photoUrl}
        plate={<BottlePlate bottle={bottle} />}
        rating={bottle.rating}
        badge={openBadge(bottle)}
        heart={
          <Heart
            on={favourite.on}
            onToggle={favourite.set}
            label={`Favourite ${bottle.name}`}
          />
        }
        wide={
          bottle.note === null
            ? undefined
            : {
                note: `“${bottle.note}”`,
                date: noteDateLabel(bottle.noteDate),
              }
        }
      />
      {bottle.count > 1 && (
        <span
          data-slot="cellar-list-count"
          className="t-micro tabular pointer-events-none absolute top-2 left-2 rounded-sm bg-glass px-[7px] py-[3px] text-on-glass"
        >
          ×{bottle.count}
        </span>
      )}
    </div>
  );
}

/**
 * A row of the rows view (combined-21, desktop-08): a 64 thumb, the name,
 * maker · style, the owner's stars (or the public rating when unrated), and
 * the heart.
 */
export function ListRow({ bottle, onPeek, onOpen, selected }: ListItemProps) {
  const hold = useHoldToPeek(() => onPeek(bottle.key));
  const favourite = useFavorite(bottle.itemId, bottle.type, bottle.favorite);
  const Glyph = itemTypeTokens[bottle.type].glyph;
  const line = [bottle.maker, bottle.style].filter(Boolean).join(" · ");
  const badge = openBadge(bottle);
  return (
    <div
      id={tileId(bottle.key)}
      data-slot="cellar-list-row"
      data-key={bottle.key}
      data-hold={hold.phase}
      data-selected={selected ?? undefined}
      {...(onOpen === undefined ? hold.handlers : {})}
      className={cn(
        "touch-none-select relative flex min-h-[76px] scroll-mt-40 items-center gap-3 px-3 py-1.5 transition-[background-color,transform] duration-(--ca-dur-micro) ease-standard has-[a[data-slot=link]:active]:scale-99 data-[hold=lifted]:scale-101 [@media(hover:hover)]:hover:bg-raised",
        selectionClass(selected),
      )}
    >
      <div className="relative size-16 shrink-0 overflow-hidden rounded-sm bg-raised">
        {bottle.photoUrl ? (
          <Image
            src={bottle.photoUrl}
            alt=""
            fill
            sizes="64px"
            className="object-cover"
          />
        ) : (
          <BottlePlate bottle={bottle} />
        )}
        {bottle.count > 1 && (
          <span className="t-micro tabular absolute top-1 left-1 rounded-sm bg-glass px-1 text-on-glass">
            ×{bottle.count}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          href={bottle.href}
          overlay
          onClick={paneClick(onOpen, bottle.key)}
          className="t-head truncate text-ink outline-none"
        >
          {bottle.name}
        </Link>
        {line !== "" && (
          <span className="flex min-w-0 items-center gap-1.5 text-ink-2">
            <Glyph aria-hidden className="size-3.5 shrink-0 text-glyph" />
            <span className="t-cap truncate">{line}</span>
          </span>
        )}
        <span className="flex items-center gap-2">
          {bottle.rating === null && bottle.publicScore !== null ? (
            <PublicRating
              value={bottle.publicScore}
              count={bottle.publicCount}
            />
          ) : (
            <Stars value={bottle.rating} size="sm" />
          )}
          {badge !== null && (
            <span className="t-micro tabular text-ink-2">{badge}</span>
          )}
        </span>
      </div>
      <div className="relative z-10">
        <Heart
          on={favourite.on}
          onToggle={favourite.set}
          label={`Favourite ${bottle.name}`}
        />
      </div>
    </div>
  );
}
