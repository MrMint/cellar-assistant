"use client";

import type * as GeoJSON from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MapGL,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import { useNavigate } from "@/components/app/useNavigate";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { CachedLocation } from "@/lib/geo-cookie/parse";
import { cn } from "@/lib/utils";
import { useWantToGoPlaceIds } from "../../want-to-try/useWantToGoPlaceIds";
import { LocationPrePrompt } from "../core/LocationPrePrompt";
import { MapBottomStack } from "../core/MapBottomStack";
import { MapControls } from "../core/MapControls";
import { MapErrorBanner } from "../core/MapErrorBanner";
import { MapShell } from "../core/MapShell";
import {
  LOCATION_DENIED_MESSAGE,
  locationButtonAction,
  locationPrePromptVisible,
} from "../hooks/geolocation-store";
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
import { useViewportInsets } from "../hooks/useViewportInsets";
import { CenterPinOverlay } from "../places/CenterPinOverlay";
import {
  PlaceDetailsDrawer,
  type PlaceDetailsDrawerRef,
} from "../places/PlaceDetailsDrawer";
import { SearchEmptyState } from "../places/SearchEmptyState";
import { SearchResultsList } from "../places/SearchResultsList";
import { createPlaceHref, showNotOnMapYet } from "../places/search-empty-state";
import type { PlaceResult } from "../types";
import { getDrawerOffset } from "../utils/layout";
import { basemapStyle, MAP_CANVAS_BACKGROUND } from "./basemap";
import { INTERACTIVE_LAYER_IDS } from "./constants";
import { useMapBoundsML } from "./hooks/useMapBoundsML";
import { useMapInteraction } from "./hooks/useMapInteraction";
import { POISymbolLayer } from "./POISymbolLayer";
import { SelectedPlaceLayer } from "./SelectedPlaceLayer";
import { UserLocationLayer } from "./UserLocationLayer";
import { loadPOIIcons } from "./utils/iconLoader";
import { MAPLIBRE_WORKER_URL } from "./workerUrl";

interface MapLibreRendererProps {
  userId: string;
  cachedLocation?: CachedLocation | null;
}

