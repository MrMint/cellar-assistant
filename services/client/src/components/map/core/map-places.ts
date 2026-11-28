import type {
  MapBounds,
  MapDataItem,
  PlaceResult,
  UserLocation,
} from "../types";

/**
 * The map's list, worked out from what the map already holds (Map board:
 * "In view", the kind chips with their live counts, the distance line).
 * Pure, so the dock, the desktop list and the tests share one answer.
 */

/** The map's filter kinds (Map board: Coffee / Food / Bar; desktop "Drinks"). */
export type PlaceKind = "coffee" | "food" | "bar" | "other";

/** The chips' kinds, in the board's order. */
export const FILTER_KINDS = ["coffee", "food", "bar"] as const;
export type FilterKind = (typeof FILTER_KINDS)[number];

const COFFEE = new Set([
  "coffee_shop",
  "cafe",
  "coffee_roastery",
  "coffee_roaster",
  "tea_house",
  "bubble_tea",
  "bakery",
  "espresso_bar",
]);

const BAR = new Set([
  "bar",
  "wine_bar",
  "cocktail_bar",
  "pub",
  "brewery",
  "brewpub",
  "beer_bar",
  "beer_garden",
  "taproom",
  "lounge",
  "sports_bar",
  "gastropub",
  "winery",
  "wine_tasting_room",
  "vineyard",
  "distillery",
  "night_club",
  "speakeasy",
  "tapas_bar",
  "sake_bar",
  "izakaya",
]);

const FOOD = new Set([
  "restaurant",
  "steakhouse",
  "food",
  "diner",
  "pizzeria",
  "bistro",
  "brasserie",
  "deli",
]);

function kindOfCategory(category: string): PlaceKind {
  if (COFFEE.has(category)) return "coffee";
  if (BAR.has(category)) return "bar";
  if (FOOD.has(category) || category.endsWith("_restaurant")) return "food";
  return "other";
}

/** A place's kind: its primary category first, then the rest in order. */
export function placeKind(
  place: Pick<PlaceResult, "primary_category" | "categories">,
): PlaceKind {
  for (const category of [place.primary_category, ...place.categories]) {
    const kind = kindOfCategory(category);
    if (kind !== "other") return kind;
  }
  return "other";
}

export function matchesKinds(
  place: PlaceResult,
  kinds: readonly FilterKind[],
): boolean {
  if (kinds.length === 0) return true;
  const kind = placeKind(place);
  return kinds.some((k) => k === kind);
}

export function kindCounts(
  places: readonly PlaceResult[],
): Record<PlaceKind, number> {
  const counts: Record<PlaceKind, number> = {
    coffee: 0,
    food: 0,
    bar: 0,
    other: 0,
  };
  for (const place of places) counts[placeKind(place)] += 1;
  return counts;
}

const EARTH_RADIUS_M = 6_371_000;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle metres between two points (haversine). */
export function metersBetween(a: UserLocation, b: UserLocation): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) *
      Math.cos(toRadians(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

const pointOf = (place: PlaceResult): UserLocation => ({
  longitude: place.location.coordinates[0],
  latitude: place.location.coordinates[1],
});

export function distanceTo(
  place: PlaceResult,
  origin: UserLocation | null | undefined,
): number | null {
  return origin ? metersBetween(origin, pointOf(place)) : null;
}

/** Narrow no-break space before a unit (KIT § 4 "Formatting"). */
const NNBSP = " ";

/**
 * "Here" within 25 m (CROSS-LOT "Distance under 25 m"), metres to the
 * nearest 10 under a kilometre, then km to one place under 10 km.
 */
export function distanceWords(meters: number): string {
  if (meters < 25) return "Here";
  if (meters < 1000) return `${Math.round(meters / 10) * 10}${NNBSP}m`;
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)}${NNBSP}km` : `${Math.round(km)}${NNBSP}km`;
}

/** "coffee_shop" → "Coffee shop". */
export function categoryWords(category: string | undefined): string {
  if (!category || category === "unknown") return "Place";
  const words = category.replaceAll("_", " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The row's line: "Coffee shop · 110 m". */
export function placeWhere(
  place: PlaceResult,
  origin: UserLocation | null | undefined,
): string {
  const kind = categoryWords(place.primary_category);
  const meters = distanceTo(place, origin);
  return meters === null ? kind : `${kind} · ${distanceWords(meters)}`;
}

const inside = (place: PlaceResult, bounds: MapBounds): boolean => {
  const [lng, lat] = place.location.coordinates;
  return (
    lat <= bounds.north &&
    lat >= bounds.south &&
    lng <= bounds.east &&
    lng >= bounds.west
  );
};

/**
 * The places the map shows inside `bounds` (clusters are counts, not
 * places), nearest the origin first when there is one.
 */
export function placesInView(
  items: readonly MapDataItem[],
  bounds: MapBounds | null | undefined,
  origin?: UserLocation | null,
): PlaceResult[] {
  const places = items.filter(
    (item): item is PlaceResult =>
      !("is_cluster" in item) && (!bounds || inside(item, bounds)),
  );
  if (!origin) return places;
  return places
    .map((place) => ({ place, meters: metersBetween(origin, pointOf(place)) }))
    .sort((a, b) => a.meters - b.meters)
    .map(({ place }) => place);
}

/**
 * The quick look's index for the place it holds open, by id (F-193): the
 * list re-sorts on every location fix, so an index alone could swap the open
 * card for another place. Null when nothing is open or it left the list.
 */
export function quickLookIndex(
  places: readonly PlaceResult[],
  id: string | null,
): number | null {
  if (id === null) return null;
  const index = places.findIndex((place) => place.id === id);
  return index >= 0 ? index : null;
}

/**
 * Where Directions goes (Places-Place ruling 5): the street address when
 * there is one, else the pin's coordinates, and the button says so.
 */
export function directionsOf(place: PlaceResult): {
  href: string;
  label: string;
} {
  const address = [place.street_address, place.locality]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(", ");
  if (place.street_address?.trim()) {
    return {
      href: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`,
      label: "Directions",
    };
  }
  const [lng, lat] = place.location.coordinates;
  return {
    href: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`,
    label: "Directions to the pin",
  };
}
