"use client";

import { Alert, Box } from "@mui/joy";
import type { LatLngExpression, Map as LeafletMap } from "leaflet";
import * as L from "leaflet";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { useGeolocation } from "../hooks/useGeolocation";
import { useMapBounds } from "../hooks/useMapBounds";
import {
  useMapActions,
  useMapCore,
  useMapData as useMapDataFromXState,
  useMapFilters,
  useMapUI,
} from "../hooks/useMapMachine";
import { useMapSearchParams } from "../hooks/useMapSearchParams";
import { useSearchParamsSync } from "../hooks/useSearchParamsSync";
import type { PlaceResult } from "../types";
import { SearchResultsList } from "../places/SearchResultsList";
import { MapControls } from "./MapControls";
import { MapPanes } from "./MapPanes";
import { POILayer } from "./POILayer";

// Fix for default markers in react-leaflet
if (typeof window !== "undefined") {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
    iconUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
    shadowUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  });
}

interface MapRendererProps {
  userId: string;
}

// Default fallback location (Wisconsin) if user location unavailable
const FALLBACK_LOCATION: LatLngExpression = [44.5, -89.5];

// Custom hook to handle map location updates
function LocationControl({
  userLocation,
  hasInitialized,
  onInitialized,
}: {
  userLocation: { latitude: number; longitude: number } | null;
  hasInitialized: boolean;
  onInitialized: () => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!hasInitialized) {
      if (userLocation) {
        // First time getting location - fly to it smoothly
        map.flyTo([userLocation.latitude, userLocation.longitude], 15, {
          duration: 0.6,
        });
      }
      // Initialize the map regardless of whether we have user location
      onInitialized();
    }
  }, [userLocation, hasInitialized, onInitialized, map]);

  return null;
}

// Component to set up map bounds tracking
function MapBoundsControl({
  setupMapListeners,
}: {
  setupMapListeners: (map: LeafletMap) => (() => void) | undefined;
}) {
  const map = useMap();

  useEffect(() => {
    const cleanup = setupMapListeners(map);
    return cleanup;
  }, [map, setupMapListeners]);

  return null;
}

// Map click handler to close drawers
function MapClickHandler({ onMapClick }: { onMapClick: () => void }) {
  useMapEvents({
    click: onMapClick,
  });
  return null;
}

// Zoom tracking component
function ZoomTracker({
  onZoomChange,
}: {
  onZoomChange: (zoom: number) => void;
}) {
  useMapEvents({
    zoomend: (e) => {
      const newZoom = e.target.getZoom();
      onZoomChange(newZoom);
    },
  });
  return null;
}

