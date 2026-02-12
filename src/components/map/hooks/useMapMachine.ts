"use client";

import { useSelector } from "@xstate/react";
import { useMemo } from "react";
import {
  useMapMachineActor,
  useMapMachineFromContext,
} from "../state/MapMachineProvider";
import type {
  ItemType,
  MapBounds,
  Place,
  UserLocation,
  VisitStatus,
} from "../types";
import { shallowEqual } from "../utils/shallowEqual";

/**
 * Main hook for using the map machine from context
 * Provides full access to state and send function
 */
export function useMapMachine() {
  return useMapMachineFromContext();
}

/**
 * Selector hooks for optimized re-renders
 * These hooks only re-render when specific parts of state change
 */

// Core map state selectors
export function useMapCore() {
  const actorRef = useMapMachineActor();
  return useSelector(
    actorRef,
    (state) => ({
      userId: state.context.userId,
      hasInitialized: state.context.hasInitialized,
      currentZoom: state.context.currentZoom,
      isDarkMode: state.context.isDarkMode,
      isDesktop: state.context.isDesktop,
      userLocation: state.context.userLocation,
      bounds: state.context.bounds,
      isInitialized: state.matches("idle"),
    }),
    shallowEqual,
  );
}

// UI state selectors
export function useMapUI() {
  const actorRef = useMapMachineActor();
  return useSelector(
    actorRef,
    (state) => ({
      // Derived from context — the drawer sub-state was removed.
      // Drawer is "open" whenever a place is selected.
      isDrawerOpen: state.context.selectedPlace !== null,
      selectedPlace: state.context.selectedPlace,
      error: state.context.error,
      hasError: state.matches({ idle: { error: "hasError" } }),
    }),
    shallowEqual,
  );
}

// Filter state selectors
export function useMapFilters() {
  const actorRef = useMapMachineActor();
  return useSelector(
    actorRef,
    (state) => ({
      selectedItemTypes: state.context.selectedItemTypes,
      searchQuery: state.context.searchQuery,
      isSemanticSearch: state.context.isSemanticSearch,
      globalSearch: state.context.globalSearch,
      minRating: state.context.minRating,
      visitStatuses: state.context.visitStatuses,
    }),
    shallowEqual,
  );
}

// Data state selectors
export function useMapData() {
  const actorRef = useMapMachineActor();
  return useSelector(
    actorRef,
    (state) => ({
      places: state.context.places,
      mapItems: state.context.mapItems,
      semanticResults: state.context.semanticResults,
      isLoading: state.matches({ idle: { data: "loading" } }),
      placesError: state.context.placesError,
      geocodeTarget: state.context.geocodeTarget,
    }),
    shallowEqual,
  );
}

// Pin placement state selector
export function useMapPinPlacement() {
  const actorRef = useMapMachineActor();
  return useSelector(
    actorRef,
    (state) => ({
      isPlacing: state.matches({ idle: { pinPlacement: "placing" } }),
    }),
    shallowEqual,
  );
}

