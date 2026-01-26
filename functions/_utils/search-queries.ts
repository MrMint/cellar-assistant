/**
 * Typed GraphQL queries for search operations
 *
 * These queries use gql.tada for type safety and replace the raw string queries
 * that were previously used with the Nhost GraphQL client.
 */

import { graphql } from "@cellar-assistant/shared/gql/graphql";

// =============================================================================
// Place Data Queries
// =============================================================================

/**
 * Get place context data for recipe extraction
 */
export const GET_PLACE_CONTEXT_QUERY = graphql(`
  query GetPlaceContext($placeId: uuid!) {
    places_by_pk(id: $placeId) {
      name
      primary_category
      locality
      region
      street_address
    }
  }
`);

// =============================================================================
// Text Search Queries
// =============================================================================

/**
 * Text search for specific wine items using vector similarity
 */
export const SEARCH_WINES_QUERY = graphql(`
  query SearchWines($text: String!, $limit: Int!, $maxDistance: float8!) {
    text_search(
      args: { text: $text }
      where: { 
        distance: { _lte: $maxDistance }
        wine_id: { _is_null: false }
      }
      order_by: { distance: asc }
      limit: $limit
    ) {
      distance
      wine {
        id
        name
        vintage
        style
        variety
        country
        alcohol_content_percentage
        brands {
          brand {
            name
          }
        }
      }
    }
  }
`);

/**
 * Text search for specific beer items using vector similarity
 */
export const SEARCH_BEERS_QUERY = graphql(`
  query SearchBeers($text: String!, $limit: Int!, $maxDistance: float8!) {
    text_search(
      args: { text: $text }
      where: { 
        distance: { _lte: $maxDistance }
        beer_id: { _is_null: false }
      }
      order_by: { distance: asc }
      limit: $limit
    ) {
      distance
      beer {
        id
        name
        style
        country
        alcohol_content_percentage
        brands {
          brand {
            name
          }
        }
      }
    }
  }
`);

/**
 * Text search for specific spirit items using vector similarity
 */
export const SEARCH_SPIRITS_QUERY = graphql(`
  query SearchSpirits($text: String!, $limit: Int!, $maxDistance: float8!) {
    text_search(
      args: { text: $text }
      where: { 
        distance: { _lte: $maxDistance }
        spirit_id: { _is_null: false }
      }
      order_by: { distance: asc }
      limit: $limit
    ) {
      distance
      spirit {
        id
        name
        type
        country
        alcohol_content_percentage
        brands {
          brand {
            name
          }
        }
      }
    }
  }
`);

/**
 * Text search for specific coffee items using vector similarity
 */
export const SEARCH_COFFEES_QUERY = graphql(`
  query SearchCoffees($text: String!, $limit: Int!, $maxDistance: float8!) {
    text_search(
      args: { text: $text }
      where: {
        distance: { _lte: $maxDistance }
        coffee_id: { _is_null: false }
      }
      order_by: { distance: asc }
      limit: $limit
    ) {
      distance
      coffee {
        id
        name
        roast_level
        process
        species
        country
        brands {
          brand {
            name
          }
        }
      }
    }
  }
`);

/**
 * Text search for specific sake items using vector similarity
 */
export const SEARCH_SAKES_QUERY = graphql(`
  query SearchSakes($text: String!, $limit: Int!, $maxDistance: float8!) {
    text_search(
      args: { text: $text }
      where: {
        distance: { _lte: $maxDistance }
        sake_id: { _is_null: false }
      }
      order_by: { distance: asc }
      limit: $limit
    ) {
      distance
      sake {
        id
        name
        category
        type
        region
        vintage
        country
        alcohol_content_percentage
        polish_grade
        rice_variety
        serving_temperature
        brands {
          brand {
            name
          }
        }
      }
    }
  }
`);

// =============================================================================
// Fallback Text-Based Search Queries
// =============================================================================

/**
 * Fallback text-based search for wines using ILIKE
 */
export const SEARCH_WINES_TEXT_QUERY = graphql(`
  query SearchWinesText($searchTerm: String!, $limit: Int!) {
    wines(
      where: {
        _or: [
          { name: { _ilike: $searchTerm } }
          { brands: { brand: { name: { _ilike: $searchTerm } } } }
        ]
      }
      order_by: [{ name: asc }]
      limit: $limit
    ) {
      id
      name
      vintage
      style
      variety
      country
      alcohol_content_percentage
      brands {
        brand {
          name
        }
      }
    }
  }
`);

