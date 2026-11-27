"use client";

import type * as GeoJSON from "geojson";

import { useMemo } from "react";
import type { SymbolLayerSpecification } from "react-map-gl/maplibre";
import { Layer, Source } from "react-map-gl/maplibre";
import { placeKind } from "../core/map-places";
import type { PlaceResult } from "../types";
import { LAYER_IDS, SOURCE_IDS } from "./constants";
import type { MapPalette } from "./palette";
import { categoryToIcon } from "./utils/geoJsonTransform";
import { pinImageName as pinName } from "./utils/iconLoader";

interface SelectedPlaceLayerProps {
  selectedPlace: PlaceResult | null;
  /** X08: the selected pin keeps its want-to-go badge. */
  wantToGo?: ReadonlySet<string>;
  palette: MapPalette;
}

const EMPTY_GEOJSON: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export function SelectedPlaceLayer({
  selectedPlace,
  wantToGo,
  palette,
}: SelectedPlaceLayerProps) {
  const geoJson = useMemo(() => {
    if (!selectedPlace) return EMPTY_GEOJSON;

    const colorKey = placeKind(selectedPlace);
    const iconName = categoryToIcon(selectedPlace.primary_category);
    const pinImageName = pinName(
      colorKey,
      iconName,
      wantToGo?.has(selectedPlace.id) ?? false,
    );

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
  }, [selectedPlace, wantToGo]);

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
        "text-color": palette.label,
        "text-halo-color": palette.halo,
        "text-halo-width": 2,
        "text-translate": [0, -23],
      },
    }),
    [palette],
  );

  return (
    <Source id={SOURCE_IDS.SELECTED_PLACE} type="geojson" data={geoJson}>
      <Layer {...pinLayer} />
    </Source>
  );
}
