"use client";

import type * as GeoJSON from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AttributionControl,
  Map as MapGL,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import { Add, Decrease, ICON_STROKE, MyLocation } from "@/components/app/icons";
import { GlassDisc } from "@/components/app/overlays/GlassDisc";
import { useNavigate } from "@/components/app/useNavigate";
import { breakpointUp, useMediaQuery } from "@/hooks/useMediaQuery";
import type { CachedLocation } from "@/lib/geo-cookie/parse";
import { useResolvedTheme } from "@/lib/theme/client";
import { cn } from "@/lib/utils";
import { useWantToGoPlaceIds } from "../../want-to-try/useWantToGoPlaceIds";
import type { DockDetent } from "../core/dock";
import { LocationPrePrompt } from "../core/LocationPrePrompt";
import { MapBottomStack } from "../core/MapBottomStack";
import { MapErrorBanner } from "../core/MapErrorBanner";
import { MapPlacesColumn, MapPlacesDock } from "../core/MapPlaces";
import { MapShell } from "../core/MapShell";
import { matchesKinds, quickLookIndex } from "../core/map-places";
import { PlaceQuickLook } from "../core/PlaceQuickLook";
import { MapPlacePane } from "../desktop/MapPlacePane";
import {
  LOCATION_DENIED_MESSAGE,
  locationButtonAction,
  locationPrePromptVisible,
} from "../hooks/geolocation-store";
import { useGeolocation } from "../hooks/useGeolocation";
import { useMapDeepLink } from "../hooks/useMapDeepLink";
import { useMapInitialFlight } from "../hooks/useMapInitialFlight";
import { useMapList } from "../hooks/useMapList";
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
import { createPlaceHref } from "../places/search-empty-state";
import type { PlaceResult } from "../types";
import { getDrawerOffset } from "../utils/layout";
import { basemapStyle, MAP_CANVAS_BACKGROUND } from "./basemap";
import { INTERACTIVE_LAYER_IDS } from "./constants";
import { useMapBoundsML } from "./hooks/useMapBoundsML";
import { useMapInteraction } from "./hooks/useMapInteraction";
import { POISymbolLayer } from "./POISymbolLayer";
import { type MapTheme, mapPalette } from "./palette";
import { SelectedPlaceLayer } from "./SelectedPlaceLayer";
import { UserLocationLayer } from "./UserLocationLayer";
import { loadPOIIcons } from "./utils/iconLoader";
import { MAPLIBRE_WORKER_URL } from "./workerUrl";

interface MapLibreRendererProps {
  userId: string;
  cachedLocation?: CachedLocation | null;
}

/** The map's own height, measured: the dock's detents come from it. */
function useHeightOf(element: HTMLElement | null): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (!element) return;
    const update = () => setHeight(element.clientHeight);
    update();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [element]);
  return height;
}

/** Before the first measure: a phone's map, roughly. */
const FALLBACK_MAP_HEIGHT = 700;

/**
 * The Map (Map board; desktop/Places 13). On a phone, the map fills the
 * content area under the dock (search, kind chips, the list in view); a pin
 * or a row opens the quick look, and Open page the place's sheet (the
 * drawer). From `md`, the list is a column beside the map and a place opens
 * in the desktop pane over the map's left edge (P2's `PlacePane`, L32). The
 * map's style and pins follow the app's theme (L23), and Map options can
 * switch the map alone.
 */
