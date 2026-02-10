import { assign, createMachine, fromPromise } from "xstate";
import { searchMapPlaces } from "@/app/(authenticated)/map/actions";
import type {
  GeocodedLocation,
  ItemType,
  MapBounds,
  MapDataItem,
  MapSearchParams,
  MapSearchResults,
  PlaceResult as Place,
  SemanticPlaceResult,
  UserLocation,
  VisitStatus,
} from "../types";

// Context (state data)
interface MapContext {
  // Dependencies
  userId: string;

  // Core map state
  hasInitialized: boolean;
  currentZoom: number;
  isDarkMode: boolean;
  isDesktop: boolean;
  bounds?: MapBounds;
  userLocation?: UserLocation;

  // UI state
  selectedPlace: Place | null;
  error: string | null;

  // Filter state
  selectedItemTypes: ItemType[];
  searchQuery: string;
  isSemanticSearch: boolean; // Whether current search is semantic vs filter-based
  globalSearch: boolean; // When true, semantic search ignores viewport bounds
  minRating: number | undefined;
  visitStatuses: VisitStatus[];
  tierListIds: string[];

  // Data state
  places: Place[];
  mapItems: MapDataItem[];
  placesError: string | null;

  // Semantic search results (now handled by unified service)
  semanticResults: SemanticPlaceResult[];
  semanticError: string | null;

  // Geocode navigation target (set when address search resolves)
  geocodeTarget?: GeocodedLocation;
}

// Events (actions that can trigger state changes)
type MapEvent =
  | { type: "INITIALIZE" }
  | { type: "SET_USER_LOCATION"; location: UserLocation }
  | { type: "SET_ZOOM"; zoom: number }
  | { type: "TOGGLE_DARK_MODE" }
  | { type: "SET_DARK_MODE"; isDark: boolean }
  | { type: "SET_DESKTOP"; isDesktop: boolean }
  | { type: "SET_BOUNDS"; bounds: MapBounds }
  | { type: "SELECT_PLACE"; place: Place }
  | { type: "CLOSE_DRAWER" }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "CLEAR_ERROR" }
  | { type: "SET_ITEM_TYPES"; itemTypes: ItemType[] }
  | { type: "TOGGLE_ITEM_TYPE"; itemType: ItemType }
  | { type: "SET_SEARCH_QUERY"; query: string }
  | { type: "PERFORM_SEMANTIC_SEARCH"; query: string }
  | { type: "SET_MIN_RATING"; rating: number | undefined }
  | { type: "SET_VISIT_STATUSES"; statuses: VisitStatus[] }
  | { type: "SET_TIER_LIST_IDS"; tierListIds: string[] }
  | { type: "SET_GLOBAL_SEARCH"; globalSearch: boolean }
  | { type: "CLEAR_FILTERS" }
  | { type: "REFRESH_PLACES" }
  | { type: "UPDATE_SELECTED_PLACE"; place: Place }
  | { type: "CLEAR_GEOCODE_TARGET" }
  | { type: "MAP_CLICK" }
  | { type: "ENTER_PIN_PLACEMENT" }
  | { type: "EXIT_PIN_PLACEMENT" };

// Services (side effects)
const fetchPlacesService = fromPromise(
  async ({
    input,
  }: {
    input: {
      bounds: MapBounds;
      itemTypes: ItemType[];
      minRating: number | undefined;
      visitStatuses: VisitStatus[];
      tierListIds: string[];
      searchQuery: string;
      isSemanticSearch: boolean;
      globalSearch: boolean;
      userId: string;
    };
  }) => {
    const {
      bounds,
      itemTypes,
      minRating,
      visitStatuses,
      tierListIds,
      searchQuery,
      isSemanticSearch,
      globalSearch,
      userId,
    } = input;

    try {
      const searchParams: MapSearchParams = {
        bounds,
        itemTypes,
        minRating,
        visitStatuses,
        tierListIds: tierListIds.length > 0 ? tierListIds : undefined,
        semanticQuery: isSemanticSearch ? searchQuery : undefined,
        globalSearch: isSemanticSearch ? globalSearch : false,
        limit: 500,
      };

      const result: MapSearchResults = await searchMapPlaces(searchParams);

      // Transform results to match XState expected format (preserve all server fields)
      const places: Place[] = result.places;

      return {
        places,
        mapItems: result.mapItems,
        semanticResults: result.semanticResults,
        isSemanticSearch: result.isSemanticSearch,
        geocodeResult: result.geocodeResult,
      };
    } catch (error) {
      console.error("Error fetching places:", error);
      throw error;
    }
  },
);

