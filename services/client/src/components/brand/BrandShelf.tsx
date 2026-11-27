"use client";

import { type ReactNode, useMemo, useState } from "react";
import { EmptyState } from "@/components/app/EmptyState";
import { ChevronLeft } from "@/components/app/icons";
import { LabelPlate } from "@/components/app/LabelPlate";
import { Link } from "@/components/app/Link";
import { CellarTile } from "@/components/app/parts/CellarTile";
import { Heart } from "@/components/app/parts/Heart";
import { SegmentedControl } from "@/components/app/SegmentedControl";
import { itemTypeTokens } from "@/components/app/TypeChip";
import { useFavorite } from "@/components/cellar/list/useFavorite";
import { feedback } from "@/lib/feedback";
import { type BrandTile, brandSubtitle, shelfCellars } from "./shelf";

const ALL = "all";

function BrandTileView({
  tile,
  badge,
}: {
  tile: BrandTile;
  badge: string | null;
}) {
  const favourite = useFavorite(tile.itemId, tile.type, tile.favorite);
  return (
    <div data-slot="brand-tile" data-key={tile.key}>
      <CellarTile
        name={
          <Link
            href={tile.href}
            overlay
            onClick={() => feedback("press")}
            className="outline-none"
          >
            {tile.name}
          </Link>
        }
        maker={tile.maker}
        style={tile.style}
        glyph={itemTypeTokens[tile.type].glyph}
        photoUrl={tile.photoUrl}
        plate={
          <LabelPlate
            type={tile.type}
            plate={tile.plate ?? { name: tile.name }}
            className="absolute inset-0"
          />
        }
        rating={tile.rating}
        badge={badge}
        heart={
          <Heart
            on={favourite.on}
            onToggle={favourite.set}
            label={`Favourite ${tile.name}`}
          />
        }
      />
    </div>
  );
}

/**
 * A brand's page (lot-cellars-shelves-16, -17): its name over "Beer · 23
 * drinks", All or "In <cellar>" for each of your cellars holding some, and a
 * kit tile per drink, badged with the cellar it is in.
 */
export function BrandShelf({
  name,
  tiles,
  total,
  footer,
  children,
}: {
  name: string;
  tiles: readonly BrandTile[];
  /** Every drink of the brand, not only the pages loaded so far. */
  total: number | null;
  /** "Show more", under the tiles. */
  footer?: ReactNode;
  /** The rest of the page (about, makers it owns, places). */
  children?: ReactNode;
}) {
  const [where, setWhere] = useState<string>(ALL);
  const cellars = useMemo(() => shelfCellars(tiles), [tiles]);
  const count = total ?? tiles.length;
  const shown =
    where === ALL
      ? tiles
      : tiles.filter((tile) => tile.cellars.some((c) => c.id === where));
  const badgeOf = (tile: BrandTile) => {
    if (where !== ALL) return null;
    const first = tile.cellars[0];
    return first === undefined ? null : `In ${first.name}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex min-h-11 items-start gap-2">
        <Link
          href="/search?in=brands"
          aria-label="Brands"
          onClick={() => feedback("press")}
          className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-md text-ink outline-none focus-visible:outline-2 focus-visible:outline-act-ink"
        >
          <ChevronLeft aria-hidden className="size-6" />
        </Link>
        <div className="flex min-w-0 flex-col">
          <h1 className="t-title m-0 text-ink">{name}</h1>
          <p className="t-body m-0 tabular text-ink-2">
            {brandSubtitle(tiles, count)}
          </p>
        </div>
      </header>
      {cellars.length > 0 && (
        <SegmentedControl
          aria-label="Show"
          value={where}
          onValueChange={setWhere}
          options={[
            { value: ALL, label: "All", count },
            ...cellars.map((cellar) => ({
              value: cellar.id,
              label: `In ${cellar.name}`,
              count: cellar.count,
            })),
          ]}
        />
      )}
      {shown.length === 0 ? (
        <EmptyState
          title="No drinks yet"
          description={`Nothing from ${name} has been added yet.`}
          className="rounded-lg bg-card"
        />
      ) : (
        <ul className="m-0 grid list-none grid-cols-2 gap-4 p-0 md:grid-cols-[repeat(auto-fill,minmax(184px,1fr))]">
          {shown.map((tile) => (
            <li key={tile.key} className="min-w-0">
              <BrandTileView tile={tile} badge={badgeOf(tile)} />
            </li>
          ))}
        </ul>
      )}
      {where === ALL && footer}
      {children}
    </div>
  );
}
