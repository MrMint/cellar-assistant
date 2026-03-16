"use client";

import { Alert, Box } from "@mui/joy";
import "maplibre-gl/dist/maplibre-gl.css";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Map as MapGL,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import type { CachedLocation } from "@/lib/geo-cookie/parse";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { MapControls } from "../core/MapControls";
import { useGeolocation } from "../hooks/useGeolocation";
import { useMapDeepLink } from "../hooks/useMapDeepLink";
import { useMapInitialFlight } from "../hooks/useMapInitialFlight";
import {
  useMapActions,
  useMapCore,
  useMapData as useMapDataFromXState,
  useMapFilters,
  useMapPinPlacement,
  useMapUI,
} from "../hooks/useMapMachine";
import { useMapPlaceSelection } from "../hooks/useMapPlaceSelection";
import { useMapSearchParams } from "../hooks/useMapSearchParams";
import { useSearchParamsSync } from "../hooks/useSearchParamsSync";
import { CenterPinOverlay } from "../places/CenterPinOverlay";
import {
  PlaceDetailsDrawer,
  type PlaceDetailsDrawerRef,
} from "../places/PlaceDetailsDrawer";
import { SearchResultsList } from "../places/SearchResultsList";
import type { PlaceResult } from "../types";
import { getDrawerOffset } from "../utils/layout";
import { INTERACTIVE_LAYER_IDS } from "./constants";
import { useMapBoundsML } from "./hooks/useMapBoundsML";
import { useMapInteraction } from "./hooks/useMapInteraction";
import { POISymbolLayer } from "./POISymbolLayer";
import { SelectedPlaceLayer } from "./SelectedPlaceLayer";
import { UserLocationLayer } from "./UserLocationLayer";
import { loadPOIIcons } from "./utils/iconLoader";

interface MapLibreRendererProps {
  userId: string;
  cachedLocation?: CachedLocation | null;
}

const CARTO_LIGHT_STYLE =
  "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