// Guards (conditions for transitions)
const guards = {
  hasSelectedPlace: ({ context }: { context: MapContext }) =>
    context.selectedPlace !== null,

  isPlaceSelected: ({
    context,
    event,
  }: {
    context: MapContext;
    event: MapEvent;
  }) => {
    if (event.type === "UPDATE_SELECTED_PLACE" && context.selectedPlace) {
      return context.selectedPlace.id === event.place.id;
    }
    return false;
  },

  canFetchPlaces: ({
    context,
    event,
  }: {
    context: MapContext;
    event: MapEvent;
  }) => {
    // If this is a SET_BOUNDS event, check the bounds from the event
    const boundsToCheck =
      event.type === "SET_BOUNDS" ? event.bounds : context.bounds;
    return boundsToCheck !== undefined;
  },

  // Skip refetch on bounds change when global semantic search is active
  shouldFetchOnBoundsChange: ({
    context,
  }: {
    context: MapContext;
    event: MapEvent;
  }) => {
    // If global semantic search is active, bounds changes don't need a refetch
    if (context.isSemanticSearch && context.globalSearch) return false;
    return true;
  },

  hasError: ({ context }: { context: MapContext }) => context.error !== null,
};

// Actions (state updates)
const actions = {
  setInitialized: assign({
    hasInitialized: true,
  }),

  setUserLocation: assign({
    userLocation: ({ event }) =>
      event.type === "SET_USER_LOCATION" ? event.location : undefined,
  }),

  setZoom: assign({
    currentZoom: ({ event }) => (event.type === "SET_ZOOM" ? event.zoom : 12),
  }),

  toggleDarkMode: assign({
    isDarkMode: ({ context }) => !context.isDarkMode,
  }),

  setDarkMode: assign({
    isDarkMode: ({ event }) =>
      event.type === "SET_DARK_MODE" ? event.isDark : false,
  }),

  setDesktop: assign({
    isDesktop: ({ event }) =>
      event.type === "SET_DESKTOP" ? event.isDesktop : false,
  }),

  setBounds: assign({
    bounds: ({ event }) =>
      event.type === "SET_BOUNDS" ? event.bounds : undefined,
  }),

  selectPlace: assign({
    selectedPlace: ({ event }) => {
      if (event.type === "SELECT_PLACE") {
        return event.place;
      }
      return null;
    },
  }),

  clearSelection: assign({
    selectedPlace: null,
  }),

  setError: assign({
    error: ({ event }) => (event.type === "SET_ERROR" ? event.error : null),
  }),

  clearError: assign({
    error: null,
  }),

  setItemTypes: assign({
    selectedItemTypes: ({ event }) =>
      event.type === "SET_ITEM_TYPES" ? event.itemTypes : [],
    // Preserve semantic mode if there's an active search query
    isSemanticSearch: ({ context }) =>
      context.isSemanticSearch && context.searchQuery.trim().length > 0,
  }),

  toggleItemType: assign({
    selectedItemTypes: ({ context, event }) => {
      if (event.type === "TOGGLE_ITEM_TYPE") {
        const current = context.selectedItemTypes;
        const itemType = event.itemType;

        if (current.includes(itemType)) {
          return current.filter((t: ItemType) => t !== itemType);
        } else {
          return [...current, itemType];
        }
      }
      return context.selectedItemTypes;
    },
    // Preserve semantic mode if there's an active search query
    isSemanticSearch: ({ context }) =>
      context.isSemanticSearch && context.searchQuery.trim().length > 0,
  }),

  setSearchQuery: assign({
    searchQuery: ({ event }) =>
      event.type === "SET_SEARCH_QUERY" ? event.query : "",
  }),

  performSemanticSearch: assign({
    searchQuery: ({ event }) =>
      event.type === "PERFORM_SEMANTIC_SEARCH" ? event.query : "",
    isSemanticSearch: true,
    // Preserve selectedItemTypes — they narrow semantic results
  }),

  setMinRating: assign({
    minRating: ({ event }) =>
      event.type === "SET_MIN_RATING" ? event.rating : undefined,
  }),

  setVisitStatuses: assign({
    visitStatuses: ({ event }) =>
      event.type === "SET_VISIT_STATUSES" ? event.statuses : [],
  }),

  setTierListIds: assign({
    tierListIds: ({ event }) =>
      event.type === "SET_TIER_LIST_IDS" ? event.tierListIds : [],
  }),

  setGlobalSearch: assign({
    globalSearch: ({ event }) =>
      event.type === "SET_GLOBAL_SEARCH" ? event.globalSearch : true,
  }),

  clearFilters: assign({
    selectedItemTypes: [],
    searchQuery: "",
    isSemanticSearch: false,
    globalSearch: true,
    minRating: undefined,
    visitStatuses: [],
    tierListIds: [],
  }),

  setPlaces: assign({
    places: ({ event }) => {
      if (event.type === "xstate.done.actor.fetchPlaces") {
        return event.output.places;
      }
      return [];
    },
    mapItems: ({ event }) => {
      if (event.type === "xstate.done.actor.fetchPlaces") {
        return event.output.mapItems;
      }
      return [];
    },
    semanticResults: ({ event }) => {
      if (event.type === "xstate.done.actor.fetchPlaces") {
        return event.output.semanticResults || [];
      }
      return [];
    },
    // When the server returns a geocode result, store it so the map can fly there.
    // Clear semantic search mode — the bounded search will fill in nearby places.
    geocodeTarget: ({ event }) => {
      if (event.type === "xstate.done.actor.fetchPlaces") {
        return event.output.geocodeResult ?? undefined;
      }
      return undefined;
    },
    isSemanticSearch: ({ context, event }) => {
      if (
        event.type === "xstate.done.actor.fetchPlaces" &&
        event.output.geocodeResult
      ) {
        return false;
      }
      return context.isSemanticSearch;
    },
    globalSearch: ({ context, event }) => {
      if (
        event.type === "xstate.done.actor.fetchPlaces" &&
        event.output.geocodeResult
      ) {
        return false;
      }
      return context.globalSearch;
    },
    // Clear the search bar text when a geocode resolves — the user searched
    // for an address, the map flew there, and the bounded query will show
    // nearby places. Keeping stale address text would be confusing.
    searchQuery: ({ context, event }) => {
      if (
        event.type === "xstate.done.actor.fetchPlaces" &&
        event.output.geocodeResult
      ) {
        return "";
      }
      return context.searchQuery;
    },
    placesError: null,
    semanticError: null,
  }),

  setPlacesError: assign({
    placesError: ({ event }) => {
      if (event.type === "xstate.error.actor.fetchPlaces") {
        return event.error instanceof Error
          ? event.error.message
          : "Failed to fetch places";
      }
      return null;
    },
    semanticError: ({ event }) => {
      if (event.type === "xstate.error.actor.fetchPlaces") {
        return event.error instanceof Error
          ? event.error.message
          : "Failed to fetch places";
      }
      return null;
    },
  }),

  updateSelectedPlace: assign({
    selectedPlace: ({ context, event }) => {
      if (event.type === "UPDATE_SELECTED_PLACE" && context.selectedPlace) {
        if (context.selectedPlace.id === event.place.id) {
          return event.place;
        }
      }
      return context.selectedPlace;
    },
  }),

  clearGeocodeTarget: assign({
    geocodeTarget: undefined,
  }),

  clearSemanticResults: assign({
    semanticResults: [],
    semanticError: null,
  }),
};

