import { graphql } from "@cellar-assistant/shared";

/**
 * Core tea-specific fields
 * Includes tea category, form, caffeine level, processing, etc.
 * Note: Brand information accessed via brands relationship
 */
export const TeaCoreFragment = graphql(`
  fragment TeaCore on teas @_unmask {
    id
    name
    created_by_id
    category
    form
    caffeine_level
    region
    country
    cultivar
    oxidation_level
    processing
    harvest_year
    ingredients
    steeping_temperature
    steeping_time
    flavor_profile
    is_organic
    is_fair_trade
    description
    barcode_code
  }
`);

/**
 * Tea images for display
 * Extends base ItemImages pattern for teas table
 */
export const TeaImagesFragment = graphql(`
  fragment TeaImages on teas @_unmask {
    item_images(limit: 1) {
      file_id
      placeholder
    }
  }
`);

/**
 * User-specific tea data (favorites)
 * Requires $userId variable to be provided
 */
export const TeaUserDataFragment = graphql(`
  fragment TeaUserData on teas @_unmask {
    item_favorites(where: { user_id: { _eq: $userId } }) {
      id
    }
    item_favorites_aggregate {
      aggregate {
        count
      }
    }
  }
`);

/**
 * Tea reviews with user information
 * Limited to recent reviews for display
 */
export const TeaReviewsFragment = graphql(`
  fragment TeaReviews on teas @_unmask {
    reviews(limit: 10, order_by: { created_at: desc }) {
      id
      user {
        avatarUrl
        displayName
      }
      score
      text
      createdAt: created_at
    }
  }
`);

/**
 * Tea cellars where this tea is stored
 * Includes cellar ownership information
 */
export const TeaCellarsFragment = graphql(`
  fragment TeaCellars on teas @_unmask {
    cellar_items(
      where: { empty_at: { _is_null: true } }
      distinct_on: cellar_id
    ) {
      cellar {
        id
        name
        createdBy {
          id
          displayName
          avatarUrl
        }
        co_owners {
          user {
            id
            displayName
            avatarUrl
          }
        }
      }
    }
  }
`);

/**
 * Tea brands and recipe relationships
 * Includes associated brands and recipes using this tea
 */
export const TeaRelationshipsFragment = graphql(`
  fragment TeaRelationships on teas @_unmask {
    brands {
      id
      is_primary
      brand {
        id
        name
        logo_url
        brand_type
      }
    }
    recipe_ingredients {
      id
      recipe {
        id
        name
        type
        image_url
        difficulty_level
      }
      quantity
      unit
      is_optional
    }
  }
`);

/**
 * Full tea details combining all fragments
 * Use this for comprehensive tea detail views
 */
export const TeaDetailsFragment = graphql(
  `
  fragment TeaDetails on teas @_unmask {
    ...TeaCore
    ...TeaImages
    ...TeaUserData
    ...TeaReviews
    ...TeaCellars
    ...TeaRelationships
  }
`,
  [
    TeaCoreFragment,
    TeaImagesFragment,
    TeaUserDataFragment,
    TeaReviewsFragment,
    TeaCellarsFragment,
    TeaRelationshipsFragment,
  ],
);

/**
 * Query to get tea details for a specific item
 * Also includes user's cellars for potential actions
 */
export const GetTeaDetailsQuery = graphql(
  `
  query GetTeaDetails($itemId: uuid!, $userId: uuid!) {
    teas_by_pk(id: $itemId) {
      ...TeaDetails
    }
    cellars(where: { created_by_id: { _eq: $userId } }) {
      id
      name
    }
  }
`,
  [TeaDetailsFragment],
);

/**
 * Cellar-specific tea fragments for contextual item views
 */

/**
 * Cellar tea item data including cellar context
 * Includes ownership information and item-specific details
 */
export const CellarTeaItemFragment = graphql(`
  fragment CellarTeaItem on cellar_items @_unmask {
    id
    open_at
    empty_at
    percentage_remaining
    display_image {
      file_id
      placeholder
    }
    cellar {
      name
      created_by_id
      co_owners {
        user_id
      }
    }
  }
`);

/**
 * Tea data within cellar context
 * Reuses core tea fragments but focused on cellar item view
 */
export const CellarTeaDataFragment = graphql(
  `
  fragment CellarTeaData on cellar_items @_unmask {
    tea {
      ...TeaCore
      ...TeaUserData
      ...TeaReviews
      ...TeaRelationships
    }
  }
`,
  [
    TeaCoreFragment,
    TeaUserDataFragment,
    TeaReviewsFragment,
    TeaRelationshipsFragment,
  ],
);

/**
 * Check-ins data for cellar items
 * Includes user information for social features
 */
export const CellarTeaCheckInsFragment = graphql(`
  fragment CellarTeaCheckIns on cellar_items @_unmask {
    check_ins(order_by: { created_at: desc }) {
      id
      createdAt: created_at
      user {
        id
        displayName
        avatarUrl
      }
    }
  }
`);

/**
 * User data with friends for check-in functionality
 * Required for social features in cellar context
 */
export const UserWithFriendsFragment = graphql(`
  fragment TeaUserWithFriends on users @_unmask {
    id
    displayName
    avatarUrl
    friends(order_by: { friend: { displayName: desc } }) {
      friend {
        id
        displayName
        avatarUrl
      }
    }
  }
`);

/**
 * Complete cellar tea details combining all cellar-specific fragments
 * Use this for comprehensive cellar tea views
 */
export const CellarTeaDetailsFragment = graphql(
  `
  fragment CellarTeaDetails on cellar_items @_unmask {
    ...CellarTeaItem
    ...CellarTeaData
    ...CellarTeaCheckIns
  }
`,
  [CellarTeaItemFragment, CellarTeaDataFragment, CellarTeaCheckInsFragment],
);

/**
 * Query to get cellar tea details for a specific cellar item
 * Includes user data with friends for social features
 */
export const GetCellarTeaDetailsQuery = graphql(
  `
  query GetCellarTeaDetails($itemId: uuid!, $userId: uuid!) {
    cellar_items_by_pk(id: $itemId) {
      ...CellarTeaDetails
    }
    user(id: $userId) {
      ...TeaUserWithFriends
    }
  }
`,
  [CellarTeaDetailsFragment, UserWithFriendsFragment],
);

/**
 * Tea edit fragment for form initialization
 * Includes only fields needed for editing tea items
 */
export const TeaEditFragment = graphql(`
  fragment TeaEdit on teas @_unmask {
    id
    name
    description
    created_by_id
    category
    form
    caffeine_level
    region
    country
    cultivar
    oxidation_level
    processing
    harvest_year
    ingredients
    steeping_temperature
    steeping_time
    flavor_profile
    is_organic
    is_fair_trade
    barcode_code
  }
`);

/**
 * Query to get tea edit data for a specific item
 * Used for form initialization in edit pages
 */
export const GetTeaEditQuery = graphql(
  `
  query GetTeaEdit($itemId: uuid!) {
    teas_by_pk(id: $itemId) {
      ...TeaEdit
    }
  }
`,
  [TeaEditFragment],
);
