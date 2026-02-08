"use client";

import { useEffect, useRef, useState } from "react";
import { MAP_CONFIG } from "../config/constants";

interface GeolocationState {
  location: { latitude: number; longitude: number } | null;
  loading: boolean;
  error: string | null;
}

// Minimum coordinate change to trigger a state update (~11 meters)
const COORDINATE_EPSILON = 0.0001;

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    location: null,
    loading: true,
    error: null,
  });
  const lastCoordsRef = useRef<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setState({
        location: null,
        loading: false,
        error: "Geolocation is not supported by this browser",
      });
      return;
    }

    const handleSuccess = (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords;
      const prev = lastCoordsRef.current;

      // Skip update if coordinates haven't changed meaningfully
      if (
        prev &&
        Math.abs(prev.latitude - latitude) < COORDINATE_EPSILON &&
        Math.abs(prev.longitude - longitude) < COORDINATE_EPSILON
      ) {
        return;
      }

      lastCoordsRef.current = { latitude, longitude };
      setState({
        location: { latitude, longitude },
        loading: false,
        error: null,
      });
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

      setState({
        location: null,
        loading: false,
        error: errorMessage,
      });
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
    const watchId = navigator.geolocation.watchPosition(
      handleSuccess,
      handleError,
      options,
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  return state;
}
