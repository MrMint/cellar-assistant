import { graphql } from "@cellar-assistant/shared";

/**
 * Core beer-specific fields
 * Includes beer style, alcohol content, country, etc.
 */
export const BeerCoreFragment = graphql(`
  fragment BeerCore on beers {
    id
    name
    created_by_id
    style
    vintage
    description
    alcohol_content_percentage
    country
  }
`);

/**
 * Beer images for display
 * Extends base ItemImages pattern for beers table
 */
export const BeerImagesFragment = graphql(`
  fragment BeerImages on beers {
    item_images(limit: 1) {
      file_id
      placeholder
    }
  }
`);

/**
 * User-specific beer data (favorites)
 * Requires $userId variable to be provided
 */
export const BeerUserDataFragment = graphql(`
  fragment BeerUserData on beers {
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
 * Beer reviews with user information
 * Limited to recent reviews for display
 */
export const BeerReviewsFragment = graphql(`
  fragment BeerReviews on beers {
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
 * Beer cellars where this beer is stored
 * Includes cellar ownership information
 */
export const BeerCellarsFragment = graphql(`
  fragment BeerCellars on beers {
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
 * Beer brands and recipe relationships
 * Includes associated brands and recipes using this beer
 */
export const BeerRelationshipsFragment = graphql(`
  fragment BeerRelationships on beers {
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
 * Full beer details combining all fragments
 * Use this for comprehensive beer detail views
 */
export const BeerDetailsFragment = graphql(
  `
  fragment BeerDetails on beers @_unmask {
    ...BeerCore
    ...BeerImages
    ...BeerUserData
    ...BeerReviews
    ...BeerCellars
    ...BeerRelationships
  }
`,
  [
    BeerCoreFragment,
    BeerImagesFragment,
    BeerUserDataFragment,
    BeerReviewsFragment,
    BeerCellarsFragment,
    BeerRelationshipsFragment,
  ],
);

/**
 * Query to get beer details for a specific item
 * Also includes user's cellars for potential actions
 */
export const GetBeerDetailsQuery = graphql(
  `
  query GetBeerDetails($itemId: uuid!, $userId: uuid!) {
    beers_by_pk(id: $itemId) {
      ...BeerDetails
    }
    cellars(where: { created_by_id: { _eq: $userId } }) {
      id
      name
    }
  }
`,
  [BeerDetailsFragment],
);

/**
 * Cellar-specific beer fragments for contextual item views
 */

/**
 * Cellar beer item data including cellar context
 * Includes ownership information and item-specific details
 */
export const CellarBeerItemFragment = graphql(`
  fragment CellarBeerItem on cellar_items {
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
 * Beer data within cellar context
 * Reuses core beer fragments but focused on cellar item view
 */
export const CellarBeerDataFragment = graphql(
  `
  fragment CellarBeerData on cellar_items {
    beer {
      ...BeerCore
      ...BeerUserData
      ...BeerReviews
    }
  }
`,
  [BeerCoreFragment, BeerUserDataFragment, BeerReviewsFragment],
);

/**
 * Check-ins data for cellar items
 * Includes user information for social features
 */
export const CellarBeerCheckInsFragment = graphql(`
  fragment CellarBeerCheckIns on cellar_items {
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
  fragment UserWithFriends on users {
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
 * Complete cellar beer details combining all cellar-specific fragments
 * Use this for comprehensive cellar beer views
 */
export const CellarBeerDetailsFragment = graphql(
  `
  fragment CellarBeerDetails on cellar_items @_unmask {
    ...CellarBeerItem
    ...CellarBeerData
    ...CellarBeerCheckIns
  }
`,
  [CellarBeerItemFragment, CellarBeerDataFragment, CellarBeerCheckInsFragment],
);

/**
 * Query to get cellar beer details for a specific cellar item
 * Includes user data with friends for social features
 */
export const GetCellarBeerDetailsQuery = graphql(
  `
  query GetCellarBeerDetails($itemId: uuid!, $userId: uuid!) {
    cellar_items_by_pk(id: $itemId) {
      ...CellarBeerDetails
    }
    user(id: $userId) {
      ...UserWithFriends
    }
  }
`,
  [CellarBeerDetailsFragment, UserWithFriendsFragment],
);

/**
 * Beer edit fragment for form initialization
 * Includes only fields needed for editing beer items
 */
export const BeerEditFragment = graphql(`
  fragment BeerEdit on beers @_unmask {
    id
    name
    created_by_id
    vintage
    style
    description
    alcohol_content_percentage
    barcode_code
    international_bitterness_unit
    country
  }
`);

/**
 * Query to get beer edit data for a specific item
 * Used for form initialization in edit pages
 */
export const GetBeerEditQuery = graphql(
  `
  query GetBeerEdit($itemId: uuid!) {
    beers_by_pk(id: $itemId) {
      ...BeerEdit
    }
  }
`,
  [BeerEditFragment],
);