/**
 * Fallback text-based search for beers using ILIKE
 */
export const SEARCH_BEERS_TEXT_QUERY = graphql(`
  query SearchBeersText($searchTerm: String!, $limit: Int!) {
    beers(
      where: {
        _or: [
          { name: { _ilike: $searchTerm } }
          { brands: { brand: { name: { _ilike: $searchTerm } } } }
        ]
      }
      order_by: [{ name: asc }]
      limit: $limit
    ) {
      id
      name
      style
      country
      alcohol_content_percentage
      brands {
        brand {
          name
        }
      }
    }
  }
`);

/**
 * Fallback text-based search for spirits using ILIKE
 */
export const SEARCH_SPIRITS_TEXT_QUERY = graphql(`
  query SearchSpiritsText($searchTerm: String!, $limit: Int!) {
    spirits(
      where: {
        _or: [
          { name: { _ilike: $searchTerm } }
          { brands: { brand: { name: { _ilike: $searchTerm } } } }
        ]
      }
      order_by: [{ name: asc }]
      limit: $limit
    ) {
      id
      name
      type
      country
      alcohol_content_percentage
      brands {
        brand {
          name
        }
      }
    }
  }
`);

/**
 * Fallback text-based search for coffees using ILIKE
 */
export const SEARCH_COFFEES_TEXT_QUERY = graphql(`
  query SearchCoffeesText($searchTerm: String!, $limit: Int!) {
    coffees(
      where: {
        _or: [
          { name: { _ilike: $searchTerm } }
          { brands: { brand: { name: { _ilike: $searchTerm } } } }
        ]
      }
      order_by: [{ name: asc }]
      limit: $limit
    ) {
      id
      name
      roast_level
      process
      species
      country
      brands {
        brand {
          name
        }
      }
    }
  }
`);

/**
 * Fallback text-based search for sakes using ILIKE
 */
export const SEARCH_SAKES_TEXT_QUERY = graphql(`
  query SearchSakesText($searchTerm: String!, $limit: Int!) {
    sakes(
      where: {
        _or: [
          { name: { _ilike: $searchTerm } }
          { brands: { brand: { name: { _ilike: $searchTerm } } } }
        ]
      }
      order_by: [{ name: asc }]
      limit: $limit
    ) {
      id
      name
      category
      type
      region
      vintage
      country
      alcohol_content_percentage
      polish_grade
      rice_variety
      serving_temperature
      brands {
        brand {
          name
        }
      }
    }
  }
`);

// =============================================================================
// Generic Items Search
// =============================================================================

/**
 * Search for generic items using text matching
 */
export const SEARCH_GENERIC_ITEMS_QUERY = graphql(`
  query SearchGenericItems($searchTerm: String!, $limit: Int!) {
    generic_items(
      where: {
        _or: [
          { name: { _ilike: $searchTerm } }
          { category: { _ilike: $searchTerm } }
        ]
      }
      order_by: [{ name: asc }]
      limit: $limit
    ) {
      id
      name
      category
      subcategory
      description
      item_type
      is_substitutable
      created_at
    }
  }
`);

// =============================================================================
// Query Type Mapping
// =============================================================================

/**
 * Map item types to their corresponding vector search queries
 */
export const VECTOR_SEARCH_QUERIES = {
  wine: SEARCH_WINES_QUERY,
  beer: SEARCH_BEERS_QUERY,
  spirit: SEARCH_SPIRITS_QUERY,
  coffee: SEARCH_COFFEES_QUERY,
  sake: SEARCH_SAKES_QUERY,
} as const;

/**
 * Map item types to their corresponding text search queries
 */
export const TEXT_SEARCH_QUERIES = {
  wine: SEARCH_WINES_TEXT_QUERY,
  beer: SEARCH_BEERS_TEXT_QUERY,
  spirit: SEARCH_SPIRITS_TEXT_QUERY,
  coffee: SEARCH_COFFEES_TEXT_QUERY,
  sake: SEARCH_SAKES_TEXT_QUERY,
} as const;

/**
 * Type for supported item types in search
 */
export type SearchableItemType = keyof typeof VECTOR_SEARCH_QUERIES;
