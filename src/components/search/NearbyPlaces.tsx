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
import { useEffect, useRef, useState } from "react";
import {
  FaBeer,
  FaCocktail,
  FaCoffee,
  FaGlassWhiskey,
  FaWineGlass,
} from "react-icons/fa";
import { MdLocationOn, MdStar } from "react-icons/md";
import { searchMapPlaces } from "@/app/(authenticated)/map/actions";
import {
  getPlaceSummaries,
  type PlaceSummary,
} from "@/app/(authenticated)/map/place-actions";
import { useGeolocation } from "@/components/map/hooks/useGeolocation";
import {
  formatCategoryName,
  getPriceLevelText,
} from "@/components/map/places/place-utils";
import type { ItemType, MapBounds, PlaceResult } from "@/components/map/types";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { getNhostStorageUrl } from "@/utilities";
import { fadeInLeft, staggerContainerFast } from "./motion-variants";

const PLACE_TYPE_FILTERS: { id: ItemType; label: string; icon: React.FC }[] = [
  { id: "wine", label: "Wine", icon: FaWineGlass },
  { id: "beer", label: "Beer", icon: FaBeer },
  { id: "spirit", label: "Spirits", icon: FaCocktail },
  { id: "coffee", label: "Coffee", icon: FaCoffee },
  { id: "sake", label: "Sake", icon: FaGlassWhiskey },
];

// ~2km radius in degrees (rough approximation at mid-latitudes)
const NEARBY_RADIUS_DEG = 0.018;

function buildNearbyBounds(lat: number, lng: number): MapBounds {
  return {
    north: lat + NEARBY_RADIUS_DEG,
    south: lat - NEARBY_RADIUS_DEG,
    east: lng + NEARBY_RADIUS_DEG,
    west: lng - NEARBY_RADIUS_DEG,
  };
}

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

// ─── Component ───────────────────────────────────────────────────────────────

export function NearbyPlaces() {
  const geo = useGeolocation();
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [summaries, setSummaries] = useState<Record<string, PlaceSummary>>({});
  const [initialLoading, setInitialLoading] = useState(true);
  const [selectedTypes, setSelectedTypes] = useState<ItemType[]>([]);
  const prefersReducedMotion = useMediaQuery(
    "(prefers-reduced-motion: reduce)",
  );
  // Monotonic counter to discard stale responses
  const fetchIdRef = useRef(0);
  const latitude = geo.location?.latitude;
  const longitude = geo.location?.longitude;

  // Single effect: runs on location arrival AND on filter changes.
  // Uses a fetch ID to ensure only the latest request's response is applied.
  useEffect(() => {
    if (latitude == null || longitude == null) return;

    const bounds = buildNearbyBounds(latitude, longitude);
    const id = ++fetchIdRef.current;

    searchMapPlaces({ bounds, itemTypes: selectedTypes, limit: 6 })
      .then(async (result) => {
        if (id !== fetchIdRef.current) return; // stale response

        const sorted = [...result.places].sort((a, b) => {
          const [aLng, aLat] = a.location.coordinates;
          const [bLng, bLat] = b.location.coordinates;
          const aDist = (aLat - latitude) ** 2 + (aLng - longitude) ** 2;
          const bDist = (bLat - latitude) ** 2 + (bLng - longitude) ** 2;
          return aDist - bDist;
        });
        const topPlaces = sorted.slice(0, 6);
        setPlaces(topPlaces);

        if (topPlaces.length > 0) {
          const placeIds = topPlaces.map((p) => p.id);
          const data = await getPlaceSummaries(placeIds);
          if (id !== fetchIdRef.current) return;
          setSummaries(data);
        } else {
          setSummaries({});
        }
      })
      .catch(() => {
        // Silently fail — this section is optional
      })
      .finally(() => {
        if (id === fetchIdRef.current) {
          setInitialLoading(false);
        }
      });
  }, [latitude, longitude, selectedTypes]);

  // Don't render if location denied or unavailable
  if (geo.error || (!geo.loading && !geo.location)) return null;

  // Don't render until we have a location
  if (geo.loading || !geo.location) return null;

  const { latitude: userLat, longitude: userLng } = geo.location;

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
            initial={{ opacity: 0 }}
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
            initial={prefersReducedMotion ? false : "hidden"}
            animate="show"
            exit="exit"
          >
          <Grid container spacing={1} columns={{ xs: 1, md: 2 }}>
            {places.map((place) => {
              const [lng, lat] = place.location.coordinates;
              const dist = formatDistance(lat, lng, userLat, userLng);
              const summary = summaries[place.id];
              const photoUrl = summary?.photoFileId
                ? getNhostStorageUrl(summary.photoFileId)
                : null;
              const rating = summary?.rating ?? place.rating;
              const priceLevel = summary?.priceLevel ?? place.price_level;
              const priceLevelText = getPriceLevelText(priceLevel);
              const openStatus = summary?.openingHours
                ? getOpenStatus(summary.openingHours)
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
                          {formatCategoryName(place.primary_category)}
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
