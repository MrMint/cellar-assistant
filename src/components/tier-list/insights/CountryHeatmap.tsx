"use client";

import { Box, Stack, Typography } from "@mui/joy";
import { useColorScheme } from "@mui/joy/styles";
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { BAND_COLORS } from "../constants";
import type { CountryHeatmapEntry } from "./computeInsightsStats";

const CARTO_LIGHT =
  "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
const CARTO_DARK =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

interface CountryHeatmapProps {
  entries: CountryHeatmapEntry[];
}

function bandToColor(avgBand: number): string {
  const rounded = Math.round(avgBand);
  const clamped = Math.max(0, Math.min(5, rounded));
  return BAND_COLORS[clamped] ?? "#757575";
}

function buildMatchExpression(
  colorMap: Map<string, string>,
): maplibregl.ExpressionSpecification {
  // Build: ["match", ["get", "ISO_A2"], "US", "#color", ..., "transparent"]
  const parts: Array<string | string[]> = ["match", ["get", "iso_a2"]];
  Array.from(colorMap.entries()).forEach(([code, color]) => {
    parts.push(code, color);
  });
  parts.push("transparent");
  return parts as unknown as maplibregl.ExpressionSpecification;
}

const LEGEND_ITEMS = [
  { label: "Outstanding", band: 5 },
  { label: "Very Good", band: 4 },
  { label: "Good", band: 3 },
  { label: "Mediocre", band: 2 },
  { label: "Bad", band: 1 },
];

// Approximate country centroids for bounding-box computation
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  US: [-98, 39],
  CA: [-106, 56],
  MX: [-102, 23],
  BR: [-51, -14],
  AR: [-64, -34],
  GB: [-2, 54],
  FR: [2, 46],
  DE: [10, 51],
  IT: [12, 42],
  ES: [-4, 40],
  PT: [-8, 39],
  AU: [134, -25],
  NZ: [174, -41],
  JP: [138, 36],
  CN: [104, 35],
  IN: [79, 21],
  ZA: [25, -29],
  CL: [-71, -35],
  CO: [-74, 4],
  PE: [-76, -10],
};

export function CountryHeatmap({ entries }: CountryHeatmapProps) {
  const { mode } = useColorScheme();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);

  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of entries) {
      map.set(entry.countryCode, bandToColor(entry.avgBand));
    }
    return map;
  }, [entries]);

  const hasEntries = entries.length > 0;

  // Compute center and zoom from user's data
  const mapView = useMemo(() => {
    const coords = entries
      .map((e) => COUNTRY_CENTROIDS[e.countryCode])
      .filter(Boolean) as [number, number][];

    if (coords.length === 0)
      return { center: [0, 20] as [number, number], zoom: 0.8 };
    if (coords.length === 1) return { center: coords[0], zoom: 2.5 };

    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const lngSpan = Math.max(...lngs) - Math.min(...lngs);
    const latSpan = Math.max(...lats) - Math.min(...lats);
    const maxSpan = Math.max(lngSpan, latSpan, 10);
    // Rough zoom: 360 / 2^zoom ≈ maxSpan, with padding
    const zoom = Math.max(0.5, Math.min(4, Math.log2(360 / (maxSpan * 1.8))));

    return { center: [centerLng, centerLat] as [number, number], zoom };
  }, [entries]);

  useEffect(() => {
    if (!mapContainer.current || !hasEntries) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: mode === "dark" ? CARTO_DARK : CARTO_LIGHT,
      center: mapView.center,
      zoom: mapView.zoom,
      interactive: false,
      attributionControl: false,
    });

    mapRef.current = map;

    map.on("load", () => {
      map.addSource("countries", {
        type: "geojson",
        data: "https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_admin_0_countries.geojson",
      });

      map.addLayer(
        {
          id: "country-fills",
          type: "fill",
          source: "countries",
          paint: {
            "fill-color": buildMatchExpression(colorMap),
            "fill-opacity": 0.6,
          },
        },
        map.getStyle().layers?.find((l) => l.type === "symbol")?.id,
      );

      map.addLayer({
        id: "country-borders",
        type: "line",
        source: "countries",
        paint: {
          "line-color": mode === "dark" ? "#555" : "#ccc",
          "line-width": 0.5,
        },
      });

      setLoaded(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setLoaded(false);
    };
  }, [mode, hasEntries, colorMap, mapView.center, mapView.zoom]);

  // Update colors when entries change without recreating the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !map.isStyleLoaded()) return;

    map.setPaintProperty(
      "country-fills",
      "fill-color",
      buildMatchExpression(colorMap),
    );
  }, [colorMap, loaded]);

  if (!hasEntries) return null;

  return (
    <Stack spacing={1}>
      <Typography level="title-md">Where Your Favorites Are</Typography>
      <Box
        ref={mapContainer}
        sx={{
          width: "100%",
          height: { xs: 200, sm: 280 },
          borderRadius: "md",
          overflow: "hidden",
        }}
      />
      {/* Legend */}
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {LEGEND_ITEMS.map((item) => (
          <Stack
            key={item.band}
            direction="row"
            spacing={0.5}
            alignItems="center"
          >
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: 2,
                backgroundColor: BAND_COLORS[item.band],
                flexShrink: 0,
              }}
            />
            <Typography level="body-xs" sx={{ color: "text.secondary" }}>
              {item.label}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}