// The state machine definition
export const mapMachine = createMachine(
  {
    id: "map",
    types: {} as {
      input: {
        userId: string;
      };
      context: MapContext;
      events: MapEvent;
    },

    initial: "uninitializedMap",

    context: ({ input }) => ({
      userId: input.userId,
      hasInitialized: false,
      currentZoom: 12,
      isDarkMode: false,
      isDesktop: false,
      bounds: undefined,
      userLocation: undefined,
      selectedPlace: null,
      error: null,
      selectedItemTypes: [],

      searchQuery: "",
      isSemanticSearch: false,
      globalSearch: true,
      minRating: undefined,
      visitStatuses: [],
      tierListIds: [],
      places: [],
      mapItems: [],
      placesError: null,
      semanticResults: [],
      semanticError: null,
      geocodeTarget: undefined,
    }),

    states: {
      // Map not yet initialized — accept filter events so URL-synced
      // params (from nuqs) are captured in context before INITIALIZE fires.
      uninitializedMap: {
        on: {
          INITIALIZE: {
            target: "idle",
            actions: "setInitialized",
          },
          SET_USER_LOCATION: {
            actions: "setUserLocation",
          },
          SET_DESKTOP: {
            actions: "setDesktop",
          },
          SET_BOUNDS: {
            actions: "setBounds",
          },
          SET_ITEM_TYPES: {
            actions: "setItemTypes",
          },
          TOGGLE_ITEM_TYPE: {
            actions: "toggleItemType",
          },
          SET_MIN_RATING: {
            actions: "setMinRating",
          },
          SET_VISIT_STATUSES: {
            actions: "setVisitStatuses",
          },
          SET_TIER_LIST_IDS: {
            actions: "setTierListIds",
          },
          SET_GLOBAL_SEARCH: {
            actions: "setGlobalSearch",
          },
          PERFORM_SEMANTIC_SEARCH: {
            actions: "performSemanticSearch",
          },
          SET_SEARCH_QUERY: {
            actions: "setSearchQuery",
          },
        },
      },

      // Map initialized and ready for interaction
      idle: {
        type: "parallel",

        states: {
          // Drawer sub-state
          drawer: {
            initial: "closed",
            states: {
              closed: {
                on: {
                  SELECT_PLACE: {
                    target: "open",
                    actions: "selectPlace",
                  },
                },
              },
              open: {
                on: {
                  CLOSE_DRAWER: {
                    target: "closed",
                    actions: "clearSelection",
                  },
                  MAP_CLICK: {
                    target: "closed",
                    actions: "clearSelection",
                  },
                  ENTER_PIN_PLACEMENT: {
                    target: "closed",
                    actions: "clearSelection",
                  },
                  SELECT_PLACE: {
                    actions: "selectPlace", // Stay open, just change selection
                  },
                  UPDATE_SELECTED_PLACE: {
                    guard: "isPlaceSelected",
                    actions: "updateSelectedPlace",
                  },
                },
              },
            },
          },

          // Data loading sub-state
          data: {
            initial: "idle",
            states: {
              idle: {
                on: {
                  REFRESH_PLACES: [
                    {
                      target: "loading",
                      guard: "canFetchPlaces",
                      actions: "clearError",
                    },
                    {
                      actions: assign({
                        error:
                          "Cannot fetch places: missing location or bounds",
                      }),
                    },
                  ],
                  SET_BOUNDS: [
                    {
                      target: "loading",
                      guard: ({ context, event }) => {
                        // Must have bounds and not be in global semantic mode
                        const boundsToCheck =
                          event.type === "SET_BOUNDS"
                            ? event.bounds
                            : context.bounds;
                        if (boundsToCheck === undefined) return false;
                        // Skip refetch when global semantic search is active
                        if (context.isSemanticSearch && context.globalSearch)
                          return false;
                        return true;
                      },
                      actions: ["setBounds", "clearError"],
                    },
                    {
                      actions: "setBounds",
                    },
                  ],
                  // User location updates context only — don't refetch.
                  // Bounds changes are the sole trigger for data fetches.
                  SET_USER_LOCATION: {
                    actions: "setUserLocation",
                  },
                  CLEAR_GEOCODE_TARGET: {
                    actions: "clearGeocodeTarget",
                  },
                  SET_ITEM_TYPES: [
                    {
                      target: "loading",
                      guard: "canFetchPlaces",
                      actions: ["setItemTypes", "clearError"],
                    },
                    {
                      actions: "setItemTypes",
                    },
                  ],
                  TOGGLE_ITEM_TYPE: [
                    {
                      target: "loading",
                      guard: "canFetchPlaces",
                      actions: ["toggleItemType", "clearError"],
                    },
                    {
                      actions: "toggleItemType",
                    },
                  ],

                  PERFORM_SEMANTIC_SEARCH: [
                    {
                      target: "loading",
                      guard: "canFetchPlaces",
                      actions: ["performSemanticSearch", "clearError"],
                    },
                    {
                      actions: "performSemanticSearch",
                    },
                  ],
                  SET_MIN_RATING: [
                    {
                      target: "loading",
                      guard: "canFetchPlaces",
                      actions: ["setMinRating", "clearError"],
                    },
                    {
                      actions: "setMinRating",
                    },
                  ],
                  SET_VISIT_STATUSES: [
                    {
                      target: "loading",
                      guard: "canFetchPlaces",
                      actions: ["setVisitStatuses", "clearError"],
                    },
                    {
                      actions: "setVisitStatuses",
                    },
                  ],
                  SET_TIER_LIST_IDS: [
                    {
                      target: "loading",
                      guard: "canFetchPlaces",
                      actions: ["setTierListIds", "clearError"],
                    },
                    {
                      actions: "setTierListIds",
                    },
                  ],
                  SET_GLOBAL_SEARCH: [
                    {
                      target: "loading",
                      guard: ({ context }) =>
                        context.bounds !== undefined &&
                        context.isSemanticSearch,
                      actions: ["setGlobalSearch", "clearError"],
                    },
                    {
                      actions: "setGlobalSearch",
                    },
                  ],
                },
              },
              loading: {
                invoke: {
                  src: "fetchPlaces",
                  id: "fetchPlaces",
                  input: ({ context }) => ({
                    bounds: context.bounds!,
                    itemTypes: context.selectedItemTypes,
                    minRating: context.minRating,
                    visitStatuses: context.visitStatuses,
                    tierListIds: context.tierListIds,
                    searchQuery: context.searchQuery,
                    isSemanticSearch: context.isSemanticSearch,
                    globalSearch: context.globalSearch,
                    userId: context.userId,
                  }),
                  onDone: {
                    target: "idle",
                    actions: "setPlaces",
                  },
                  onError: {
                    target: "idle",
                    actions: "setPlacesError",
                  },
                },
                on: {
                  // Bounds/filter changes during loading: cancel current fetch and
                  // restart with updated params. Uses reenter: true because XState v5
                  // self-transitions are internal by default (no exit/re-enter),
                  // so without it the invoke would NOT be cancelled and restarted.
                  SET_BOUNDS: [
                    {
                      target: "loading",
                      reenter: true,
                      guard: ({ context }) =>
                        !(context.isSemanticSearch && context.globalSearch),
                      actions: "setBounds",
                    },
                    {
                      // Global semantic search: just store bounds, don't restart fetch
                      actions: "setBounds",
                    },
                  ],
                  SET_ITEM_TYPES: {
                    target: "loading",
                    reenter: true,
                    actions: "setItemTypes",
                  },
                  TOGGLE_ITEM_TYPE: {
                    target: "loading",
                    reenter: true,
                    actions: "toggleItemType",
                  },
                  PERFORM_SEMANTIC_SEARCH: {
                    target: "loading",
                    reenter: true,
                    actions: "performSemanticSearch",
                  },
                  SET_MIN_RATING: {
                    target: "loading",
                    reenter: true,
                    actions: "setMinRating",
                  },
                  SET_VISIT_STATUSES: {
                    target: "loading",
                    reenter: true,
                    actions: "setVisitStatuses",
                  },
                  SET_TIER_LIST_IDS: {
                    target: "loading",
                    reenter: true,
                    actions: "setTierListIds",
                  },
                  SET_GLOBAL_SEARCH: {
                    target: "loading",
                    reenter: true,
                    actions: "setGlobalSearch",
                  },
                  CLEAR_FILTERS: {
                    target: "loading",
                    reenter: true,
                    actions: "clearFilters",
                  },
                  // Non-fetch context updates (search query text without triggering fetch)
                  SET_SEARCH_QUERY: {
                    actions: "setSearchQuery",
                  },
                },
              },
            },
          },

          // Error sub-state
          error: {
            initial: "none",
            states: {
              none: {
                on: {
                  SET_ERROR: [
                    {
                      target: "hasError",
                      guard: ({ event }) =>
                        event.type === "SET_ERROR" && event.error !== null,
                      actions: "setError",
                    },
                  ],
                },
              },
              hasError: {
                on: {
                  CLEAR_ERROR: {
                    target: "none",
                    actions: "clearError",
                  },
                  SET_ERROR: {
                    target: "none",
                    guard: ({ event }) =>
                      event.type === "SET_ERROR" && event.error === null,
                    actions: "clearError",
                  },
                },
              },
            },
          },

          // Pin placement sub-state (Uber-style "add place" flow)
          pinPlacement: {
            initial: "inactive",
            states: {
              inactive: {
                on: {
                  ENTER_PIN_PLACEMENT: {
                    target: "placing",
                    actions: ["clearSelection"],
                  },
                },
              },
              placing: {
                on: {
                  EXIT_PIN_PLACEMENT: {
                    target: "inactive",
                  },
                  // Absorb map clicks while placing — don't select places
                  MAP_CLICK: {},
                },
              },
            },
          },
        },

        // Global events that work across all sub-states
        on: {
          SET_ZOOM: { actions: "setZoom" },
          TOGGLE_DARK_MODE: { actions: "toggleDarkMode" },
          SET_DARK_MODE: { actions: "setDarkMode" },
          SET_DESKTOP: { actions: "setDesktop" },
          SET_ITEM_TYPES: { actions: "setItemTypes" },
          TOGGLE_ITEM_TYPE: { actions: "toggleItemType" },
          SET_SEARCH_QUERY: { actions: "setSearchQuery" },
          PERFORM_SEMANTIC_SEARCH: { actions: "performSemanticSearch" },
          SET_GLOBAL_SEARCH: { actions: "setGlobalSearch" },
          SET_MIN_RATING: { actions: "setMinRating" },
          SET_VISIT_STATUSES: { actions: "setVisitStatuses" },
          SET_TIER_LIST_IDS: { actions: "setTierListIds" },
          CLEAR_FILTERS: { actions: "clearFilters" },
          SET_ERROR: { actions: "setError" },
          CLEAR_ERROR: { actions: "clearError" },
        },
      },
    },
  },
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- XState v5 action typing issue with assign()
    actions: actions as any,
    guards,
    actors: {
      fetchPlaces: fetchPlacesService,
    },
  },
);

// Export types for use in components
export type { MapContext, MapEvent, Place, MapBounds, UserLocation };