export function MapLibreRenderer({
  userId,
  cachedLocation,
}: MapLibreRendererProps) {
  const mapRef = useRef<MapRef>(null);
  const detailDrawerRef = useRef<PlaceDetailsDrawerRef>(null);
  const [iconsLoaded, setIconsLoaded] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  // The map's own box: the fixed panels sit beside the rail and above the
  // tab bar by measuring it (`useViewportInsets`).
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const insets = useViewportInsets(container);

  // XState hooks
  const mapCore = useMapCore();
  const mapUI = useMapUI();
  const mapActions = useMapActions();
  const mapFilters = useMapFilters();
  const { isPlacing } = useMapPinPlacement();
  const navigate = useNavigate();
  const isDesktop = useMediaQuery("(min-width: 769px)");
  const hasSidebar = useMediaQuery("(min-width: 600px)");

  // URL state sync
  const searchParams = useMapSearchParams();
  useSearchParamsSync(searchParams);

  const {
    mapItems,
    semanticResults,
    semanticResultsQuery,
    isLoading: placesLoading,
    placesError,
    geocodeTarget,
  } = useMapDataFromXState();

  // X08: the viewer's want-to-go places, drawn as badged pins.
  const wantToGo = useWantToGoPlaceIds();

  // MapLibre-specific hooks
  const { bounds, handleBoundsChange } = useMapBoundsML();
  useMapInteraction(mapRef, iconsLoaded);

  // Geolocation (survives remounts via module-level store). D14: asked for
  // when the map opens, but only after our own one-line reason.
  const geolocation = useGeolocation();
  const { location: userLocation, loading: locationLoading } = geolocation;
  const showLocationPrePrompt = locationPrePromptVisible(geolocation);

  /** N22: the searched name the pin drop carries into the create form. */
  const pendingPlaceNameRef = useRef<string | null>(null);

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
    insets,
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
            offset: getDrawerOffset(isDesktop, hasSidebar, insets),
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
      insets,
    ],
  );

  // On demand (D14): the location button asks when nobody has yet.
  const handleLocationClick = useCallback(() => {
    if (userLocation && mapRef.current) {
      mapRef.current.flyTo({
        center: [userLocation.longitude, userLocation.latitude],
        zoom: 16,
        duration: 600,
      });
      return;
    }
    if (userLocation) return;
    switch (locationButtonAction(geolocation)) {
      case "request":
        geolocation.request();
        return;
      case "explain-denied":
        mapActions.setError(LOCATION_DENIED_MESSAGE);
        return;
      case "unsupported":
        mapActions.setError("This browser can't share your location.");
        return;
      case "wait":
        return;
    }
  }, [userLocation, geolocation, mapActions]);

  const handleConfirmPinLocation = useCallback(() => {
    const center = mapRef.current?.getCenter();
    if (center) {
      mapActions.exitPinPlacement();
      const name = pendingPlaceNameRef.current;
      pendingPlaceNameRef.current = null;
      navigate.push(
        createPlaceHref({
          latitude: center.lat,
          longitude: center.lng,
          name,
        }),
      );
    }
  }, [mapActions, navigate]);

  // However the pin drop ends (Confirm reads the name first; Cancel, or the
  // controls' own toggle), a searched name must not leak into the next one.
  useEffect(() => {
    if (!isPlacing) pendingPlaceNameRef.current = null;
  }, [isPlacing]);

  // N22: "Not on the map yet: Add it here" drops a pin at the map's centre,
  // carrying the searched name into the create form.
  const handleAddSearchedPlace = useCallback(() => {
    pendingPlaceNameRef.current = mapFilters.searchQuery.trim() || null;
    searchParams.setSearch("");
    mapActions.enterPinPlacement();
  }, [mapFilters.searchQuery, searchParams, mapActions]);

  const notOnMapYet = showNotOnMapYet({
    isSemanticSearch: mapFilters.isSemanticSearch,
    searchQuery: mapFilters.searchQuery,
    answeredQuery: semanticResultsQuery,
    resultCount: semanticResults?.length ?? 0,
    isLoading: placesLoading,
    isPlacing,
  });

  const handleCenterOnPlace = useCallback(
    (place: PlaceResult) => {
      if (mapRef.current) {
        const [lng, lat] = place.location.coordinates;
        const currentZoom = mapRef.current.getMap()?.getZoom() ?? 15;
        mapRef.current.flyTo({
          center: [lng, lat],
          zoom: Math.max(currentZoom, 15),
          duration: 600,
          offset: getDrawerOffset(isDesktop, hasSidebar, insets),
        });
      }
    },
    [isDesktop, hasSidebar, insets],
  );

  const mapStyle = basemapStyle(mapCore.isDarkMode);

  // Location loading state
  if (!isLocationReady) {
    // The route's shell with a line over it (X24): the same frame the tap
    // showed, so waiting on the location changes words, not layout.
    return <MapShell status="Getting your location..." />;
  }

  return (
    <div
      ref={setContainer}
      data-slot="map-canvas"
      className={cn(
        // `isolate`: every map overlay (controls 1000+, the drawer, the
        // results list, the pin) orders itself inside the map, so the app's
        // own layers — Radix tooltips and popovers (z-50 on <body>), the tab
        // bar, toasts — draw above all of them.
        "relative isolate h-full w-full",
        // N22: the theme's surface until the first tile, never a cream flash.
        "bg-surface-1",
        // The attribution stays (a licensing obligation) but on the dark
        // basemap it was the brightest thing on screen: the theme's surface,
        // translucent, instead of MapLibre's white pill. `!`: MapLibre's
        // stylesheet is unlayered, so a plain (layered) utility loses to it.
        mapCore.isDarkMode &&
          "[&_.maplibregl-ctrl-attrib]:bg-surface-1/75! [&_.maplibregl-ctrl-attrib]:text-ink-3! [&_.maplibregl-ctrl-attrib_a]:text-ink-2! [&_.maplibregl-ctrl-attrib-button]:invert!",
      )}
    >
      <MapGL
        ref={mapRef}
        workerUrl={MAPLIBRE_WORKER_URL}
        initialViewState={initialViewState}
        mapStyle={mapStyle}
        onLoad={handleMapLoad}
        onMoveEnd={handleMoveEnd}
        onClick={handleClick}
        interactiveLayerIds={INTERACTIVE_LAYER_IDS as unknown as string[]}
        maxZoom={22}
        style={{
          width: "100%",
          height: "100%",
          background: MAP_CANVAS_BACKGROUND,
        }}
      >
        {iconsLoaded && (
          <POISymbolLayer
            items={mapItems}
            filters={filters}
            wantToGo={wantToGo}
            isDarkMode={mapCore.isDarkMode}
            currentZoom={mapCore.currentZoom}
          />
        )}

        {iconsLoaded && (
          <SelectedPlaceLayer
            selectedPlace={mapUI.selectedPlace}
            wantToGo={wantToGo}
            isDarkMode={mapCore.isDarkMode}
          />
        )}

        {userLocation && <UserLocationLayer location={userLocation} />}
      </MapGL>

      {/* Bottom cards, one column: the error above whichever card shows */}
      <MapBottomStack>
        {mapUI.error ? (
          <MapErrorBanner
            message={mapUI.error}
            onDismiss={mapActions.clearError}
          />
        ) : placesError ? (
          <MapErrorBanner message={placesError} />
        ) : null}

        {/* N22: a search that found nothing offers to add the place */}
        {notOnMapYet && !showLocationPrePrompt && (
          <SearchEmptyState
            query={mapFilters.searchQuery.trim()}
            onAddHere={handleAddSearchedPlace}
          />
        )}

        {/* D14: our one-line reason, then the browser's prompt on Continue */}
        {showLocationPrePrompt && !isPlacing && (
          <LocationPrePrompt
            onContinue={geolocation.request}
            onDismiss={geolocation.dismiss}
          />
        )}
      </MapBottomStack>

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
            insets={insets}
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

      {/* Place details drawer: fixed to the viewport, but inside the map's
          stacking context so the desktop search stays above it (it was
          portalled to <body>, which `isolate` would now put over the
          controls). */}
      <PlaceDetailsDrawer
        ref={detailDrawerRef}
        place={mapUI.selectedPlace}
        open={mapUI.isDrawerOpen}
        onClose={handleCloseDrawer}
        userId={userId}
        insets={insets}
      />
    </div>
  );
}
