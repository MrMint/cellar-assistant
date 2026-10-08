"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useMemo, useState } from "react";
import { useQuery } from "urql";
import { FilterChip } from "@/components/app/FilterChip";
import { ICON_STROKE, Place, Star } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { itemTypeTokens } from "@/components/app/TypeChip";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { mapItemTypesToCategories } from "@/components/map/config/scoring";
import { useGeolocation } from "@/components/map/hooks/useGeolocation";
import {
  formatCategoryName,
  getPriceLevelText,
} from "@/components/map/places/place-utils";
import type { ItemType } from "@/components/map/types";
import type { CachedLocation } from "@/lib/geo-cookie/parse";
import { distance } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { type NearbyPlace, nearbyPlacesFromNodes } from "./adapter";
import { NEARBY_PLACES_LIMIT, SearchNearbyPlacesQuery } from "./queries";
import { fadeInLeft, fadeShort, staggerContainerFast } from "./search-motion";
import { useHasMounted } from "./useHasMounted";

/**
 * `82450ad1:src/components/search/NearbyPlaces.tsx`, restored (UI parity
 * G31, restored at the user's request).
 *
 * Markup, copy, filters and motion are the old strip's. What changed under it:
 *
 * - **One read instead of two server actions.** The old strip called
 *   `searchMapPlaces({ bounds: ±0.018°, limit: 6 })`, sorted the six by
 *   distance here, then `getPlaceSummaries(ids)` for photo, hours, price and
 *   Google rating. `me.nearbyPlaces` runs the same browse on the viewer's own
 *   map actor, sorts server-side, and each place carries those fields.
 * - **`useQuery`, not an effect with a fetch counter.** The variables (the
 *   point and the type filter) key the request, so a superseded answer is
 *   dropped by URQL rather than by a hand-kept id. The old skip is kept:
 *   with server data and no filter, nothing is fetched until the live
 *   position differs from the cookie's.
 * - **The photo** is the presigned `file { url }` instead of a Nhost storage
 *   URL built from a file id; same `next/image` props.
 * - **The filters** are labelled `FilterChip`s (the type's glyph and its
 *   word), where the old ones were bare icons in a Joy `ToggleButtonGroup`
 *   (design §3.4). Still a multi-select: any combination, none meaning all.
 */

const PLACE_TYPE_FILTERS: {
  id: ItemType;
  label: string;
  glyph: ApiItemType;
}[] = [
  { id: "wine", label: "Wine", glyph: "WINE" },
  { id: "beer", label: "Beer", glyph: "BEER" },
  { id: "spirit", label: "Spirits", glyph: "SPIRIT" },
  { id: "coffee", label: "Coffee", glyph: "COFFEE" },
  { id: "sake", label: "Sake", glyph: "SAKE" },
];

/** A type toggled in or out, keeping the order the types were picked in. */
const toggleType = (types: readonly ItemType[], type: ItemType): ItemType[] =>
  types.includes(type) ? types.filter((t) => t !== type) : [...types, type];

