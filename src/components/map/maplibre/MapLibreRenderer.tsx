'use client';

import { Alert, Box } from '@mui/joy';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Map as MapGL,
  NavigationControl,
  type MapLayerMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre';
import { useGeolocation } from '../hooks/useGeolocation';
import {
  useMapActions,
  useMapCore,
  useMapData as useMapDataFromXState,
  useMapFilters,
  useMapUI,
} from '../hooks/useMapMachine';
import { useMapSearchParams } from '../hooks/useMapSearchParams';
import { useSearchParamsSync } from '../hooks/useSearchParamsSync';
import { MapControls } from '../core/MapControls';
import { PlaceDetailsDrawer } from '../places/PlaceDetailsDrawer';
import { SearchResultsList } from '../places/SearchResultsList';
import type { PlaceResult } from '../types';
import { INTERACTIVE_LAYER_IDS } from './constants';
import { useMapBoundsML } from './hooks/useMapBoundsML';
import { useMapInteraction } from './hooks/useMapInteraction';
import { loadPOIIcons } from './utils/iconLoader';
import { POISymbolLayer } from './POISymbolLayer';
import { UserLocationLayer } from './UserLocationLayer';

interface MapLibreRendererProps {
  userId: string;
}

const CARTO_LIGHT_STYLE =
  'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
const CARTO_DARK_STYLE =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const FALLBACK_CENTER = { longitude: -89.5, latitude: 44.5 };

export function MapLibreRenderer({ userId }: MapLibreRendererProps) {
  const mapRef = useRef<MapRef>(null);
  const hasFlownRef = useRef(false);
  const [iconsLoaded, setIconsLoaded] = useState(false);

  // XState hooks
  const mapCore = useMapCore();
  const mapUI = useMapUI();
  const mapActions = useMapActions();
  const mapFilters = useMapFilters();

  // URL state sync
  const searchParams = useMapSearchParams();
  useSearchParamsSync(searchParams);

  const {
    mapItems,
    semanticResults,
    isLoading: placesLoading,
    placesError,
  } = useMapDataFromXState();

  // New MapLibre-specific hooks
  const { bounds, handleBoundsChange } = useMapBoundsML();
  useMapInteraction(mapRef, iconsLoaded);

  // Geolocation
  const { location: userLocation, loading: locationLoading } = useGeolocation();

  // Place lookup map — replaces placeJson serialization.
  // On click we look up the full PlaceResult by ID instead of parsing JSON.
  const placeLookup = useMemo(() => {
    const lookup = new Map<string, PlaceResult>();
    for (const item of mapItems) {
      if (!('is_cluster' in item)) {
        lookup.set(item.id, item);
      }
    }
    return lookup;
  }, [mapItems]);

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

  // Fly to user location on first acquisition
  useEffect(() => {
    if (userLocation && !hasFlownRef.current && mapRef.current) {
      hasFlownRef.current = true;
      mapRef.current.flyTo({
        center: [userLocation.longitude, userLocation.latitude],
        zoom: 15,
        duration: 600,
      });
    }
  }, [userLocation]);

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
    if (mapUI.selectedPlace && mapItems.length > 0) {
      const updatedPlace = mapItems.find(
        (item): item is PlaceResult =>
          !('is_cluster' in item) &&
          (item.id === mapUI.selectedPlace?.id ||
            item.name === mapUI.selectedPlace?.name),
      );

      if (updatedPlace && updatedPlace !== mapUI.selectedPlace) {
        mapActions.updateSelectedPlace(updatedPlace);
      }
    }
  }, [mapItems, mapUI.selectedPlace, mapActions]);

  // --- Event handlers ---

  const handleMapLoad = useCallback(async () => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    try {
      await loadPOIIcons(map);
      setIconsLoaded(true);
    } catch (err) {
      console.error('Failed to load map icons:', err);
      mapActions.setError('Failed to load map icons. Please refresh.');
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
      const feature = e.features?.[0];

      if (!feature) {
        // No feature clicked - close drawer if open
        if (mapUI.isDrawerOpen) {
          mapActions.handleMapClick();
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

      // Individual place clicked — look up from the pre-built map
      const placeId = props?.id as string | undefined;
      if (placeId) {
        const place = placeLookup.get(placeId);
        if (place) {
          mapActions.selectPlace(place);
        }
      }
    },
    [mapUI.isDrawerOpen, mapActions, placeLookup],
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
        'Location access denied. Please enable location services.',
      );
    }
  }, [userLocation, mapActions]);

  const handleCenterOnPlace = useCallback((place: PlaceResult) => {
    if (mapRef.current) {
      const [lng, lat] = place.location.coordinates;
      const currentZoom = mapRef.current.getMap()?.getZoom() ?? 15;
      mapRef.current.flyTo({
        center: [lng, lat],
        zoom: Math.max(currentZoom, 15),
        duration: 600,
      });
    }
  }, []);

  // Initial view state — intentionally computed once on first render.
  // The loading guard (`locationLoading && !userLocation`) ensures
  // userLocation is resolved before the Map mounts, so the captured
  // value here is correct (user coords or fallback).
  const initialViewState = useMemo(
    () => ({
      longitude: userLocation?.longitude ?? FALLBACK_CENTER.longitude,
      latitude: userLocation?.latitude ?? FALLBACK_CENTER.latitude,
      zoom: userLocation ? 15 : 8,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally once
    [],
  );

  const mapStyle = mapCore.isDarkMode ? CARTO_DARK_STYLE : CARTO_LIGHT_STYLE;

  // Location loading state
  if (locationLoading && !userLocation) {
    return (
      <Box
        sx={{
          height: '100%',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'background.surface',
        }}
      >
        <Alert color="neutral">Getting your location...</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', width: '100%', position: 'relative' }}>
      <MapGL
        ref={mapRef}
        initialViewState={initialViewState}
        mapStyle={mapStyle}
        onLoad={handleMapLoad}
        onMoveEnd={handleMoveEnd}
        onClick={handleClick}
        interactiveLayerIds={INTERACTIVE_LAYER_IDS as unknown as string[]}
        maxZoom={22}
        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="bottom-right" showCompass={false} />

        {iconsLoaded && (
          <POISymbolLayer
            items={mapItems}
            filters={filters}
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
            position: 'absolute',
            top: 80,
            left: '50%',
            transform: 'translateX(-50%)',
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
            onPlaceSelect={mapActions.selectPlace}
            onCenterOnPlace={handleCenterOnPlace}
            onClose={() => searchParams.setSearch('')}
          />
        )}

      {/* Map controls */}
      <MapControls
        onRefresh={mapActions.refreshPlaces}
        onLocationClick={handleLocationClick}
        loading={placesLoading}
      />

      {/* Place details drawer via portal */}
      {createPortal(
        <PlaceDetailsDrawer
          place={mapUI.selectedPlace}
          open={mapUI.isDrawerOpen}
          onClose={mapActions.closeDrawer}
          userId={userId}
        />,
        document.body,
      )}
    </Box>
  );
}
