/**
 * L10 (wave C seenat) · scan anywhere: the rules behind the inline "Where's
 * this menu?" sheet (board ScanNewPlace) and the menu-header rename, kept pure
 * so they are tested without rendering (`new-place.test.ts`).
 *
 * - The place is settled **before** the scan is sent (decisions.md "Global
 *   capture", L24): the sheet creates it on the person's tap, and only then
 *   does the held photo go up, filed on it.
 * - Creation is bounded (N09): the name and category are checked here as the
 *   server checks them, the position must be a real fix, and the
 *   client-minted `placeId` is kept for the sheet's life so a retry converges
 *   on the row it already made rather than making a second one. The server's
 *   25-a-day cap still answers for itself.
 * - The prefill spends at most one Google nearby read, which the D16 budget
 *   may refuse: the sheet then says "Details pending" and the person types the
 *   name. Nothing is guessed in its place.
 * - The new place is PENDING — "Under review", creator-only (D28).
 * - The header the menu prints can only be *proposed* as a rename of that
 *   place, and only applied from an explicit confirm (`headerRenameInput`).
 */

import {
  isPlaceCategory,
  PLACE_CATEGORIES,
  type PlaceCategorySlug,
} from "@cellar-assistant/contracts/place-categories";
import type { CreatePlaceInput } from "@/components/map/actions";
import { validateCreatePlaceInput } from "@/components/map/actions";
import type { KnownPlace } from "@/lib/capture/menu-place";

/** "No saved place within 50 m of you": closer than this is that place. */
export const NEW_PLACE_WITHIN_METERS = 50;

/** A listing farther than this is not where the person is standing. */
export const LISTING_PREFILL_WITHIN_METERS = 75;

/**
 * The sheet's six kinds (Capture-Place 04, after Places-Place's create
 * form), each filed as one category. "More kinds" offers the rest of
 * {@link NEW_PLACE_CATEGORIES}.
 */
export const NEW_PLACE_KINDS = [
  { label: "Coffee", category: "coffee_shop" },
  { label: "Food", category: "restaurant" },
  { label: "Bar", category: "bar" },
  { label: "Beer", category: "taproom" },
  { label: "Wine", category: "wine_bar" },
  { label: "Shop", category: "liquor_store" },
] as const satisfies readonly {
  label: string;
  category: PlaceCategorySlug;
}[];

/** Every category a place may be filed under: the server's own list. */
export const NEW_PLACE_CATEGORIES: readonly PlaceCategorySlug[] =
  PLACE_CATEGORIES;
export type NewPlaceCategory = PlaceCategorySlug;

const isNewPlaceCategory = (value: string): value is NewPlaceCategory =>
  isPlaceCategory(value);

/** The six kinds' label for a category, or null when it is one of the rest. */
export const kindLabel = (category: string | null): string | null =>
  NEW_PLACE_KINDS.find((kind) => kind.category === category)?.label ?? null;

type Fix = { readonly latitude: number; readonly longitude: number };

const isFix = (location: Fix | null): location is Fix =>
  location !== null &&
  Number.isFinite(location.latitude) &&
  Number.isFinite(location.longitude) &&
  Math.abs(location.latitude) <= 90 &&
  Math.abs(location.longitude) <= 180;

/**
 * Whether to offer a new place: a real fix, the nearby read settled, and
 * nothing the app knows within {@link NEW_PLACE_WITHIN_METERS}.
 */
export const offerNewPlace = ({
  location,
  nearby,
  searching,
}: {
  location: Fix | null;
  nearby: readonly Pick<KnownPlace, "distanceMeters">[];
  searching: boolean;
}): boolean =>
  isFix(location) &&
  !searching &&
  nearby.every((place) => place.distanceMeters > NEW_PLACE_WITHIN_METERS);

/** Great-circle metres; enough to tell 40 m from 400. */
export const metresBetween = (a: Fix, b: Fix): number => {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
};

export type ListingLike = {
  readonly name: string;
  readonly location: Fix;
};

export type NamePrefill =
  | { readonly kind: "listing"; readonly name: string }
  /** D16: the budget refused the read. Calm, and nothing invented. */
  | { readonly kind: "pending" }
  | { readonly kind: "none" };

/** The nearest listing's name, if one is where the person stands. */
export const namePrefill = (
  location: Fix,
  read: { places: readonly ListingLike[]; budgetExhausted: boolean } | null,
): NamePrefill => {
  if (read === null) return { kind: "none" };
  if (read.budgetExhausted) return { kind: "pending" };
  let best: { name: string; metres: number } | null = null;
  for (const listing of read.places) {
    const name = listing.name.trim();
    if (name === "") continue;
    const metres = metresBetween(location, listing.location);
    if (metres > LISTING_PREFILL_WITHIN_METERS) continue;
    if (best === null || metres < best.metres) best = { name, metres };
  }
  return best === null
    ? { kind: "none" }
    : { kind: "listing", name: best.name };
};

