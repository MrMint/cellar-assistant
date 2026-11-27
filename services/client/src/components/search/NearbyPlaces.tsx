"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { useQuery } from "urql";
import { FilterChip } from "@/components/app/FilterChip";
import { ICON_STROKE, Place } from "@/components/app/icons";
import { PlaceRow } from "@/components/app/parts/PlaceRow";
import { itemTypeTokens } from "@/components/app/TypeChip";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { SEE_ALL_CLASS, SectionHead } from "@/components/home/HomeLayout";
import {
  formatMetres,
  metresBetween,
  placeYouAreAt,
} from "@/components/home/landing";
import { PressLink } from "@/components/home/PressLink";
import { mapItemTypesToCategories } from "@/components/map/config/scoring";
import { useGeolocation } from "@/components/map/hooks/useGeolocation";
import {
  formatCategoryName,
  getPriceLevelText,
} from "@/components/map/places/place-utils";
import type { ItemType } from "@/components/map/types";
import type { CachedLocation } from "@/lib/geo-cookie/parse";
import { cn } from "@/lib/utils";
import { type NearbyPlace, nearbyPlacesFromNodes } from "./adapter";
import { NEARBY_PLACES_LIMIT, SearchNearbyPlacesQuery } from "./queries";
import { fadeInLeft, fadeShort, staggerContainerFast } from "./search-motion";
import { useHasMounted, useHydratedReducedMotion } from "./useHasMounted";

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
  const prefersReducedMotion = useHydratedReducedMotion();
  // The server's render and the hydration pass start visible; only what
  // mounts afterwards (a filter change) plays the entrance (./useHasMounted).
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

  const here = { lat: userLat, lng: userLng };
  const at = placeYouAreAt(places, here);
  const origin = at === null ? "you" : at.place.name;
  // The place you are at leads: Home is place-aware (DECISIONS 23).
  const ordered =
    at === null
      ? places
      : [at.place, ...places.filter((place) => place.id !== at.place.id)];

  return (
    <section aria-labelledby="nearby-heading" className="flex flex-col gap-2">
      <SectionHead
        id="nearby-heading"
        title={at === null ? "Nearby" : `Near ${at.place.name}`}
        count={
          places.length === 0
            ? null
            : `${places.length} ${places.length === 1 ? "place" : "places"}`
        }
      />
      <fieldset
        aria-label="Place type filters"
        className="-mx-4 m-0 flex min-w-0 gap-2 overflow-x-auto border-0 px-4 py-0 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden"
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

      <AnimatePresence mode="wait">
        {initialLoading ? null : places.length === 0 ? (
          <motion.p
            key="empty"
            initial={animateEntrance ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fadeShort}
            className="t-cap m-0 py-4 text-ink-3"
          >
            No nearby places found
            {selectedTypes.length > 0 && " for the selected types"}
          </motion.p>
        ) : (
          <motion.ul
            key={selectedTypes.join(",")}
            variants={prefersReducedMotion ? undefined : staggerContainerFast}
            initial={
              animateEntrance && !prefersReducedMotion ? "hidden" : false
            }
            animate="show"
            exit="exit"
            className="m-0 grid list-none grid-cols-1 gap-2 p-0 md:grid-cols-2"
          >
            {ordered.map((place) => {
              const [lng, lat] = place.coordinates;
              const isHere = at !== null && at.place.id === place.id;
              const openStatus = place.openingHours
                ? getOpenStatus(place.openingHours)
                : null;
              const where = [
                formatCategoryName(place.primaryCategory),
                getPriceLevelText(place.priceLevel) || null,
                openStatus?.text ?? null,
                // CROSS-LOT: always name the origin; "At X" within 25 m.
                isHere
                  ? `At ${place.name}`
                  : `${formatMetres(metresBetween(here, { lat, lng }))} from ${origin}`,
              ]
                .filter((part): part is string => Boolean(part))
                .join(" · ");
              return (
                <motion.li
                  key={place.id}
                  data-here={isHere || undefined}
                  variants={prefersReducedMotion ? undefined : fadeInLeft}
                  transition={fadeShort}
                >
                  <PlaceRow
                    glyph={Place}
                    photoUrl={place.photoUrl}
                    name={
                      <PressLink href={`/map?placeId=${place.id}`} overlay>
                        {place.name}
                      </PressLink>
                    }
                    where={where}
                    rating={place.rating}
                  />
                </motion.li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
      <PressLink href="/map" className={cn(SEE_ALL_CLASS, "mr-0 self-center")}>
        View all on map
      </PressLink>
    </section>
  );
}
