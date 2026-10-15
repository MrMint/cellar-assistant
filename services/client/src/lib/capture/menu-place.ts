/**
 * Where a menu photographed from the capture surface is filed (X06: "menu
 * scans from anywhere").
 *
 * A scan's lines are filed on a place (`MenuScanActor.process`); a scan with
 * no place is read and then filed nowhere. On a place's own page the place is
 * a fact. From ＋ it is a guess, so it is never taken silently: the person's
 * position (asked the D14 way — our one line first, then the browser's
 * prompt) finds the nearest place this app knows, and the surface asks
 * "At Cork & Barrel?" — one tap to confirm, one to pick another.
 *
 * Plain functions, so the rules are tested as data (`menu-place.test.ts`).
 */

export type KnownPlace = {
  readonly id: string;
  readonly name: string;
  /** Great-circle distance from the person, in metres. */
  readonly distanceMeters: number;
  readonly category?: string | null;
};

/**
 * How near the nearest place has to be to be asked about. A phone indoors
 * is often 30–100 m off; two blocks away is somewhere else.
 */
export const SUGGEST_WITHIN_METERS = 200;

/**
 * The place to ask "At …?" about: the nearest known place, if it is close
 * enough to be where the person is standing. `places` need not be sorted.
 */
export const nearestKnownPlace = (
  places: readonly KnownPlace[],
  within: number = SUGGEST_WITHIN_METERS,
): KnownPlace | null => {
  let best: KnownPlace | null = null;
  for (const place of places) {
    if (!Number.isFinite(place.distanceMeters)) continue;
    if (best === null || place.distanceMeters < best.distanceMeters) {
      best = place;
    }
  }
  return best !== null && best.distanceMeters <= within ? best : null;
};

/** Nearest first, the guess (if any) left out — the picker's "others". */
export const otherPlaces = (
  places: readonly KnownPlace[],
  except: string | null,
): KnownPlace[] =>
  places
    .filter((place) => place.id !== except)
    .slice()
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

/** `createMenuScan`'s `placeHint` (`MenuScanPlaceHintInput`). */
export type MenuPlaceHint = {
  placeId?: string | null;
  estimatedPlaceId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

/**
 * The hint a scan is created with: the place the person confirmed, and where
 * they stood **only when that place is one of the places around them** — then
 * the position is where this menu was photographed. A place picked by name
 * (a menu snapped at home, say) gets no position: it is not where that menu
 * is, and it would store where the person was for nothing.
 *
 * No `estimatedPlaceId`. The place is always confirmed here, so the server's
 * `placeId ?? estimatedPlaceId` never reads it; and a guess the person
 * passed over ("Somewhere else") recorded as an estimate is a claim they
 * said was false — one that also blocks deleting that place while it is
 * still the creator's (`PlaceActor.deleteUnshared` counts it as filed).
 */
export const menuPlaceHint = ({
  confirmed,
  nearby,
  location,
}: {
  confirmed: { readonly id: string } | null;
  /** The places around the person (`me.nearbyPlaces`). */
  nearby: readonly { readonly id: string }[];
  location: { readonly latitude: number; readonly longitude: number } | null;
}): MenuPlaceHint => ({
  ...(confirmed === null ? {} : { placeId: confirmed.id }),
  ...(location === null ||
  confirmed === null ||
  !nearby.some((place) => place.id === confirmed.id)
    ? {}
    : { latitude: location.latitude, longitude: location.longitude }),
});

/** "40 m", "350 m", "1.2 km", "12 km". */
export const formatDistance = (meters: number): string => {
  if (!Number.isFinite(meters) || meters < 0) return "";
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
};
