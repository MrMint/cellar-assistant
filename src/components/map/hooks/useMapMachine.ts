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
  SocialFilter,
  UserLocation,
  VisitStatus,
} from "../types";

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
  return useSelector(actorRef, (state) => ({
    hasInitialized: state.context.hasInitialized,
    currentZoom: state.context.currentZoom,
    isDarkMode: state.context.isDarkMode,
    isDesktop: state.context.isDesktop,
    userLocation: state.context.userLocation,
    bounds: state.context.bounds,
    isInitialized: state.matches("idle"),
  }));
}

// UI state selectors
export function useMapUI() {
  const actorRef = useMapMachineActor();
  return useSelector(actorRef, (state) => ({
    isDrawerOpen: state.matches({ idle: { drawer: "open" } }),
    selectedPlace: state.context.selectedPlace,
    error: state.context.error,
    hasError: state.matches({ idle: { error: "hasError" } }),
  }));
}

// Filter state selectors
export function useMapFilters() {
  const actorRef = useMapMachineActor();
  return useSelector(actorRef, (state) => ({
    selectedItemTypes: state.context.selectedItemTypes,
    searchQuery: state.context.searchQuery,
    isSemanticSearch: state.context.isSemanticSearch,
    minRating: state.context.minRating,
    visitStatuses: state.context.visitStatuses,
    socialFilter: state.context.socialFilter,
  }));
}

// Data state selectors
export function useMapData() {
  const actorRef = useMapMachineActor();
  return useSelector(actorRef, (state) => ({
    places: state.context.places,
    mapItems: state.context.mapItems,
    isLoading: state.matches({ idle: { data: "loading" } }),
    placesError: state.context.placesError,
  }));
}

// Computed selectors
export function useFilteredPlaces() {
  const actorRef = useMapMachineActor();
  return useSelector(actorRef, (state) => {
    const { places, searchQuery, minRating, visitStatuses } = state.context;

    return places
      .filter((place) => {
        // Search query filter
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          const searchText = [
            place.name,
            place.primary_category,
            ...place.categories,
          ]
            .join(" ")
            .toLowerCase();

          if (!searchText.includes(query)) {
            return false;
          }
        }

        // Rating filter
        if (minRating !== undefined && place.rating !== undefined) {
          if (place.rating < minRating) {
            return false;
          }
        }

        // Visit status filter
        if (visitStatuses.length > 0) {
          const hasVisited =
            place.user_place_interactions?.some(
              (interaction: { is_visited: boolean }) => interaction.is_visited,
            ) || false;

          const isNew = !hasVisited;

          const matchesFilter = visitStatuses.some((status) => {
            if (status === "unvisited" && isNew) return true;
            if (status === "visited" && hasVisited) return true;
            return false;
          });

          if (!matchesFilter) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        // Sort by distance by default if available
        const aDistance = a.location?.coordinates ? 0 : Infinity; // Simplified - would calculate actual distance
        const bDistance = b.location?.coordinates ? 0 : Infinity;
        return aDistance - bDistance;
      });
  });
}

export function useMapActions() {
  const [, send] = useMapMachine();

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
      setSocialFilter: (socialFilter: SocialFilter) =>
        send({ type: "SET_SOCIAL_FILTER", socialFilter }),
      clearFilters: () => send({ type: "CLEAR_FILTERS" }),

      // Data actions
      refreshPlaces: () => send({ type: "REFRESH_PLACES" }),
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
  const filteredPlaces = useFilteredPlaces();
  const actions = useMapActions();

  return {
    // State slices
    core,
    ui,
    filters,
    data,

    // Computed values
    filteredPlaces,

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
        filters.visitStatuses.length > 0 ||
        filters.socialFilter === true
      );
    },

    getFilterState: () => ({
      selectedItemTypes: filters.selectedItemTypes,
      minRating: filters.minRating,
      searchQuery: filters.searchQuery,
      minItemCount: 0, // Could be added later
    }),

    // State matching helpers
    isInitialized: () => state.matches("idle"),
    isDrawerOpen: () => state.matches({ idle: { drawer: "open" } }),
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
 * const filteredPlaces = useFilteredPlaces();
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
