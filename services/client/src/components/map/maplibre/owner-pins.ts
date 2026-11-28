/**
 * F-196 (H-38): the owner's pins. A place on one of the viewer's own lists,
 * in a band, draws as its photo ringed in the band's colour with the public
 * rating under it; every other place stays a plain symbol pin.
 */

import { type Band, bandName } from "@/components/app/parts/Rank";
import type { MapDataItem, PlaceResult } from "../types";

export type OwnerPin = {
  readonly place: PlaceResult;
  readonly band: Band;
  /** The mirrored photo, or null (the pin draws the place's initial). */
  readonly photo: string | null;
  /** "4.6", or null when the place has no public rating. */
  readonly rating: string | null;
  /** The pin's accessible name. */
  readonly label: string;
};

const asBand = (band: number | undefined): Band | null =>
  band !== undefined && band >= 1 && band <= 5 ? (band as Band) : null;

export function splitOwnerPins(items: readonly MapDataItem[]): {
  owner: OwnerPin[];
  rest: MapDataItem[];
} {
  const owner: OwnerPin[] = [];
  const rest: MapDataItem[] = [];
  for (const item of items) {
    const band = "is_cluster" in item ? null : asBand(item.my_band);
    if ("is_cluster" in item || band === null) {
      rest.push(item);
      continue;
    }
    const rating =
      typeof item.rating === "number" && item.rating > 0
        ? item.rating.toFixed(1)
        : null;
    const words = [item.name, bandName(band)];
    if (rating !== null) {
      words.push(
        item.rating_count
          ? `rated ${rating} from ${item.rating_count}`
          : `rated ${rating}`,
      );
    }
    owner.push({
      place: item,
      band,
      photo: item.photo_url ?? null,
      rating,
      label: words.join(", "),
    });
  }
  return { owner, rest };
}