export function useMapActions() {
  const actorRef = useMapMachineActor();
  const send = actorRef.send;

  return useMemo(
    () => ({
      // Initialization actions
      initialize: () => send({ type: "INITIALIZE" }),
      setUserLocation: (location: UserLocation) =>
        send({ type: "SET_USER_LOCATION", location }),
      setDesktop: (isDesktop: boolean) =>
        send({ type: "SET_DESKTOP", isDesktop }),
      setBounds: (bounds: MapBounds) => send({ type: "SET_BOUNDS", bounds }),

      // Map actions
      setZoom: (zoom: number) => send({ type: "SET_ZOOM", zoom }),
      toggleDarkMode: () => send({ type: "TOGGLE_DARK_MODE" }),
      setDarkMode: (isDark: boolean) => send({ type: "SET_DARK_MODE", isDark }),

      // UI actions
      selectPlace: (place: Place) => {
        send({ type: "SELECT_PLACE", place });
      },
      closeDrawer: () => send({ type: "CLOSE_DRAWER" }),
      handleMapClick: () => send({ type: "MAP_CLICK" }),
      updateSelectedPlace: (place: Place) =>
        send({ type: "UPDATE_SELECTED_PLACE", place }),

      // Error actions
      setError: (error: string | null) => send({ type: "SET_ERROR", error }),
      clearError: () => send({ type: "CLEAR_ERROR" }),

      // Filter actions
      setItemTypes: (itemTypes: ItemType[]) =>
        send({ type: "SET_ITEM_TYPES", itemTypes }),
      toggleItemType: (itemType: ItemType) =>
        send({ type: "TOGGLE_ITEM_TYPE", itemType }),
      setSearchQuery: (query: string) =>
        send({ type: "SET_SEARCH_QUERY", query }),
      performSemanticSearch: (query: string) =>
        send({ type: "PERFORM_SEMANTIC_SEARCH", query }),
      setMinRating: (rating: number | undefined) =>
        send({ type: "SET_MIN_RATING", rating }),
      setVisitStatuses: (statuses: VisitStatus[]) =>
        send({ type: "SET_VISIT_STATUSES", statuses }),
      setTierListIds: (tierListIds: string[]) =>
        send({ type: "SET_TIER_LIST_IDS", tierListIds }),
      setGlobalSearch: (globalSearch: boolean) =>
        send({ type: "SET_GLOBAL_SEARCH", globalSearch }),
      clearFilters: () => send({ type: "CLEAR_FILTERS" }),

      // Geocode actions
      clearGeocodeTarget: () => send({ type: "CLEAR_GEOCODE_TARGET" }),

      // Data actions
      refreshPlaces: () => send({ type: "REFRESH_PLACES" }),

      // Pin placement actions
      enterPinPlacement: () => send({ type: "ENTER_PIN_PLACEMENT" }),
      exitPinPlacement: () => send({ type: "EXIT_PIN_PLACEMENT" }),
    }),
    [send],
  );
}

/**
 * Comprehensive hook that provides all map state and actions
 * Use this when you need access to everything
 */
export function useMapState() {
  const [state, send] = useMapMachine();

  const core = useMapCore();
  const ui = useMapUI();
  const filters = useMapFilters();
  const data = useMapData();
  const actions = useMapActions();

  return {
    // State slices
    core,
    ui,
    filters,
    data,

    // Raw state and send (use sparingly)
    state,
    send,

    // Actions (preferred way to interact with machine)
    actions,

    // Helper functions
    hasActiveFilters: () => {
      return (
        filters.selectedItemTypes.length > 0 ||
        filters.searchQuery.length > 0 ||
        filters.minRating !== undefined ||
        filters.visitStatuses.length > 0
      );
    },

    getFilterState: () => ({
      selectedItemTypes: filters.selectedItemTypes,
      minRating: filters.minRating,
      searchQuery: filters.searchQuery,
    }),

    // State matching helpers
    isInitialized: () => state.matches("idle"),
    isDrawerOpen: () => state.context.selectedPlace !== null,
    isLoadingPlaces: () => state.matches({ idle: { data: "loading" } }),
    hasError: () => state.matches({ idle: { error: "hasError" } }),
  };
}

/**
 * Hook for components that only need to send events
 * Useful for child components that don't need to read state
 */
export function useMapSend() {
  const [, send] = useMapMachine();
  return send;
}

/**
 * Usage examples:
 *
 * // Full state access (for main map component)
 * const mapState = useMapState();
 *
 * // Optimized selectors (preferred for child components)
 * const { isDrawerOpen, selectedPlace } = useMapUI();
 * const { places, isLoading } = useMapData();
 *
 * // Actions only (for control components)
 * const actions = useMapActions();
 * actions.setCategories(['restaurant']);
 * actions.selectPlace(place);
 *
 * // Raw machine access (for advanced use cases)
 * const [state, send] = useMapMachine();
 * send({ type: 'SELECT_PLACE', place });
 */
