"use client";

import type * as GeoJSON from "geojson";

import { useMemo } from "react";
import type { CircleLayerSpecification } from "react-map-gl/maplibre";
import { Layer, Source } from "react-map-gl/maplibre";
import { LAYER_IDS, SOURCE_IDS } from "./constants";
import type { MapPalette } from "./palette";

interface UserLocationLayerProps {
  location: { latitude: number; longitude: number };
  palette: MapPalette;
}

/** "You are here" (kit `here`): the dot, its ring, and a soft halo. */
function youLayers(palette: MapPalette): {
  pulse: CircleLayerSpecification;
  dot: CircleLayerSpecification;
} {
  return {
    pulse: {
      id: LAYER_IDS.USER_LOCATION_PULSE,
      type: "circle",
      source: SOURCE_IDS.USER_LOCATION,
      paint: {
        "circle-radius": 18,
        "circle-color": palette.here,
        "circle-opacity": 0.2,
      },
    },
    dot: {
      id: LAYER_IDS.USER_LOCATION_DOT,
      type: "circle",
      source: SOURCE_IDS.USER_LOCATION,
      paint: {
        "circle-radius": 7,
        "circle-color": palette.here,
        "circle-stroke-width": 2.5,
        "circle-stroke-color": palette.hereRing,
      },
    },
  };
}

export function UserLocationLayer({
  location,
  palette,
}: UserLocationLayerProps) {
  const layers = useMemo(() => youLayers(palette), [palette]);
  const geoJson = useMemo(
    (): GeoJSON.FeatureCollection => ({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [location.longitude, location.latitude],
          },
          properties: {},
        },
      ],
    }),
    [location.latitude, location.longitude],
  );

  return (
    <Source id={SOURCE_IDS.USER_LOCATION} type="geojson" data={geoJson}>
      <Layer {...layers.pulse} />
      <Layer {...layers.dot} />
    </Source>
  );
}
