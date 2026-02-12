"use client";

import { type RefObject, useEffect, useRef } from "react";
import type { MapRef } from "react-map-gl/maplibre";

const FALLBACK_CENTER = { longitude: -89.5, latitude: 44.5 };

interface UseMapInitialFlightOptions {
  mapRef: RefObject<MapRef | null>;
  mapReady: boolean;
  userLocation: { latitude: number; longitude: number } | null;
  locationLoading: boolean;
}

/**
 * Manages the initial fly-to-user-location animation and computes
 * the initial view state for the MapGL component.
 *
 * - Flies to the user's location once both geolocation and map are ready
 * - Computes initial view state (deferred until locationLoading resolves)
 * - Reports whether the location guard has cleared (for loading screen)
 */
export function useMapInitialFlight({
  mapRef,
  mapReady,
  userLocation,
  locationLoading,
}: UseMapInitialFlightOptions) {
  const hasFlownRef = useRef(false);

  // Fly to user location once both geolocation and map are ready.
  // Without mapReady, the effect fires on the same render the Map mounts
  // but before onLoad — flyTo silently fails on an unloaded map.
  useEffect(() => {
    if (userLocation && !hasFlownRef.current && mapRef.current && mapReady) {
      hasFlownRef.current = true;
      mapRef.current.flyTo({
        center: [userLocation.longitude, userLocation.latitude],
        zoom: 15,
        duration: 600,
      });
    }
  }, [userLocation, mapReady, mapRef]);

  // Capture initial view state once geolocation resolves.
  // A ref (not useMemo) is used because useMemo([], []) would compute
  // on the very first render when userLocation is still null, before the
  // loading guard returns early. The ref defers the capture until
  // locationLoading is false, which is when the Map actually mounts.
  const initialViewStateRef = useRef<{
    longitude: number;
    latitude: number;
    zoom: number;
  } | null>(null);

  if (!initialViewStateRef.current && !locationLoading) {
    initialViewStateRef.current = {
      longitude: userLocation?.longitude ?? FALLBACK_CENTER.longitude,
      latitude: userLocation?.latitude ?? FALLBACK_CENTER.latitude,
      zoom: userLocation ? 15 : 8,
    };
  }

  return {
    initialViewState: initialViewStateRef.current ?? {
      longitude: FALLBACK_CENTER.longitude,
      latitude: FALLBACK_CENTER.latitude,
      zoom: 8,
    },
    /** True once geolocation has resolved (or location arrived). Controls the loading screen. */
    isLocationReady: !locationLoading || userLocation !== null,
  };
}
