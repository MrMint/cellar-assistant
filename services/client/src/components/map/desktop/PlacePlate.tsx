import { placeKind } from "../core/map-places";
import { KIND_GLYPH } from "../core/PlaceFilters";
import type { PlaceResult } from "../types";

/**
 * A place with no photo, at pane size (KIT amendment "No-photo plate": at
 * 75 px and up the plate carries the name): the raised well, the kind glyph
 * and the name, no border. The map's places carry no photo yet.
 */
export function PlacePlate({ place }: { place: PlaceResult }) {
  const Glyph = KIND_GLYPH[placeKind(place)];
  return (
    <div
      data-slot="place-plate"
      className="flex size-full flex-col items-center justify-center gap-3 bg-raised px-8 text-center"
    >
      <Glyph aria-hidden strokeWidth={1.25} className="size-12 text-glyph" />
      <span className="t-title line-clamp-2 text-ink-2">{place.name}</span>
    </div>
  );
}