export function MapRenderer({ userId }: MapRendererProps) {
  const [mapInstance, setMapInstance] = useState<LeafletMap | null>(null);

  // Use XState-based state management
  const mapCore = useMapCore();
  const mapUI = useMapUI();
  const mapActions = useMapActions();
  const mapFilters = useMapFilters();

  // nuqs URL state → XState sync (URL is source of truth for filters)
  const searchParams = useMapSearchParams();
  useSearchParamsSync(searchParams);
  const {
    mapItems,
    semanticResults,
    isLoading: placesLoading,
    placesError,
  } = useMapDataFromXState();

  // Map bounds tracking
  const { bounds, setupMapListeners } = useMapBounds();

  const { location: userLocation, loading: locationLoading } = useGeolocation();

  // Update XState machine when userLocation changes
  useEffect(() => {
    if (userLocation) {
      mapActions.setUserLocation(userLocation);
    }
  }, [userLocation, mapActions]);

  // Update XState machine when bounds change
  useEffect(() => {
    if (bounds) {
      mapActions.setBounds(bounds);
    }
  }, [bounds, mapActions]);

  // Handle location button click
  const handleLocationClick = useCallback(() => {
    if (userLocation && mapInstance) {
      mapInstance.flyTo([userLocation.latitude, userLocation.longitude], 16, {
        duration: 0.6,
      });
    } else if (!userLocation) {
      mapActions.setError(
        "Location access denied. Please enable location services.",
      );
    }
  }, [userLocation, mapInstance, mapActions]);

  // Handle map clicks to close drawer
  const handleMapClick = useCallback(() => {
    if (mapUI.isDrawerOpen) {
      mapActions.handleMapClick();
    }
  }, [mapUI.isDrawerOpen, mapActions]);

  // Handle place selection
  const handlePlaceSelect = useCallback(
    (place: PlaceResult) => {
      mapActions.selectPlace(place);
    },
    [mapActions],
  );

  // Handle drawer close
  const handleDrawerClose = useCallback(() => {
    mapActions.closeDrawer();
  }, [mapActions]);

  // Handle initialization
  const handleInitialized = useCallback(() => {
    mapActions.initialize();
  }, [mapActions]);

  // Handle zoom change
  const handleZoomChange = useCallback(
    (zoom: number) => {
      mapActions.setZoom(zoom);
    },
    [mapActions],
  );

  // Handle refresh
  const handleRefresh = useCallback(() => {
    mapActions.refreshPlaces();
  }, [mapActions]);

  // Handle search close
  const handleSearchClose = useCallback(() => {
    searchParams.setSearch("");
  }, [searchParams]);

  // Memoize filters to prevent new object reference on every render
  const filters = useMemo(
    () => ({
      selectedItemTypes: mapFilters.selectedItemTypes,
      minRating: mapFilters.minRating,
      searchQuery: mapFilters.searchQuery,
      visitStatuses: mapFilters.visitStatuses,
    }),
    [
      mapFilters.selectedItemTypes,
      mapFilters.minRating,
      mapFilters.searchQuery,
      mapFilters.visitStatuses,
    ],
  );

  // Handle centering map on a place (from search results list)
  const handleCenterOnPlace = useCallback(
    (place: PlaceResult) => {
      if (mapInstance) {
        const [lng, lat] = place.location.coordinates;
        mapInstance.flyTo([lat, lng], Math.max(mapInstance.getZoom(), 15), {
          duration: 0.6,
        });
      }
    },
    [mapInstance],
  );

  // Handle cluster click - center on cluster and zoom in for more granular view
  const handleClusterClick = useCallback(
    (_clusterId: number, clusterCenter: [number, number]) => {
      if (mapInstance) {
        // Convert from [lng, lat] to [lat, lng] for Leaflet
        const [lng, lat] = clusterCenter;
        const leafletCenter: [number, number] = [lat, lng];

        // Calculate new zoom level - zoom in by 2-3 levels for better granularity
        const currentZoom = mapInstance.getZoom();
        const targetZoom = Math.min(currentZoom + 3, 18); // Cap at max zoom level

        // Smoothly fly to the cluster center with increased zoom
        mapInstance.flyTo(leafletCenter, targetZoom, {
          duration: 0.8, // Smooth animation duration
        });
      }
    },
    [mapInstance],
  );

  // Preserve selected place when mapItems array updates
  useEffect(() => {
    if (mapUI.selectedPlace && mapItems.length > 0) {
      // Find the same place in the new mapItems array (only search individual places, not clusters)
      const updatedPlace = mapItems.find(
        (item): item is PlaceResult =>
          !("is_cluster" in item) &&
          (item.id === mapUI.selectedPlace?.id ||
            item.name === mapUI.selectedPlace?.name),
      );

      // Update the selected place reference if found
      if (updatedPlace && updatedPlace !== mapUI.selectedPlace) {
        mapActions.updateSelectedPlace(updatedPlace);
      }
    }
  }, [mapItems, mapUI.selectedPlace, mapActions]);

  // Get initial center position
  const initialCenter: LatLngExpression = useMemo(() => {
    if (userLocation) {
      return [userLocation.latitude, userLocation.longitude];
    }
    return FALLBACK_LOCATION;
  }, [userLocation]);

  // Show error state
  if (mapUI.error || placesError) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert color="danger">
          {mapUI.error || placesError || "An error occurred"}
        </Alert>
      </Box>
    );
  }

  // Show location loading state
  if (locationLoading && !userLocation) {
    return (
      <Box
        sx={{
          height: "100%",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "background.surface",
        }}
      >
        <Alert color="neutral">Getting your location...</Alert>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: "100%",
        width: "100%",
        position: "relative",
        backgroundColor: mapCore.isDarkMode ? "#2c3e50" : "#f8f9fa",
      }}
    >
      <MapContainer
        center={initialCenter}
        zoom={userLocation ? 15 : 8}
        style={{
          height: "100%",
          width: "100%",
          backgroundColor: mapCore.isDarkMode ? "#2c3e50" : "#f8f9fa",
        }}
        className={mapCore.isDarkMode ? "dark-mode" : ""}
        zoomControl={false}
        attributionControl={true}
        ref={setMapInstance}
        preferCanvas={true}
      >
        {/* Tile Layer with dark/light mode switching */}
        <TileLayer
          attribution="&copy; OpenStreetMap contributors &copy; CARTO"
          url={
            mapCore.isDarkMode
              ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
              : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
          }
          subdomains="abcd"
          keepBuffer={6}
          updateWhenIdle={true}
          updateWhenZooming={false}
          maxZoom={22}
          noWrap={true}
          bounds={[
            [-85, -180],
            [85, 180],
          ]}
          crossOrigin={true}
          opacity={1}
          zIndex={1}
        />

        {/* Custom Map Panes for POI z-index control */}
        <MapPanes />

        {/* Location Control */}
        <LocationControl
          userLocation={userLocation}
          hasInitialized={mapCore.hasInitialized}
          onInitialized={handleInitialized}
        />

        {/* Map Bounds Control */}
        <MapBoundsControl setupMapListeners={setupMapListeners} />

        {/* Unified POI Layer */}
        <POILayer
          items={mapItems}
          userLocation={userLocation}
          onPlaceSelect={handlePlaceSelect}
          onClusterClick={handleClusterClick}
          selectedPlace={mapUI.selectedPlace}
          drawerOpen={mapUI.isDrawerOpen}
          onDrawerClose={handleDrawerClose}
          isDarkMode={mapCore.isDarkMode}
          userId={userId}
          currentZoom={mapCore.currentZoom}
          filters={filters}
        />

        {/* Zoom Tracker */}
        <ZoomTracker onZoomChange={handleZoomChange} />

        {/* Map Click Handler */}
        <MapClickHandler onMapClick={handleMapClick} />
      </MapContainer>

      {/* Search Results List (shown during semantic search) */}
      {mapFilters.isSemanticSearch &&
        semanticResults &&
        semanticResults.length > 0 && (
          <SearchResultsList
            results={semanticResults}
            searchQuery={mapFilters.searchQuery}
            isLoading={placesLoading}
            onPlaceSelect={handlePlaceSelect}
            onCenterOnPlace={handleCenterOnPlace}
            onClose={handleSearchClose}
          />
        )}

      {/* Unified Map Controls XState */}
      <MapControls
        onRefresh={handleRefresh}
        onLocationClick={handleLocationClick}
        loading={placesLoading}
      />
    </Box>
  );
}