/**
 * A Google type list's best category: one of the six kinds first, else any
 * category the server takes.
 */
export const categoryFromTypes = (
  types: readonly string[],
): NewPlaceCategory | null =>
  NEW_PLACE_KINDS.find((kind) => types.includes(kind.category))?.category ??
  types.find(isNewPlaceCategory) ??
  null;

/**
 * The `createPlace` input, or the reason it may not be sent. The bounds are
 * the server's (2–200 characters, a category, a real position) so a refusal
 * reads here rather than after a round trip.
 */
export const newPlaceInput = ({
  name,
  category,
  location,
  placeId,
}: {
  name: string;
  category: string | null;
  location: Fix | null;
  placeId: string;
}): { ok: true; input: CreatePlaceInput } | { ok: false; error: string } => {
  if (!isFix(location)) {
    return { ok: false, error: "Your location is needed to pin the place." };
  }
  if (category === null || !isNewPlaceCategory(category)) {
    return { ok: false, error: "Pick what kind of place it is." };
  }
  const input: CreatePlaceInput = {
    name: name.replace(/\s+/g, " ").trim(),
    categories: [category],
    latitude: location.latitude,
    longitude: location.longitude,
    placeId,
  };
  const invalid = validateCreatePlaceInput(input);
  return invalid === null ? { ok: true, input } : { ok: false, error: invalid };
};

/**
 * `nearby` for `menuPlaceHint` once the place exists: the new place is where
 * the person stands, so the scan keeps their position, as it does for a
 * nearby place they confirm.
 */
export const nearbyWithCreated = (
  nearby: readonly KnownPlace[],
  created: { id: string; name: string; category: string | null },
): KnownPlace[] => [
  { ...created, distanceMeters: 0 },
  ...nearby.filter((place) => place.id !== created.id),
];

/* -------------------------------------------------------------------------- */
/* The menu header's rename (L24)                                              */
/* -------------------------------------------------------------------------- */

const fold = (name: string): string =>
  name.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * A rename to offer, or null. Only for a place still Under review — the
 * creator's own (a pending place is visible to no one else, D28) — and only
 * when the header reads differently from the name it has. An approved place
 * is shared, and a menu photo does not rename what others see.
 */
export const headerRenameProposal = ({
  headerName,
  place,
}: {
  headerName: string | null | undefined;
  place: { name: string; reviewStatus: string } | null;
}): string | null => {
  const proposed = headerName?.replace(/\s+/g, " ").trim() ?? "";
  if (proposed.length < 2 || proposed.length > 200) return null;
  if (place === null || place.reviewStatus !== "PENDING") return null;
  return fold(proposed) === fold(place.name) ? null : proposed;
};

/**
 * The resubmit input that applies a proposal — built only from the person's
 * confirm, and changing the name alone: every other field is the place's own.
 */
export const headerRenameInput = (
  place: Omit<CreatePlaceInput, "name" | "placeId">,
  confirmed: { proposal: string; confirmed: true },
): CreatePlaceInput => ({ ...place, name: confirmed.proposal });

/**
 * W-16, board ScanNewPlace: "Pinned at your location, about 12 m accurate".
 * The accuracy is the fix's own radius, rounded to what a person can use; a
 * fix that does not say how good it is reads as before.
 */
export const pinnedLine = (accuracy: number | null | undefined): string => {
  if (accuracy === null || accuracy === undefined) {
    return "Pinned at your location";
  }
  if (!Number.isFinite(accuracy) || accuracy < 0) {
    return "Pinned at your location";
  }
  const meters =
    accuracy < 100
      ? Math.max(1, Math.round(accuracy))
      : Math.round(accuracy / 10) * 10;
  return `Pinned at your location, about ${meters} m accurate`;
};

/** Capture-Place 04's short pin line: "Pinned · ±12 m", or "Pinned". */
export const pinnedShort = (accuracy: number | null | undefined): string => {
  if (accuracy === null || accuracy === undefined) return "Pinned";
  if (!Number.isFinite(accuracy) || accuracy < 0) return "Pinned";
  const meters =
    accuracy < 100
      ? Math.max(1, Math.round(accuracy))
      : Math.round(accuracy / 10) * 10;
  return `Pinned \u00b7 \u00b1${meters}\u202fm`;
};

const foldName = (name: string): string =>
  name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();

/**
 * Capture-Place 07, "On the map?": a known place near by whose name is the
 * one being typed (either contains the other, folded), nearest first. Under
 * three characters typed, nothing is matched.
 */
export const likelyDuplicate = (
  name: string,
  nearby: readonly KnownPlace[],
): KnownPlace | null => {
  const typed = foldName(name);
  if (typed.length < 3) return null;
  return (
    [...nearby]
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .find((place) => {
        const known = foldName(place.name);
        return known !== "" && (known.includes(typed) || typed.includes(known));
      }) ?? null
  );
};