const CARTO_DARK_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export function MapLibreRenderer({
  userId,
  cachedLocation,
}: MapLibreRendererProps) {
  const mapRef = useRef<MapRef>(null);
  const detailDrawerRef = useRef<PlaceDetailsDrawerRef>(null);
  const [iconsLoaded, setIconsLoaded] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // XState hooks
  const mapCore = useMapCore();
  const mapUI = useMapUI();
  const mapActions = useMapActions();
  const mapFilters = useMapFilters();
  const { isPlacing } = useMapPinPlacement();
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 769px)");
  const hasSidebar = useMediaQuery("(min-width: 600px)");

  // URL state sync
  const searchParams = useMapSearchParams();
  useSearchParamsSync(searchParams);

  const {
    mapItems,
    semanticResults,
    isLoading: placesLoading,
    placesError,
    geocodeTarget,
  } = useMapDataFromXState();

  // MapLibre-specific hooks
  const { bounds, handleBoundsChange } = useMapBoundsML();
  useMapInteraction(mapRef, iconsLoaded);

  // Geolocation (survives remounts via module-level store)
  const { location: userLocation, loading: locationLoading } = useGeolocation();

  // Initial flight + view state
  const { initialViewState, isLocationReady } = useMapInitialFlight({
    mapRef,
    mapReady,
    userLocation,
    locationLoading,
    cachedLocation,
  });

  // Place selection ↔ URL coordination
  const { handleSelectPlace, handleCloseDrawer, isManualSelectionRef } =
    useMapPlaceSelection({
      isDesktop,
      detailDrawerRef,
    });

  // Deep link: URL placeId → fetch + fly
  useMapDeepLink({
    mapRef,
    detailDrawerRef,
    mapReady,
    isDesktop,
    hasSidebar,
    isManualSelectionRef,
  });

  // Place lookup map — on click we look up the full PlaceResult by ID
  const placeLookup = useMemo(() => {
    const lookup = new Map<string, PlaceResult>();
    for (const item of mapItems) {
      if (!("is_cluster" in item)) {
        lookup.set(item.id, item);
      }
    }
    return lookup;
  }, [mapItems]);

  // ── Sync effects ─────────────────────────────────────────────────────

  // Update XState when userLocation changes
  useEffect(() => {
    if (userLocation) {
      mapActions.setUserLocation(userLocation);
    }
  }, [userLocation, mapActions]);

  // Sync debounced bounds to XState (triggers data fetches)
  useEffect(() => {
    if (bounds) {
      mapActions.setBounds(bounds);
    }
  }, [bounds, mapActions]);

  // Fly to geocoded address when an address search resolves.
  // After flyTo completes, onMoveEnd fires → bounds update → bounded search.
  useEffect(() => {
    if (geocodeTarget && mapRef.current && mapReady) {
      mapRef.current.flyTo({
        center: [geocodeTarget.longitude, geocodeTarget.latitude],
        zoom: 16,
        duration: 800,
      });
      mapActions.clearGeocodeTarget();
    }
  }, [geocodeTarget, mapReady, mapActions]);

  // Memoize filters
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

  // Preserve selected place when mapItems update
  useEffect(() => {
    const selectedPlace = mapUI.selectedPlace;
    if (selectedPlace && mapItems.length > 0) {
      const updatedPlace = mapItems.find(
        (item): item is PlaceResult =>
          !("is_cluster" in item) && item.id === selectedPlace.id,
      );

      if (updatedPlace && updatedPlace !== selectedPlace) {
        mapActions.updateSelectedPlace(updatedPlace);
      }
    }
  }, [mapItems, mapUI.selectedPlace, mapActions]);

  // ── Event handlers ───────────────────────────────────────────────────

  const handleMapLoad = useCallback(async () => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    try {
      await loadPOIIcons(map);
      setIconsLoaded(true);
    } catch (err) {
      console.error("Failed to load map icons:", err);
      mapActions.setError("Failed to load map icons. Please refresh.");
      return;
    }

    // Report initial bounds so XState can fetch data immediately
    const b = map.getBounds();
    handleBoundsChange({
      north: b.getNorth(),
      south: b.getSouth(),
      east: b.getEast(),
      west: b.getWest(),
    });
    mapActions.setZoom(map.getZoom());
    mapActions.initialize();
    setMapReady(true);
  }, [mapActions, handleBoundsChange]);

  const handleMoveEnd = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const b = map.getBounds();
    handleBoundsChange({
      north: b.getNorth(),
      south: b.getSouth(),
      east: b.getEast(),
      west: b.getWest(),
    });
    mapActions.setZoom(map.getZoom());
  }, [handleBoundsChange, mapActions]);

  const handleClick = useCallback(
    (e: MapLayerMouseEvent) => {
      // Suppress place selection during pin placement mode
      if (isPlacing) return;

      const feature = e.features?.[0];

      if (!feature) {
        if (mapUI.isDrawerOpen) {
          // Mobile: collapse to smallest state; Desktop: close
          if (!isDesktop) {
            detailDrawerRef.current?.collapse();
          } else {
            handleCloseDrawer();
          }
        }
        return;
      }

      const props = feature.properties;

      if (props?.isCluster) {
        // Cluster clicked - fly to it zoomed in (capped at 18)
        const coordinates = (feature.geometry as GeoJSON.Point).coordinates;
        const currentZoom = mapRef.current?.getMap()?.getZoom() ?? 10;
        mapRef.current?.flyTo({
          center: [coordinates[0], coordinates[1]],
          zoom: Math.min(currentZoom + 3, 18),
          duration: 800,
        });
        return;
      }

      // Individual place clicked — look up from the pre-built map,
      // falling back to selectedPlace (for the always-visible selected pin layer)
      const placeId = props?.id as string | undefined;
      if (placeId) {
        const place =
          placeLookup.get(placeId) ??
          (mapUI.selectedPlace?.id === placeId
            ? mapUI.selectedPlace
            : undefined);
        if (place) {
          handleSelectPlace(place);
          // Center on the visible area accounting for the detail panel
          const [lng, lat] = place.location.coordinates;
          const currentZoom = mapRef.current?.getMap()?.getZoom() ?? 15;
          mapRef.current?.flyTo({
            center: [lng, lat],
            zoom: Math.max(currentZoom, 15),
            duration: 600,
            offset: getDrawerOffset(isDesktop, hasSidebar),
          });
        }
      }
    },
    [
      isPlacing,
      mapUI.isDrawerOpen,
      mapUI.selectedPlace,
      handleCloseDrawer,
      handleSelectPlace,
      placeLookup,
      isDesktop,
      hasSidebar,
    ],
  );

  const handleLocationClick = useCallback(() => {
    if (userLocation && mapRef.current) {
      mapRef.current.flyTo({
        center: [userLocation.longitude, userLocation.latitude],
        zoom: 16,
        duration: 600,
      });
    } else if (!userLocation) {
      mapActions.setError(
        "Location access denied. Please enable location services.",
      );
    }
  }, [userLocation, mapActions]);

  const handleConfirmPinLocation = useCallback(() => {
    const center = mapRef.current?.getCenter();
    if (center) {
      mapActions.exitPinPlacement();
      router.push(`/map/create-place?lat=${center.lat}&lng=${center.lng}`);
    }
  }, [mapActions, router]);

  const handleCenterOnPlace = useCallback(
    (place: PlaceResult) => {
      if (mapRef.current) {
        const [lng, lat] = place.location.coordinates;
        const currentZoom = mapRef.current.getMap()?.getZoom() ?? 15;
        mapRef.current.flyTo({
          center: [lng, lat],
          zoom: Math.max(currentZoom, 15),
          duration: 600,
          offset: getDrawerOffset(isDesktop, hasSidebar),
        });
      }
    },
    [isDesktop, hasSidebar],
  );

  const mapStyle = mapCore.isDarkMode ? CARTO_DARK_STYLE : CARTO_LIGHT_STYLE;

  // Location loading state
  if (!isLocationReady) {
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
    <Box sx={{ height: "100%", width: "100%", position: "relative" }}>
      <MapGL
        ref={mapRef}
        initialViewState={initialViewState}
        mapStyle={mapStyle}
        onLoad={handleMapLoad}
        onMoveEnd={handleMoveEnd}
        onClick={handleClick}
        interactiveLayerIds={INTERACTIVE_LAYER_IDS as unknown as string[]}
        maxZoom={22}
        style={{ width: "100%", height: "100%" }}
      >
        {iconsLoaded && (
          <POISymbolLayer
            items={mapItems}
            filters={filters}
            isDarkMode={mapCore.isDarkMode}
            currentZoom={mapCore.currentZoom}
          />
        )}

        {iconsLoaded && (
          <SelectedPlaceLayer
            selectedPlace={mapUI.selectedPlace}
            isDarkMode={mapCore.isDarkMode}
          />
        )}

        {userLocation && <UserLocationLayer location={userLocation} />}
      </MapGL>

      {/* Error overlay */}
      {(mapUI.error || placesError) && (
        <Alert
          color="danger"
          sx={{
            position: "absolute",
            top: 80,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 10,
            maxWidth: 400,
          }}
        >
          {mapUI.error || placesError}
        </Alert>
      )}

      {/* Search results overlay */}
      {mapFilters.isSemanticSearch &&
        semanticResults &&
        semanticResults.length > 0 && (
          <SearchResultsList
            results={semanticResults}
            searchQuery={mapFilters.searchQuery}
            isLoading={placesLoading}
            onPlaceSelect={handleSelectPlace}
            onCenterOnPlace={handleCenterOnPlace}
            onClose={() => searchParams.setSearch("")}
            isDetailOpen={mapUI.isDrawerOpen}
          />
        )}

      {/* Pin placement overlay */}
      {isPlacing && (
        <CenterPinOverlay
          onConfirm={handleConfirmPinLocation}
          onCancel={mapActions.exitPinPlacement}
        />
      )}

      {/* Map controls */}
      <MapControls onLocationClick={handleLocationClick} />

      {/* Place details drawer via portal */}
      {createPortal(
        <PlaceDetailsDrawer
          ref={detailDrawerRef}
          place={mapUI.selectedPlace}
          open={mapUI.isDrawerOpen}
          onClose={handleCloseDrawer}
          userId={userId}
        />,
        document.body,
      )}
    </Box>
  );
}