export function MapLibreRenderer({
  userId,
  cachedLocation,
}: MapLibreRendererProps) {
  const mapRef = useRef<MapRef>(null);
  const detailDrawerRef = useRef<PlaceDetailsDrawerRef>(null);
  const [iconsLoaded, setIconsLoaded] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  // The map's own box: the drawer's offsets come from where it sits.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const insets = useViewportInsets(container);
  const mapHeight = useHeightOf(container);

  // XState hooks
  const mapCore = useMapCore();
  const mapUI = useMapUI();
  const mapActions = useMapActions();
  const mapFilters = useMapFilters();
  const { isPlacing } = useMapPinPlacement();
  const navigate = useNavigate();
  const isDesktop = useMediaQuery(breakpointUp("md"));
  const hasSidebar = useMediaQuery("(min-width: 600px)");
  const currentParams = useSearchParams();

  // URL state sync
  const searchParams = useMapSearchParams();
  useSearchParamsSync(searchParams);

  const { mapItems, placesError, geocodeTarget } = useMapDataFromXState();

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
  const origin = useMemo(
    () =>
      userLocation
        ? { latitude: userLocation.latitude, longitude: userLocation.longitude }
        : null,
    [userLocation],
  );

  // The list the dock, the column, the quick look and the pins share.
  const list = useMapList({ bounds: bounds ?? null, origin, userId });

  // L23: the map follows the app's theme; Map options switch the map alone
  // until the theme next changes.
  const appTheme = useResolvedTheme();
  useEffect(() => {
    mapActions.setDarkMode(appTheme === "dark");
  }, [appTheme, mapActions]);
  const mapTheme: MapTheme = mapCore.isDarkMode ? "dark" : "light";
  const palette = useMemo(() => mapPalette(mapTheme), [mapTheme]);
  const paletteRef = useRef(palette);
  paletteRef.current = palette;

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

  // The dock rests at two and a half rows; a search lifts it to full.
  const [detent, setDetent] = useState<DockDetent>("rest");
  useEffect(() => {
    if (list.query !== "") setDetent("full");
  }, [list.query]);

  // The quick look's place, held by id (phone): the list re-sorts on every
  // location fix, so an index could swap the open card (F-193).
  const [peekId, setPeekId] = useState<string | null>(null);
  const peek = quickLookIndex(list.places, peekId);
  const setPeek = useCallback(
    (index: number | null) =>
      setPeekId(index === null ? null : (list.places[index]?.id ?? null)),
    [list.places],
  );
  // Open page lands on `?placeId=` (the drawer): the quick look gives way.
  useEffect(() => {
    if (searchParams.placeId) setPeekId(null);
  }, [searchParams.placeId]);

  const placeHref = useCallback(
    (place: PlaceResult) => {
      const next = new URLSearchParams(currentParams?.toString() ?? "");
      next.set("placeId", place.id);
      return `/map?${next.toString()}`;
    },
    [currentParams],
  );

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

  // The pins follow the kind chips too.
  const pinItems = useMemo(
    () =>
      list.kinds.length === 0
        ? mapItems
        : mapItems.filter(
            (item) => "is_cluster" in item || matchesKinds(item, list.kinds),
          ),
    [mapItems, list.kinds],
  );

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

  // The pins are drawn in the map's theme: redraw them when it changes.
  useEffect(() => {
    if (!iconsLoaded) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    loadPOIIcons(map, palette).catch((err) => {
      console.error("Failed to redraw map icons:", err);
    });
  }, [palette, iconsLoaded]);

  // ── Event handlers ───────────────────────────────────────────────────

  const handleMapLoad = useCallback(async () => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    try {
      await loadPOIIcons(map, paletteRef.current);
      setIconsLoaded(true);
    } catch (err) {
      console.error("Failed to load map icons:", err);
      mapActions.setError("The map's pins didn't load. Reload the page.");
      return;
    }
    // A new basemap (the theme changed) drops the sprites it held.
    map.on("style.load", () => {
      loadPOIIcons(map, paletteRef.current).catch((err) => {
        console.error("Failed to reload map icons:", err);
      });
    });

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

  const flyToPlace = useCallback(
    (place: PlaceResult) => {
      if (!mapRef.current) return;
      const [lng, lat] = place.location.coordinates;
      const currentZoom = mapRef.current.getMap()?.getZoom() ?? 15;
      mapRef.current.flyTo({
        center: [lng, lat],
        zoom: Math.max(currentZoom, 15),
        duration: 600,
        offset: getDrawerOffset(isDesktop, hasSidebar, insets),
      });
    },
    [isDesktop, hasSidebar, insets],
  );

  /**
   * Opening a place: on a phone the quick look over the list (or straight
   * to its sheet when it is not in the list); on desktop the pane.
   */
  const openPlace = useCallback(
    (place: PlaceResult) => {
      if (!isDesktop) {
        if (list.places.some((p) => p.id === place.id)) {
          setPeekId(place.id);
          return;
        }
      }
      handleSelectPlace(place);
      flyToPlace(place);
    },
    [isDesktop, list.places, handleSelectPlace, flyToPlace],
  );

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
        if (place) openPlace(place);
      }
    },
    [
      isPlacing,
      mapUI.isDrawerOpen,
      mapUI.selectedPlace,
      handleCloseDrawer,
      openPlace,
      placeLookup,
      isDesktop,
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

  // N22: Add a place drops a pin at the map's centre; a search that found
  // nothing carries its words into the create form as the name.
  const { query: listQuery, clearSearch } = list;
  const handleAddPlace = useCallback(() => {
    pendingPlaceNameRef.current = listQuery || null;
    if (listQuery !== "") clearSearch();
    setPeekId(null);
    mapActions.enterPinPlacement();
  }, [listQuery, clearSearch, mapActions]);

  const handleMapTheme = useCallback(
    (theme: MapTheme) => mapActions.setDarkMode(theme === "dark"),
    [mapActions],
  );

  const mapStyle = basemapStyle(mapCore.isDarkMode);

  // Location loading state
  if (!isLocationReady) {
    // The route's shell with a line over it (X24): the same frame the tap
    // showed, so waiting on the location changes words, not layout.
    return <MapShell status="Getting your location..." />;
  }

  const errorCard = mapUI.error ? (
    <MapErrorBanner message={mapUI.error} onDismiss={mapActions.clearError} />
  ) : placesError ? (
    <MapErrorBanner message={placesError} />
  ) : null;
  const prePrompt =
    showLocationPrePrompt && !isPlacing ? (
      <LocationPrePrompt
        onContinue={geolocation.request}
        onDismiss={geolocation.dismiss}
      />
    ) : null;

  const placesProps = {
    list,
    origin,
    theme: mapTheme,
    onThemeChange: handleMapTheme,
    onOpen: (index: number) => {
      const place = list.places[index];
      if (place) openPlace(place);
    },
    onAddPlace: handleAddPlace,
  };

  // Desktop: the open place, and its neighbours in the list.
  const paneIndex =
    mapUI.selectedPlace === null
      ? -1
      : list.places.findIndex((p) => p.id === mapUI.selectedPlace?.id);
  const stepPane = (by: number) => {
    const place = list.places[paneIndex + by];
    if (!place) return;
    handleSelectPlace(place);
    flyToPlace(place);
  };

  return (
    <div data-slot="map-layout" className="flex h-full w-full">
      {isDesktop && (
        <MapPlacesColumn
          {...placesProps}
          selectedId={mapUI.isDrawerOpen ? mapUI.selectedPlace?.id : null}
        />
      )}
      <div
        ref={setContainer}
        data-slot="map-canvas"
        className={cn(
          // `isolate`: every map overlay (the dock, the drawer, the pane,
          // the pin) orders itself inside the map, so the app's own layers —
          // Radix popovers (z-50 on <body>), the tab bar, toasts — draw
          // above all of them.
          "relative isolate h-full min-w-0 flex-1 overflow-hidden",
          // N22: the theme's surface until the first tile, never a cream flash.
          "bg-surface-1",
          // The attribution stays (a licensing obligation), on the theme's
          // surface instead of MapLibre's white pill. `!`: MapLibre's
          // stylesheet is unlayered, so a plain (layered) utility loses.
          "[&_.maplibregl-ctrl-attrib]:bg-surface-1/75! [&_.maplibregl-ctrl-attrib]:text-ink-3! [&_.maplibregl-ctrl-attrib_a]:text-ink-2!",
          mapTheme === "dark" && "[&_.maplibregl-ctrl-attrib-button]:invert!",
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
          attributionControl={false}
          style={{
            width: "100%",
            height: "100%",
            background: MAP_CANVAS_BACKGROUND,
          }}
        >
          {iconsLoaded && (
            <POISymbolLayer
              items={pinItems}
              filters={filters}
              wantToGo={wantToGo}
              palette={palette}
              currentZoom={mapCore.currentZoom}
            />
          )}

          {iconsLoaded && (
            <SelectedPlaceLayer
              selectedPlace={mapUI.selectedPlace}
              wantToGo={wantToGo}
              palette={palette}
            />
          )}

          {userLocation && (
            <UserLocationLayer location={userLocation} palette={palette} />
          )}

          {/* N20/N22: the attribution is a licensing obligation. On a phone
              the dock covers the map's foot, so it sits at the top corner,
              clear of the dock and the tab bar; from md at the foot. */}
          <AttributionControl
            compact
            position={isDesktop ? "bottom-right" : "top-right"}
          />
        </MapGL>

        {isDesktop ? (
          <>
            {/* Desktop: the cards over the map's foot, the map's own discs
                at its corner (desktop/Places 13). */}
            <MapBottomStack>
              {errorCard}
              {prePrompt}
            </MapBottomStack>
            <div className="absolute right-4 bottom-10 z-[12] flex flex-col gap-2">
              <GlassDisc
                aria-label="Zoom in"
                onClick={() => mapRef.current?.zoomIn({ duration: 300 })}
              >
                <Add aria-hidden strokeWidth={ICON_STROKE} />
              </GlassDisc>
              <GlassDisc
                aria-label="Zoom out"
                onClick={() => mapRef.current?.zoomOut({ duration: 300 })}
              >
                <Decrease aria-hidden strokeWidth={ICON_STROKE} />
              </GlassDisc>
              <GlassDisc
                aria-label="Go to my location"
                onClick={handleLocationClick}
              >
                <MyLocation aria-hidden strokeWidth={ICON_STROKE} />
              </GlassDisc>
            </div>
          </>
        ) : (
          <MapPlacesDock
            {...placesProps}
            mapHeight={mapHeight || FALLBACK_MAP_HEIGHT}
            detent={detent}
            onDetentChange={setDetent}
            hidden={isPlacing || mapUI.isDrawerOpen}
            above={
              <>
                {errorCard !== null && (
                  <div className="w-full">{errorCard}</div>
                )}
                {prePrompt !== null && (
                  <div className="w-full">{prePrompt}</div>
                )}
                <GlassDisc
                  aria-label="Go to my location"
                  onClick={handleLocationClick}
                >
                  <MyLocation aria-hidden strokeWidth={ICON_STROKE} />
                </GlassDisc>
              </>
            }
          />
        )}

        {/* Pin placement overlay */}
        {isPlacing && (
          <CenterPinOverlay
            onConfirm={handleConfirmPinLocation}
            onCancel={mapActions.exitPinPlacement}
          />
        )}

        {isDesktop ? (
          mapUI.selectedPlace !== null && (
            <MapPlacePane
              place={mapUI.selectedPlace}
              open={mapUI.isDrawerOpen}
              onClose={handleCloseDrawer}
              onPrevious={paneIndex > 0 ? () => stepPane(-1) : undefined}
              onNext={
                paneIndex >= 0 && paneIndex < list.places.length - 1
                  ? () => stepPane(1)
                  : undefined
              }
              onExpand={() => {
                const id = mapUI.selectedPlace?.id;
                if (id) navigate.push(`/places/${id}`);
              }}
            />
          )
        ) : (
          // The place's sheet (Places-Place ruling 1: on the map, a place
          // opens in the sheet), inside the map's stacking context.
          <PlaceDetailsDrawer
            ref={detailDrawerRef}
            place={mapUI.selectedPlace}
            open={mapUI.isDrawerOpen}
            onClose={handleCloseDrawer}
            userId={userId}
            insets={insets}
          />
        )}
      </div>

      {!isDesktop && (
        <PlaceQuickLook
          places={list.places}
          origin={origin}
          index={peek ?? 0}
          open={peek !== null}
          onOpenChange={(open) => {
            if (!open) setPeekId(null);
          }}
          onIndexChange={setPeek}
          hrefFor={placeHref}
        />
      )}
    </div>
  );
}
