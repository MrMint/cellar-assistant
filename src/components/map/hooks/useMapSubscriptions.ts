"use client";

import { ITEM_TYPES } from "@cellar-assistant/shared";
import { useEffect } from "react";
import { useSubscription } from "urql";

// Lowercase version for GraphQL queries (legacy format)
const ITEM_TYPES_LOWERCASE = ITEM_TYPES.map((t) => t.toLowerCase());

// Subscription for real-time place updates (new places cached, menu updates, etc.)
const PLACES_SUBSCRIPTION = `
  subscription PlacesUpdated {
    places(order_by: { updated_at: desc }, limit: 10) {
      id
      overture_id
      name
      primary_category
      location
      last_accessed_at
      access_count
      updated_at
    }
  }
`;

// Subscription for user's place interactions (favorites, visits)
const USER_PLACE_INTERACTIONS_SUBSCRIPTION = `
  subscription UserPlaceInteractions($userId: uuid!) {
    user_place_interactions(
      where: { user_id: { _eq: $userId } }
      order_by: { updated_at: desc }
    ) {
      id
      place_id
      is_favorite
      is_visited
      visit_count
      updated_at
      place {
        id
        overture_id
        name
        primary_category
        location
      }
    }
  }
`;

// Subscription for new menu discoveries
const MENU_DISCOVERIES_SUBSCRIPTION = `
  subscription MenuDiscoveries($userId: uuid!) {
    place_menu_items(
      where: {
        _and: [
          { detected_item_type: { _in: ${JSON.stringify(ITEM_TYPES_LOWERCASE)} } }
          { place: { user_place_interactions: { user_id: { _eq: $userId } } } }
        ]
      }
      order_by: { created_at: desc }
      limit: 5
    ) {
      id
      menu_item_name
      detected_item_type
      confidence_score
      created_at
      place {
        id
        name
        primary_category
      }
    }
  }
`;

// Subscription for pending match suggestions
const MATCH_SUGGESTIONS_SUBSCRIPTION = `
  subscription MatchSuggestions($userId: uuid!) {
    item_match_suggestions(
      where: {
        _and: [
          { place_menu_item: { place: { user_place_interactions: { user_id: { _eq: $userId } } } } }
          { accepted: { _is_null: true } }
          { rejected: { _is_null: true } }
        ]
      }
      order_by: { created_at: desc }
      limit: 3
    ) {
      id
      confidence_score
      created_at
      place_menu_item {
        id
        menu_item_name
        place {
          id
          name
        }
      }
    }
  }
`;

export interface MapSubscriptionData {
  places: Array<{
    id: string;
    overture_id: string;
    name: string;
    primary_category: string;
    location: { type: string; coordinates: [number, number] };
    last_accessed_at: string;
    access_count: number;
    updated_at: string;
  }>;
  userInteractions: Array<{
    id: string;
    place_id: string;
    is_favorite: boolean;
    is_visited: boolean;
    visit_count: number;
    updated_at: string;
    place: {
      id: string;
      overture_id: string;
      name: string;
      primary_category: string;
      location: { type: string; coordinates: [number, number] };
    };
  }>;
  menuDiscoveries: Array<{
    id: string;
    menu_item_name: string;
    detected_item_type: string;
    confidence_score: number;
    created_at: string;
    place: {
      id: string;
      name: string;
      primary_category: string;
    };
  }>;
  pendingMatches: Array<{
    id: string;
    confidence_score: number;
    created_at: string;
    place_menu_item: {
      id: string;
      menu_item_name: string;
      place: {
        id: string;
        name: string;
      };
    };
  }>;
}

export interface MapSubscriptionCallbacks {
  userId: string;
  onPlaceUpdate?: (places: MapSubscriptionData["places"]) => void;
  onUserInteractionUpdate?: (
    interactions: MapSubscriptionData["userInteractions"],
  ) => void;
  onMenuDiscovery?: (
    discoveries: MapSubscriptionData["menuDiscoveries"],
  ) => void;
  onMatchSuggestion?: (matches: MapSubscriptionData["pendingMatches"]) => void;
}

export function useMapSubscriptions(callbacks: MapSubscriptionCallbacks) {
  const { userId } = callbacks;

  // Subscribe to places updates
  const [placesResult] = useSubscription({
    query: PLACES_SUBSCRIPTION,
    pause: !userId,
  });

  // Subscribe to user interactions
  const [userInteractionsResult] = useSubscription({
    query: USER_PLACE_INTERACTIONS_SUBSCRIPTION,
    variables: { userId },
    pause: !userId,
  });

  // Subscribe to menu discoveries
  const [menuDiscoveriesResult] = useSubscription({
    query: MENU_DISCOVERIES_SUBSCRIPTION,
    variables: { userId },
    pause: !userId,
  });

  // Subscribe to match suggestions
  const [matchSuggestionsResult] = useSubscription({
    query: MATCH_SUGGESTIONS_SUBSCRIPTION,
    variables: { userId },
    pause: !userId,
  });

  // Handle place updates
  useEffect(() => {
    if (placesResult.data?.places && callbacks.onPlaceUpdate) {
      callbacks.onPlaceUpdate(placesResult.data.places);
    }
  }, [placesResult.data?.places, callbacks]);

  // Handle user interaction updates
  useEffect(() => {
    if (
      userInteractionsResult.data?.user_place_interactions &&
      callbacks.onUserInteractionUpdate
    ) {
      callbacks.onUserInteractionUpdate(
        userInteractionsResult.data.user_place_interactions,
      );
    }
  }, [userInteractionsResult.data?.user_place_interactions, callbacks]);

  // Handle menu discoveries
  useEffect(() => {
    if (
      menuDiscoveriesResult.data?.place_menu_items &&
      callbacks.onMenuDiscovery
    ) {
      callbacks.onMenuDiscovery(menuDiscoveriesResult.data.place_menu_items);
    }
  }, [menuDiscoveriesResult.data?.place_menu_items, callbacks]);

  // Handle match suggestions
  useEffect(() => {
    if (
      matchSuggestionsResult.data?.item_match_suggestions &&
      callbacks.onMatchSuggestion
    ) {
      callbacks.onMatchSuggestion(
        matchSuggestionsResult.data.item_match_suggestions,
      );
    }
  }, [matchSuggestionsResult.data?.item_match_suggestions, callbacks]);

  return {
    subscriptions: {
      places: placesResult,
      userInteractions: userInteractionsResult,
      menuDiscoveries: menuDiscoveriesResult,
      matchSuggestions: matchSuggestionsResult,
    },
    isConnected:
      !placesResult.error &&
      !userInteractionsResult.error &&
      !menuDiscoveriesResult.error &&
      !matchSuggestionsResult.error,
  };
}