function formatDistance(
  placeLat: number,
  placeLng: number,
  userLat: number,
  userLng: number,
): string {
  const R = 6371e3;
  const dLat = ((placeLat - userLat) * Math.PI) / 180;
  const dLng = ((placeLng - userLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((userLat * Math.PI) / 180) *
      Math.cos((placeLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const meters = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

// ─── Open status from cached enrichment hours ────────────────────────────────

interface OpenStatus {
  text: string;
  isOpen: boolean;
}

function getOpenStatus(openingHours: unknown): OpenStatus | null {
  if (!openingHours || typeof openingHours !== "object") return null;
  const hours = openingHours as {
    open_now?: boolean;
    openNow?: boolean;
  };
  const isOpen = hours.open_now ?? hours.openNow;
  if (isOpen === undefined) return null;
  return {
    text: isOpen ? "Open" : "Closed",
    isOpen,
  };
}

// ─── Epsilon for comparing cached vs live location ──────────────────────────
const COORDINATE_EPSILON = 0.0001;

// ─── Component ───────────────────────────────────────────────────────────────

interface NearbyPlacesProps {
  initialPlaces?: NearbyPlace[];
  cachedLocation?: CachedLocation | null;
}

export function NearbyPlaces({
  initialPlaces,
  cachedLocation,
}: NearbyPlacesProps) {
  const geo = useGeolocation();
  const hasInitialData = initialPlaces != null && initialPlaces.length > 0;
  const [selectedTypes, setSelectedTypes] = useState<ItemType[]>([]);
  const prefersReducedMotion = useReducedMotion() ?? false;
  // The server's render and the hydration pass start visible; only what
  // mounts afterwards (a filter change) plays the entrance. See ./AnimateIn.
  const animateEntrance = useHasMounted();
  const latitude = geo.location?.latitude;
  const longitude = geo.location?.longitude;

  // The old skip: server data, no filter, and the live position is the
  // cookie's (the user hasn't moved) — nothing to fetch.
  const liveMatchesCache =
    latitude != null &&
    longitude != null &&
    cachedLocation != null &&
    Math.abs(latitude - cachedLocation.latitude) < COORDINATE_EPSILON &&
    Math.abs(longitude - cachedLocation.longitude) < COORDINATE_EPSILON;
  const point =
    latitude != null && longitude != null
      ? { lat: latitude, lng: longitude }
      : cachedLocation != null
        ? { lat: cachedLocation.latitude, lng: cachedLocation.longitude }
        : null;
  const skip =
    point === null ||
    (hasInitialData &&
      selectedTypes.length === 0 &&
      (liveMatchesCache || latitude == null));

  const categories = useMemo(
    () => mapItemTypesToCategories(selectedTypes) ?? null,
    [selectedTypes],
  );
  const [result] = useQuery({
    query: SearchNearbyPlacesQuery,
    variables: {
      location: point ?? { lat: 0, lng: 0 },
      categories,
      limit: NEARBY_PLACES_LIMIT,
      first: NEARBY_PLACES_LIMIT,
    },
    pause: skip,
  });

  const fetched = useMemo(
    () =>
      result.data?.me
        ? nearbyPlacesFromNodes(
            result.data.me.nearbyPlaces.edges.map((edge) => edge.node),
          )
        : null,
    [result.data],
  );
  // Silently fail — this section is optional (the old `.catch(() => {})`).
  const places: NearbyPlace[] = skip
    ? (initialPlaces ?? [])
    : (fetched ?? (result.error ? [] : (initialPlaces ?? [])));
  const initialLoading =
    !hasInitialData && !skip && result.fetching && fetched === null;

  // Don't render if location denied or unavailable (and no cached data)
  if (!hasInitialData && (geo.error || (!geo.loading && !geo.location)))
    return null;

  // Don't render until we have a location or cached data
  if (!hasInitialData && (geo.loading || !geo.location)) return null;

  const userLat = geo.location?.latitude ?? cachedLocation?.latitude ?? 0;
  const userLng = geo.location?.longitude ?? cachedLocation?.longitude ?? 0;

  return (
    <section aria-label="Nearby Places" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Place
            aria-hidden
            className="size-5 text-ink-3"
            strokeWidth={ICON_STROKE}
          />
          <h2 className="type-headline">Nearby Places</h2>
        </div>

        <fieldset
          aria-label="Place type filters"
          className="flex min-w-0 flex-wrap gap-1.5"
        >
          {PLACE_TYPE_FILTERS.map(({ id, label, glyph }) => {
            // The type's own glyph, in the chip's ink: a filter is state,
            // so it takes the chip's colour rather than the type's hue.
            const Glyph = itemTypeTokens[glyph].glyph;
            return (
              <FilterChip
                key={id}
                aria-label={label}
                selected={selectedTypes.includes(id)}
                icon={<Glyph aria-hidden strokeWidth={ICON_STROKE} />}
                onClick={() => setSelectedTypes(toggleType(selectedTypes, id))}
              >
                {label}
              </FilterChip>
            );
          })}
        </fieldset>
      </div>

      {/* Cards: AnimatePresence handles smooth exit/enter between filter changes */}
      <AnimatePresence mode="wait">
        {initialLoading ? null : places.length === 0 ? (
          <motion.div
            key="empty"
            initial={animateEntrance ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fadeShort}
          >
            <p className="type-footnote py-4">
              No nearby places found
              {selectedTypes.length > 0 && " for the selected types"}
            </p>
          </motion.div>
        ) : (
          <motion.div
            key={selectedTypes.join(",")}
            variants={prefersReducedMotion ? undefined : staggerContainerFast}
            initial={
              animateEntrance && !prefersReducedMotion ? "hidden" : false
            }
            animate="show"
            exit="exit"
            className="grid grid-cols-1 gap-2 md:grid-cols-2"
          >
            {places.map((place) => {
              const [lng, lat] = place.coordinates;
              const dist = formatDistance(lat, lng, userLat, userLng);
              const photoUrl = place.photoUrl;
              const rating = place.rating;
              const priceLevelText = getPriceLevelText(place.priceLevel);
              const openStatus = place.openingHours
                ? getOpenStatus(place.openingHours)
                : null;

              return (
                <motion.div
                  key={place.id}
                  variants={prefersReducedMotion ? undefined : fadeInLeft}
                  whileHover={prefersReducedMotion ? undefined : { y: -2 }}
                  whileTap={
                    prefersReducedMotion ? undefined : { scale: distance.press }
                  }
                  transition={fadeShort}
                >
                  <Link
                    href={`/map?placeId=${place.id}`}
                    underline="none"
                    className="flex h-full items-center gap-3 rounded-md bg-surface-1 p-2.5 text-ink-1 transition-colors duration-(--ca-dur-short) ease-standard hover:bg-surface-2"
                  >
                    {/* Place thumbnail */}
                    <div className="relative size-11 shrink-0 overflow-hidden rounded-sm">
                      {photoUrl ? (
                        <Image
                          src={photoUrl}
                          alt={place.name}
                          fill
                          className="object-cover"
                          sizes="44px"
                        />
                      ) : (
                        <span className="flex size-full items-center justify-center bg-surface-2 font-semibold text-ink-2">
                          {place.name.charAt(0)}
                        </span>
                      )}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className="type-callout truncate font-semibold">
                        {place.name}
                      </p>

                      {/* Info line: category · rating · price · distance */}
                      <p className="type-footnote truncate">
                        {formatCategoryName(place.primaryCategory)}
                        {rating != null && (
                          <>
                            {" \u00B7 "}
                            <Star
                              aria-hidden
                              strokeWidth={0}
                              className="inline size-[0.85em] fill-current align-[-0.1em]"
                            />{" "}
                            {rating.toFixed(1)}
                          </>
                        )}
                        {priceLevelText && (
                          <>
                            {" \u00B7 "}
                            {priceLevelText}
                          </>
                        )}
                        {" \u00B7 "}
                        {dist}
                      </p>

                      {/* Open/closed status when available */}
                      {openStatus && (
                        <p
                          className={cn(
                            "type-footnote font-medium",
                            openStatus.isOpen
                              ? "text-success"
                              : "text-destructive",
                          )}
                        >
                          {openStatus.text}
                        </p>
                      )}
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="text-center">
        <Link href="/map" className="type-callout text-primary">
          View all on map
        </Link>
      </div>
    </section>
  );
}
