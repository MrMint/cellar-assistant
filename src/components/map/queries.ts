import { graphql } from "@cellar-assistant/shared/gql";
import {
  PlaceCoreFragment,
  PlaceWithMenuFragment,
} from "../shared/fragments/place-fragments";

export const SEARCH_NEARBY_PLACES = graphql(
  `
  query SearchNearbyPlaces(
    $location: geography!
    $radius: Int = 5000
    $categories: [String!]
    $limit: Int = 100
  ) {
    search_cached_places_nearby(
      args: {
        user_location: $location
        radius_meters: $radius
        category_filter: $categories
        limit_count: $limit
      }
    ) {
      ...PlaceCore
      distance_meters: calculate_distance(args: { user_location: $location })
      user_place_interactions {
        is_favorite
        is_visited
        want_to_visit
        rating
        notes
        last_visited_at
      }
    }
  }
  `,
  [PlaceCoreFragment],
);

export const GET_PLACE_DETAILS = graphql(
  `
  query GetPlaceDetails($id: uuid!) {
    places_by_pk(id: $id) {
      ...PlaceWithMenu
    }
  }
  `,
  [PlaceWithMenuFragment],
);

export const TOGGLE_FAVORITE_PLACE = graphql(`
  mutation ToggleFavoritePlace(
    $userId: uuid!
    $placeId: uuid!
    $isFavorite: Boolean!
  ) {
    insert_user_place_interactions_one(
      object: {
        user_id: $userId
        place_id: $placeId
        is_favorite: $isFavorite
      }
      on_conflict: {
        constraint: unique_user_place
        update_columns: [is_favorite, updated_at]
      }
    ) {
      id
      is_favorite
    }
  }
`);

export const MARK_PLACE_VISITED = graphql(`
  mutation MarkPlaceVisited(
    $userId: uuid!
    $placeId: uuid!
    $isVisited: Boolean!
    $visitedAt: timestamptz
  ) {
    insert_user_place_interactions_one(
      object: {
        user_id: $userId
        place_id: $placeId
        is_visited: $isVisited
        last_visited_at: $visitedAt
        visit_count: 1
      }
      on_conflict: {
        constraint: unique_user_place
        update_columns: [
          is_visited, 
          last_visited_at, 
          visit_count,
          updated_at
        ]
      }
    ) {
      id
      is_visited
      last_visited_at
      visit_count
    }
  }
`);

export const ADD_MENU_ITEM_TO_CELLAR = graphql(`
  mutation AddMenuItemToCellar(
    $menuItemId: uuid!
    $userId: uuid!
    $cellarId: uuid!
  ) {
    addMenuItemToCellar(
      menuItemId: $menuItemId
      userId: $userId
      cellarId: $cellarId
    ) {
      success
      cellarItemId
      itemId
      itemType
    }
  }
`);

export const SUBSCRIBE_PLACE_UPDATES = graphql(
  `
  subscription SubscribePlaceUpdates($placeId: uuid!) {
    places_by_pk(id: $placeId) {
      ...PlaceCore
      rating
      review_count
      updated_at
      place_menus(where: { is_current: { _eq: true } }) {
        id
        menu_data
        updated_at
        place_menu_items_aggregate {
          aggregate {
            count
          }
        }
      }
    }
  }
  `,
  [PlaceCoreFragment],
);

export const SEMANTIC_PLACE_SEARCH = graphql(`
  mutation SemanticPlaceSearch(
    $query: String!
    $bounds: JSONObject!
    $maxDistance: Float
    $limit: Int
  ) {
    semanticPlaceSearch(
      input: {
        query: $query
        bounds: $bounds
        maxDistance: $maxDistance
        limit: $limit
      }
    ) {
      success
      places
    }
  }
`);
