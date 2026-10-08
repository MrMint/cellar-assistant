"use client";

/**
 * The pieces the place page (`PlaceDetails`) and the map drawer's body
 * (`PlaceDetailsContent`) both draw: the category glyph in its tile and the
 * Love / Mark Visited toggles. Joy drew a toggled-on Save as a solid red slab
 * and Visited as a solid green one; design §3.1 bans both, so "on" is a
 * filled glyph on the secondary surface (a claret heart, a success check)
 * and the label still says which state it is in.
 *
 * D27 renamed the heart: it is Love ("Loved"), no longer Save — Save is now
 * the Want to try bookmark (`want-to-try/WantToTryButton`, X08), which these
 * pages draw beside it.
 */

import type React from "react";
import {
  Cocktail,
  ICON_STROKE,
  Love,
  Place,
  Restaurant,
  Success,
  Unrated,
} from "@/components/app/icons";
import { TypeGlyph } from "@/components/app/TypeChip";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** The glyph for a place's main category (the old `getCategoryIcon`). */
export function PlaceCategoryGlyph({
  category,
  className,
}: {
  category: string | undefined;
  className?: string;
}) {
  const classes = cn("size-6 shrink-0", className);
  switch (category) {
    case "restaurant":
      return (
        <Restaurant aria-hidden strokeWidth={ICON_STROKE} className={classes} />
      );
    case "bar":
    case "pub":
      return (
        <Cocktail aria-hidden strokeWidth={ICON_STROKE} className={classes} />
      );
    case "cafe":
    case "coffee_shop":
      return <TypeGlyph type="COFFEE" className={classes} />;
    case "brewery":
      return <TypeGlyph type="BEER" className={classes} />;
    case "winery":
      return <TypeGlyph type="WINE" className={classes} />;
    default:
      return (
        <Place aria-hidden strokeWidth={ICON_STROKE} className={classes} />
      );
  }
}

/** The category glyph on its tile, at the head of the place's header. */
export function PlaceCategoryTile({
  category,
  large = false,
}: {
  category: string | undefined;
  large?: boolean;
}) {
  return (
    <div className="shrink-0 rounded-md bg-surface-2 p-3 text-ink-2">
      <PlaceCategoryGlyph
        category={category}
        className={large ? "size-7" : "size-6"}
      />
    </div>
  );
}

type ToggleProps = {
  on: boolean;
  pending: boolean;
  onClick: (e: React.MouseEvent) => void;
  className?: string;
};

/** "Love" / "Loved" with the heart (D27; the data model keeps `isFavorite`). */
export function LoveToggleButton({
  on,
  pending,
  onClick,
  className,
}: ToggleProps) {
  return (
    <Button
      variant={on ? "secondary" : "outline"}
      onClick={onClick}
      disabled={pending}
      aria-busy={pending || undefined}
      className={className}
    >
      {pending ? (
        <Spinner />
      ) : (
        <Love
          aria-hidden
          strokeWidth={ICON_STROKE}
          className={on ? "fill-brand text-brand" : undefined}
        />
      )}
      {on ? "Loved" : "Love"}
    </Button>
  );
}

/** "Mark Visited" / "Visited" with the check. */
export function VisitedToggleButton({
  on,
  pending,
  onClick,
  className,
}: ToggleProps) {
  return (
    <Button
      variant={on ? "secondary" : "outline"}
      onClick={onClick}
      disabled={pending}
      aria-busy={pending || undefined}
      className={className}
    >
      {pending ? (
        <Spinner />
      ) : on ? (
        <Success
          aria-hidden
          strokeWidth={ICON_STROKE}
          className="text-success"
        />
      ) : (
        <Unrated aria-hidden strokeWidth={ICON_STROKE} />
      )}
      {on ? "Visited" : "Mark Visited"}
    </Button>
  );
}
