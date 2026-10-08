"use client";

/**
 * The pieces the place page (`PlaceDetails`) and the map drawer's body
 * (`PlaceDetailsContent`) both draw: the category glyph in its tile and the
 * Save / Mark Visited toggles. Joy drew a toggled-on Save as a solid red slab
 * and Visited as a solid green one; design §3.1 bans both, so "on" is a
 * filled glyph on the secondary surface (a claret heart, a success check)
 * and the label still says which state it is in.
 *
 * Both toggles are optimistic (X24): `on` is the tapped state from
 * `usePlaceToggles`, the glyph pops as it turns on, and `pending` only marks
 * the write in flight (`aria-busy`) — the button is never disabled and never
 * swaps its glyph for a spinner.
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
import { TogglePop } from "@/components/app/TogglePop";
import { TypeGlyph } from "@/components/app/TypeChip";
import { Button } from "@/components/ui/button";
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

/** "Save" / "Saved" with the heart. */
export function SaveToggleButton({
  on,
  pending,
  onClick,
  className,
}: ToggleProps) {
  return (
    <Button
      variant={on ? "secondary" : "outline"}
      onClick={onClick}
      aria-pressed={on}
      aria-busy={pending || undefined}
      className={className}
    >
      <TogglePop on={on} pop={pending}>
        <Love
          aria-hidden
          strokeWidth={ICON_STROKE}
          className={on ? "fill-brand text-brand" : undefined}
        />
      </TogglePop>
      {on ? "Saved" : "Save"}
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
      aria-pressed={on}
      aria-busy={pending || undefined}
      className={className}
    >
      <TogglePop on={on} pop={pending}>
        {on ? (
          <Success
            aria-hidden
            strokeWidth={ICON_STROKE}
            className="text-success"
          />
        ) : (
          <Unrated aria-hidden strokeWidth={ICON_STROKE} />
        )}
      </TogglePop>
      {on ? "Visited" : "Mark Visited"}
    </Button>
  );
}
