"use client";

import { useMemo } from "react";
import { Directions, ICON_STROKE } from "@/components/app/icons";
import {
  QuickLook,
  type QuickLookItem,
} from "@/components/app/overlays/QuickLook";
import { PublicRating } from "@/components/app/parts/Stars";
import { Button } from "@/components/ui/button";
import type { PlaceResult, UserLocation } from "../types";
import {
  categoryWords,
  directionsOf,
  distanceTo,
  distanceWords,
} from "./map-places";

/** "120 m from you", or "Here" within 25 m (CROSS-LOT distance origin). */
export function fromYouWords(meters: number | null): string | null {
  if (meters === null) return null;
  const words = distanceWords(meters);
  return words === "Here" ? words : `${words} from you`;
}

function PlaceLookExtra({
  place,
  origin,
}: {
  place: PlaceResult;
  origin: UserLocation | null;
}) {
  const directions = directionsOf(place);
  const away = fromYouWords(distanceTo(place, origin));
  return (
    <div className="mt-2 flex flex-col gap-3">
      <PublicRating value={place.rating} />
      {/* KIT § 2: a place adds Directions on its own row. */}
      <div className="flex min-h-11 items-center gap-3">
        <span className="t-head min-w-0 flex-1 truncate text-ink">
          {away ?? ""}
        </span>
        <Button asChild variant="outline">
          <a href={directions.href} target="_blank" rel="noopener noreferrer">
            <Directions aria-hidden strokeWidth={ICON_STROKE} />
            {directions.label}
          </a>
        </Button>
      </div>
    </div>
  );
}

/**
 * The map's quick look (Map board 04–06; KIT § 2 "Quick look"): F2a's card
 * over the places in view, in the list's order, with the counter, swipe for
 * the next, and Open page one tap away. A place adds Directions on its own
 * row. Open page goes to the place's page in the map's sheet (Places-Place
 * ruling 1), through `hrefFor`.
 */
export function PlaceQuickLook({
  places,
  origin,
  index,
  open,
  onOpenChange,
  onIndexChange,
  hrefFor,
}: {
  places: readonly PlaceResult[];
  origin: UserLocation | null;
  index: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
  hrefFor: (place: PlaceResult) => string;
}) {
  const items: QuickLookItem[] = useMemo(
    () =>
      places.map((place) => ({
        id: place.id,
        title: place.name,
        meta: [categoryWords(place.primary_category), place.street_address]
          .filter(Boolean)
          .join(" · "),
        extra: <PlaceLookExtra place={place} origin={origin} />,
        href: hrefFor(place),
      })),
    [places, origin, hrefFor],
  );
  return (
    <QuickLook
      open={open && items.length > 0}
      onOpenChange={onOpenChange}
      items={items}
      index={Math.min(index, Math.max(0, items.length - 1))}
      onIndexChange={onIndexChange}
    />
  );
}
