/**
 * Home's small decisions, pure (`landing.test.ts`): the count line, whether
 * this is a new person's Home, "Rate the n", and the 25 m rule that makes
 * the landing place-aware (DECISIONS 23; CROSS-LOT "Distance origin").
 */

type Stats = {
  readonly itemCounts: {
    readonly wine: number;
    readonly beer: number;
    readonly spirit: number;
    readonly coffee: number;
    readonly sake: number;
    readonly tea: number;
  };
};

const totalOf = ({ itemCounts: c }: Stats): number =>
  c.wine + c.beer + c.spirit + c.coffee + c.sake + c.tea;

/** Grouped counts, fixed to en-US so server and browser print the same. */
const COUNT = new Intl.NumberFormat("en-US");

/** No bottles of any kind yet: the new-person Home. */
export const isNewPerson = (stats: Stats): boolean => totalOf(stats) === 0;

/**
 * "240 bottles" beside the greeting, or null when there are none — a new
 * person's Home shows no count at all, never "0 bottles" (CROSS-LOT 3).
 */
export const bottleCountLine = (stats: Stats): string | null => {
  const total = totalOf(stats);
  if (total === 0) return null;
  return `${COUNT.format(total)} ${total === 1 ? "bottle" : "bottles"}`;
};

/** "Rate the 15", or null when every open bottle has the owner's rating. */
export const rateLabel = (unrated: number): string | null =>
  unrated <= 0 ? null : unrated === 1 ? "Rate it" : `Rate the ${unrated}`;

/** Within this, you are *at* the place, not near it (CROSS-LOT). */
export const AT_PLACE_METRES = 25;

const NNBSP = " ";

/**
 * A distance in the kit's form: "21 m", "1.2 km", a narrow no-break space
 * before the unit (KIT § 4 "Formatting").
 */
export const formatMetres = (metres: number): string =>
  metres < 1000
    ? `${Math.round(metres)}${NNBSP}m`
    : `${(metres / 1000).toFixed(1)}${NNBSP}km`;

/** Great-circle metres between two points. */
export const metresBetween = (
  a: { readonly lat: number; readonly lng: number },
  b: { readonly lat: number; readonly lng: number },
): number => {
  const R = 6371e3;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

/**
 * The place you are at: the nearest within {@link AT_PLACE_METRES}, or null.
 * Places come with `[lng, lat]` coordinates, as the nearby query sends them.
 */
export const placeYouAreAt = <
  P extends { readonly coordinates: readonly [number, number] },
>(
  places: readonly P[],
  here: { readonly lat: number; readonly lng: number },
): { place: P; metres: number } | null => {
  let best: { place: P; metres: number } | null = null;
  for (const place of places) {
    const [lng, lat] = place.coordinates;
    const metres = metresBetween(here, { lat, lng });
    if (metres <= AT_PLACE_METRES && (best === null || metres < best.metres)) {
      best = { place, metres };
    }
  }
  return best;
};
