"use client";

import * as maplibregl from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAPLIBRE_WORKER_URL } from "@/components/map/maplibre/workerUrl";
import { bandColor, color } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import { BAND_LABELS, BAND_TONES } from "../constants";
import type { CountryHeatmapEntry } from "./computeInsightsStats";

/**
 * The app is dark (D21: the scheme is static, no light mode is built), so the
 * basemap is CARTO's dark one. MapLibre paint cannot read a CSS variable, so
 * the fills take the band ramp's hex from `lib/tokens.ts`; the legend beside
 * the map prints every band's word.
 */
const CARTO_DARK =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

interface CountryHeatmapProps {
  entries: CountryHeatmapEntry[];
}

function bandToColor(avgBand: number): string {
  const rounded = Math.round(avgBand);
  const clamped = Math.max(0, Math.min(5, rounded));
  return clamped === 0
    ? color.surface3
    : bandColor[clamped as 1 | 2 | 3 | 4 | 5];
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

const LEGEND_BANDS = [5, 4, 3, 2, 1] as const;

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
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

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

    maplibregl.setWorkerUrl(MAPLIBRE_WORKER_URL);
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: mapContainer.current,
        style: CARTO_DARK,
        center: mapView.center,
        zoom: mapView.zoom,
        interactive: false,
        attributionControl: false,
      });
    } catch {
      // maplibre-gl v6 needs WebGL2 and throws from the constructor without
      // it. Uncaught here, that throw would take the whole insights panel
      // down with it; losing only the heatmap is the right failure.
      setUnavailable(true);
      return;
    }

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
          "line-color": color.ink3,
          "line-opacity": 0.35,
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
  }, [hasEntries, colorMap, mapView.center, mapView.zoom]);

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

  if (!hasEntries || unavailable) return null;

  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-ink-1 type-headline">Where Your Favorites Are</h4>
      <div
        ref={mapContainer}
        className="h-[200px] w-full overflow-hidden rounded-md sm:h-[280px]"
      />
      {/* Legend */}
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {LEGEND_BANDS.map((band) => (
          <li key={band} className="flex items-center gap-1">
            <span
              aria-hidden
              className={cn(
                "size-3 shrink-0 rounded-[2px]",
                BAND_TONES[band].swatch,
              )}
            />
            <span className="text-ink-2 type-footnote">
              {BAND_LABELS[band]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
