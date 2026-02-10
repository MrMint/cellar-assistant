"use client";

import { useMemo } from "react";
import type { SymbolLayerSpecification } from "react-map-gl/maplibre";
import { Layer, Source } from "react-map-gl/maplibre";
import type { PlaceResult } from "../types";
import { LAYER_IDS, SOURCE_IDS } from "./constants";
import {
  categoryToIcon,
  getDominantItemType,
} from "./utils/geoJsonTransform";

interface SelectedPlaceLayerProps {
  selectedPlace: PlaceResult | null;
  isDarkMode?: boolean;
}

const EMPTY_GEOJSON: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export function SelectedPlaceLayer({
  selectedPlace,
  isDarkMode,
}: SelectedPlaceLayerProps) {
  const geoJson = useMemo(() => {
    if (!selectedPlace) return EMPTY_GEOJSON;

    const dominant = getDominantItemType(selectedPlace.itemTypeScores);
    const colorKey = dominant ?? "default";
    const iconName = categoryToIcon(selectedPlace.primary_category);
    const pinImageName = `pin-${colorKey}-${iconName}`;

    return {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: selectedPlace.location.coordinates,
          },
          properties: {
            id: selectedPlace.id,
            name: selectedPlace.name,
            pinImageName,
          },
        },
      ],
    };
  }, [selectedPlace]);

  const pinLayer: SymbolLayerSpecification = useMemo(
    () => ({
      id: LAYER_IDS.SELECTED_PIN,
      type: "symbol",
      source: SOURCE_IDS.SELECTED_PLACE,
      layout: {
        "icon-image": ["get", "pinImageName"],
        "icon-size": 1.05,
        "icon-anchor": "bottom",
        "icon-allow-overlap": true,
        "text-field": ["get", "name"],
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
        "text-size": 12,
        "text-variable-anchor": ["right", "left"],
        "text-radial-offset": 1.6,
        "text-justify": "auto",
        "text-max-width": 7,
        "text-optional": true,
        "text-allow-overlap": true,
      },
      paint: {
        "text-color": isDarkMode ? "#e0e0e0" : "#1a1a1a",
        "text-halo-color": isDarkMode ? "rgba(0, 0, 0, 0.8)" : "#fff",
        "text-halo-width": 2,
        "text-translate": [0, -23],
      },
    }),
    [isDarkMode],
  );

  return (
    <Source
      id={SOURCE_IDS.SELECTED_PLACE}
      type="geojson"
      data={geoJson}
    >
      <Layer {...pinLayer} />
    </Source>
  );
}
