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
import type { CreatePlaceInput } from "@/components/map/actions";
import { validateCreatePlaceInput } from "@/components/map/actions";
import type { KnownPlace } from "@/lib/capture/menu-place";

/** "No saved place within 50 m of you": closer than this is that place. */
export const NEW_PLACE_WITHIN_METERS = 50;

/** A listing farther than this is not where the person is standing. */
export const LISTING_PREFILL_WITHIN_METERS = 75;

/** The categories a menu's place usually is, in the sheet's order. */
export const NEW_PLACE_CATEGORIES = [
  "wine_bar",
  "bar",
  "cocktail_bar",
  "taproom",
  "pub",
  "restaurant",
  "izakaya",
  "cafe",
] as const;
export type NewPlaceCategory = (typeof NEW_PLACE_CATEGORIES)[number];

const isNewPlaceCategory = (value: string): value is NewPlaceCategory =>
  (NEW_PLACE_CATEGORIES as readonly string[]).includes(value);

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

/** A Google type list's best category among the sheet's, if any. */
export const categoryFromTypes = (
  types: readonly string[],
): NewPlaceCategory | null => types.find(isNewPlaceCategory) ?? null;

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
