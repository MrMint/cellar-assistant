"use client";

import { useSyncExternalStore } from "react";
import { MAP_CONFIG } from "../config/constants";

interface GeolocationState {
  location: { latitude: number; longitude: number } | null;
  loading: boolean;
  error: string | null;
}

// Minimum coordinate change to trigger a state update (~11 meters)
const COORDINATE_EPSILON = 0.0001;

const SERVER_SNAPSHOT: GeolocationState = {
  location: null,
  loading: true,
  error: null,
};

/**
 * Module-level geolocation store.
 * Lazily subscribes to the Geolocation API on first consumer and
 * persists across component remounts — a React 18 useSyncExternalStore
 * pattern that naturally survives Suspense re-suspensions and
 * component tree remounts without losing position data.
 */
function createGeolocationStore() {
  let state: GeolocationState = {
    location: null,
    loading: true,
    error: null,
  };
  let lastCoords: { latitude: number; longitude: number } | null = null;
  const listeners = new Set<() => void>();
  let initialized = false;

  function emit() {
    listeners.forEach((listener) => {
      listener();
    });
  }

  function start() {
    if (initialized) return;
    initialized = true;

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      state = {
        location: null,
        loading: false,
        error: "Geolocation is not supported by this browser",
      };
      emit();
      return;
    }

    const handleSuccess = (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords;

      // Skip update if coordinates haven't changed meaningfully
      if (
        lastCoords &&
        Math.abs(lastCoords.latitude - latitude) < COORDINATE_EPSILON &&
        Math.abs(lastCoords.longitude - longitude) < COORDINATE_EPSILON
      ) {
        return;
      }

      lastCoords = { latitude, longitude };
      state = {
        location: { latitude, longitude },
        loading: false,
        error: null,
      };
      emit();
    };

    const handleError = (error: GeolocationPositionError) => {
      let errorMessage = "Unable to retrieve location";

      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMessage = "Location access denied by user";
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage = "Location information unavailable";
          break;
        case error.TIMEOUT:
          errorMessage = "Location request timed out";
          break;
      }

      state = {
        location: null,
        loading: false,
        error: errorMessage,
      };
      emit();
    };

    const options = {
      enableHighAccuracy: true,
      timeout: MAP_CONFIG.TIMING.GEOLOCATION_TIMEOUT,
      maximumAge: 300000, // 5 minutes
    };

    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      handleError,
      options,
    );

    // Watch position changes
    navigator.geolocation.watchPosition(handleSuccess, handleError, options);
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      start(); // Lazily initialize on first subscription
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return state;
    },
    getServerSnapshot() {
      return SERVER_SNAPSHOT;
    },
  };
}

const geolocationStore = createGeolocationStore();

export function useGeolocation() {
  return useSyncExternalStore(
    geolocationStore.subscribe,
    geolocationStore.getSnapshot,
    geolocationStore.getServerSnapshot,
  );
}
