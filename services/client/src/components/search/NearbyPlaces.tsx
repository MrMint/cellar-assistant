"use client";

import {
  Avatar,
  Box,
  Card,
  CardContent,
  Grid,
  IconButton,
  Stack,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/joy";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  FaBeer,
  FaCocktail,
  FaCoffee,
  FaGlassWhiskey,
  FaWineGlass,
} from "react-icons/fa";
import { MdLocationOn, MdStar } from "react-icons/md";
import { useQuery } from "urql";
import { mapItemTypesToCategories } from "@/components/map/config/scoring";
import { useGeolocation } from "@/components/map/hooks/useGeolocation";
import {
  formatCategoryName,
  getPriceLevelText,
} from "@/components/map/places/place-utils";
import type { ItemType } from "@/components/map/types";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { CachedLocation } from "@/lib/geo-cookie/parse";
import { type NearbyPlace, nearbyPlacesFromNodes } from "./adapter";
import { fadeInLeft, staggerContainerFast } from "./motion-variants";
import { NEARBY_PLACES_LIMIT, SearchNearbyPlacesQuery } from "./queries";
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
 */

const PLACE_TYPE_FILTERS: { id: ItemType; label: string; icon: React.FC }[] = [
  { id: "wine", label: "Wine", icon: FaWineGlass },
  { id: "beer", label: "Beer", icon: FaBeer },
  { id: "spirit", label: "Spirits", icon: FaCocktail },
  { id: "coffee", label: "Coffee", icon: FaCoffee },
  { id: "sake", label: "Sake", icon: FaGlassWhiskey },
];

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
  const prefersReducedMotion = useMediaQuery(
    "(prefers-reduced-motion: reduce)",
  );
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
    <Stack spacing={1.5}>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        useFlexGap
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <MdLocationOn
            style={{
              color: "var(--joy-palette-primary-400)",
              fontSize: "1.25rem",
            }}
          />
          <Typography level="title-lg">Nearby Places</Typography>
        </Stack>

        <ToggleButtonGroup
          variant="plain"
          spacing={0.5}
          value={selectedTypes}
          onChange={(_event, newTypes) => setSelectedTypes(newTypes)}
          aria-label="Place type filters"
        >
          {PLACE_TYPE_FILTERS.map(({ id, label, icon: Icon }) => (
            <Tooltip key={id} title={label}>
              <IconButton value={id} aria-label={label} size="sm">
                <Icon />
              </IconButton>
            </Tooltip>
          ))}
        </ToggleButtonGroup>
      </Stack>

      {/* Cards: AnimatePresence handles smooth exit/enter between filter changes */}
      <AnimatePresence mode="wait">
        {initialLoading ? null : places.length === 0 ? (
          <motion.div
            key="empty"
            initial={animateEntrance ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Typography level="body-sm" sx={{ color: "text.tertiary", py: 2 }}>
              No nearby places found
              {selectedTypes.length > 0 && " for the selected types"}
            </Typography>
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
          >
            <Grid container spacing={1} columns={{ xs: 1, md: 2 }}>
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
                  <Grid key={place.id} xs={1}>
                    <motion.div
                      variants={prefersReducedMotion ? undefined : fadeInLeft}
                      whileHover={prefersReducedMotion ? undefined : { y: -2 }}
                      whileTap={
                        prefersReducedMotion ? undefined : { scale: 0.98 }
                      }
                      transition={{ duration: 0.15 }}
                    >
                      <Card
                        component={Link}
                        href={`/map?placeId=${place.id}`}
                        variant="outlined"
                        orientation="horizontal"
                        sx={{
                          textDecoration: "none",
                          "--Card-padding": "0.625rem",
                          height: "100%",
                          transition: "all 0.15s ease",
                          "&:hover": {
                            boxShadow: "sm",
                            borderColor: "neutral.outlinedHoverBorder",
                          },
                        }}
                      >
                        {/* Place thumbnail */}
                        <Box
                          sx={{
                            width: 44,
                            height: 44,
                            flexShrink: 0,
                            borderRadius: "md",
                            overflow: "hidden",
                            position: "relative",
                          }}
                        >
                          {photoUrl ? (
                            <Image
                              src={photoUrl}
                              alt={place.name}
                              fill
                              style={{ objectFit: "cover" }}
                              sizes="44px"
                            />
                          ) : (
                            <Avatar
                              variant="soft"
                              color="primary"
                              sx={{
                                width: "100%",
                                height: "100%",
                                borderRadius: "md",
                                fontSize: "md",
                              }}
                            >
                              {place.name.charAt(0)}
                            </Avatar>
                          )}
                        </Box>

                        <CardContent sx={{ gap: 0.25, minWidth: 0 }}>
                          <Typography level="title-sm" noWrap>
                            {place.name}
                          </Typography>

                          {/* Info line: category · rating · price · distance */}
                          <Typography
                            level="body-xs"
                            noWrap
                            sx={{ color: "text.tertiary" }}
                          >
                            {formatCategoryName(place.primaryCategory)}
                            {rating != null && (
                              <>
                                {" \u00B7 "}
                                <MdStar
                                  style={{
                                    fontSize: "0.7rem",
                                    verticalAlign: "middle",
                                    color: "var(--joy-palette-warning-400)",
                                  }}
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
                          </Typography>

                          {/* Open/closed status when available */}
                          {openStatus && (
                            <Typography
                              level="body-xs"
                              sx={{
                                color: openStatus.isOpen
                                  ? "success.600"
                                  : "danger.600",
                                fontWeight: "md",
                              }}
                            >
                              {openStatus.text}
                            </Typography>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  </Grid>
                );
              })}
            </Grid>
          </motion.div>
        )}
      </AnimatePresence>
      <Box sx={{ textAlign: "center" }}>
        <Typography
          component={Link}
          href="/map"
          level="body-sm"
          sx={{
            color: "primary.400",
            textDecoration: "none",
            "&:hover": { textDecoration: "underline" },
          }}
        >
          View all on map
        </Typography>
      </Box>
    </Stack>
  );
}
