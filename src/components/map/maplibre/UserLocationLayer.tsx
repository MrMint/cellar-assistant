'use client';

import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/maplibre';
import type { CircleLayerSpecification } from 'react-map-gl/maplibre';
import { LAYER_IDS, SOURCE_IDS } from './constants';

interface UserLocationLayerProps {
  location: { latitude: number; longitude: number };
}

const pulseLayer: CircleLayerSpecification = {
  id: LAYER_IDS.USER_LOCATION_PULSE,
  type: 'circle',
  source: SOURCE_IDS.USER_LOCATION,
  paint: {
    'circle-radius': 18,
    'circle-color': '#4285f4',
    'circle-opacity': 0.2,
  },
};

const dotLayer: CircleLayerSpecification = {
  id: LAYER_IDS.USER_LOCATION_DOT,
  type: 'circle',
  source: SOURCE_IDS.USER_LOCATION,
  paint: {
    'circle-radius': 7,
    'circle-color': '#4285f4',
    'circle-stroke-width': 2.5,
    'circle-stroke-color': '#ffffff',
  },
};

export function UserLocationLayer({ location }: UserLocationLayerProps) {
  const geoJson = useMemo(
    (): GeoJSON.FeatureCollection => ({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
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
      <Layer {...pulseLayer} />
      <Layer {...dotLayer} />
    </Source>
  );
}
