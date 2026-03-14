"use client";

import {
  Avatar,
  Box,
  Card,
  CardContent,
  Grid,
  Skeleton,
  Stack,
  Typography,
} from "@mui/joy";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MdLocationOn, MdStar } from "react-icons/md";
import { searchMapPlaces } from "@/app/(authenticated)/map/actions";
import {
  getPlaceSummaries,
  type PlaceSummary,
} from "@/app/(authenticated)/map/place-actions";
import type { MapBounds, PlaceResult } from "@/components/map/types";
import { useGeolocation } from "@/components/map/hooks/useGeolocation";
import {
  formatCategoryName,
  getPriceLevelText,
} from "@/components/map/places/place-utils";
import { getNhostStorageUrl } from "@/utilities";

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

// ─── Skeleton ────────────────────────────────────────────────────────────────

const NearbyPlacesSkeleton = () => (
  <Grid container spacing={1} columns={{ xs: 1, md: 2 }}>
    {[1, 2, 3, 4].map((x) => (
      <Grid key={x} xs={1}>
        <Card
          orientation="horizontal"
          variant="outlined"
          sx={{ "--Card-padding": "0.625rem" }}
        >
          <Skeleton
            variant="rectangular"
            width={44}
            height={44}
            sx={{ borderRadius: "md", flexShrink: 0 }}
          />
          <Stack spacing={0.5} sx={{ flex: 1 }}>
            <Skeleton variant="text" level="title-sm" width="50%" />
            <Skeleton variant="text" level="body-xs" width="70%" />
          </Stack>
        </Card>
      </Grid>
    ))}
  </Grid>
);

// ─── Component ───────────────────────────────────────────────────────────────

export function NearbyPlaces() {
  const geo = useGeolocation();
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [summaries, setSummaries] = useState<Record<string, PlaceSummary>>({});
  const [loading, setLoading] = useState(true);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!geo.location || fetched) return;

    const { latitude, longitude } = geo.location;
    const bounds = buildNearbyBounds(latitude, longitude);

    setFetched(true);
    searchMapPlaces({ bounds, limit: 6 })
      .then(async (result) => {
        // Sort by distance from user
        const sorted = [...result.places].sort((a, b) => {
          const [aLng, aLat] = a.location.coordinates;
          const [bLng, bLat] = b.location.coordinates;
          const aDist = (aLat - latitude) ** 2 + (aLng - longitude) ** 2;
          const bDist = (bLat - latitude) ** 2 + (bLng - longitude) ** 2;
          return aDist - bDist;
        });
        const topPlaces = sorted.slice(0, 6);
        setPlaces(topPlaces);

        // Fetch cached enrichment data (photos, hours, etc.)
        if (topPlaces.length > 0) {
          const placeIds = topPlaces.map((p) => p.id);
          const data = await getPlaceSummaries(placeIds);
          setSummaries(data);
        }
      })
      .catch(() => {
        // Silently fail — this section is optional
      })
      .finally(() => setLoading(false));
  }, [geo.location, fetched]);

  // Don't render if location denied or unavailable
  if (geo.error || (!geo.loading && !geo.location)) return null;

  // Loading states
  if (geo.loading || loading) {
    return (
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} alignItems="center">
          <MdLocationOn
            style={{
              color: "var(--joy-palette-primary-400)",
              fontSize: "1.25rem",
            }}
          />
          <Typography level="title-lg">Nearby Places</Typography>
        </Stack>
        <NearbyPlacesSkeleton />
      </Stack>
    );
  }

  if (places.length === 0) return null;

  const { latitude: userLat, longitude: userLng } = geo.location!;

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} alignItems="center">
        <MdLocationOn
          style={{
            color: "var(--joy-palette-primary-400)",
            fontSize: "1.25rem",
          }}
        />
        <Typography level="title-lg">Nearby Places</Typography>
      </Stack>
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
                        color: openStatus.isOpen ? "success.600" : "danger.600",
                        fontWeight: "md",
                      }}
                    >
                      {openStatus.text}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>
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
