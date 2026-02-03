import { graphql } from "@cellar-assistant/shared";

/**
 * Core spirit-specific fields
 * Includes spirit type, alcohol content, country, etc.
 */
export const SpiritCoreFragment = graphql(`
  fragment SpiritCore on spirits {
    id
    name
    created_by_id
    style
    vintage
    description
    alcohol_content_percentage
    type
    country
  }
`);

/**
 * Spirit images for display
 * Extends base ItemImages pattern for spirits table
 */
export const SpiritImagesFragment = graphql(`
  fragment SpiritImages on spirits {
    item_images(limit: 1) {
      file_id
      placeholder
    }
  }
`);

/**
 * User-specific spirit data (favorites)
 * Requires $userId variable to be provided
 */
export const SpiritUserDataFragment = graphql(`
  fragment SpiritUserData on spirits {
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
 * Spirit reviews with user information
 * Limited to recent reviews for display
 */
export const SpiritReviewsFragment = graphql(`
  fragment SpiritReviews on spirits {
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
 * Spirit cellars where this spirit is stored
 * Includes cellar ownership information
 */
export const SpiritCellarsFragment = graphql(`
  fragment SpiritCellars on spirits {
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
 * Spirit brands and recipe relationships
 * Includes associated brands and recipes using this spirit
 */
export const SpiritRelationshipsFragment = graphql(`
  fragment SpiritRelationships on spirits {
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
 * Full spirit details combining all fragments
 * Use this for comprehensive spirit detail views
 */
export const SpiritDetailsFragment = graphql(
  `
  fragment SpiritDetails on spirits @_unmask {
    ...SpiritCore
    ...SpiritImages
    ...SpiritUserData
    ...SpiritReviews
    ...SpiritCellars
    ...SpiritRelationships
  }
`,
  [
    SpiritCoreFragment,
    SpiritImagesFragment,
    SpiritUserDataFragment,
    SpiritReviewsFragment,
    SpiritCellarsFragment,
    SpiritRelationshipsFragment,
  ],
);

/**
 * Query to get spirit details for a specific item
 * Also includes user's cellars for potential actions
 */
export const GetSpiritDetailsQuery = graphql(
  `
  query GetSpiritDetails($itemId: uuid!, $userId: uuid!) {
    spirits_by_pk(id: $itemId) {
      ...SpiritDetails
    }
    cellars(where: { created_by_id: { _eq: $userId } }) {
      id
      name
    }
  }
`,
  [SpiritDetailsFragment],
);

/**
 * Cellar-specific spirit fragments for contextual item views
 */

/**
 * Cellar spirit item data including cellar context
 * Includes ownership information and item-specific details
 */
export const CellarSpiritItemFragment = graphql(`
  fragment CellarSpiritItem on cellar_items {
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
 * Spirit data within cellar context
 * Reuses core spirit fragments but focused on cellar item view
 */
export const CellarSpiritDataFragment = graphql(
  `
  fragment CellarSpiritData on cellar_items {
    spirit {
      ...SpiritCore
      ...SpiritUserData
      ...SpiritReviews
      ...SpiritRelationships
    }
  }
`,
  [
    SpiritCoreFragment,
    SpiritUserDataFragment,
    SpiritReviewsFragment,
    SpiritRelationshipsFragment,
  ],
);

/**
 * Check-ins data for cellar items
 * Includes user information for social features
 */
export const CellarSpiritCheckInsFragment = graphql(`
  fragment CellarSpiritCheckIns on cellar_items {
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
 * Complete cellar spirit details combining all cellar-specific fragments
 * Use this for comprehensive cellar spirit views
 */
export const CellarSpiritDetailsFragment = graphql(
  `
  fragment CellarSpiritDetails on cellar_items @_unmask {
    ...CellarSpiritItem
    ...CellarSpiritData
    ...CellarSpiritCheckIns
  }
`,
  [
    CellarSpiritItemFragment,
    CellarSpiritDataFragment,
    CellarSpiritCheckInsFragment,
  ],
);

/**
 * Query to get cellar spirit details for a specific cellar item
 * Includes user data with friends for social features
 */
export const GetCellarSpiritDetailsQuery = graphql(
  `
  query GetCellarSpiritDetails($itemId: uuid!, $userId: uuid!) {
    cellar_items_by_pk(id: $itemId) {
      ...CellarSpiritDetails
    }
    user(id: $userId) {
      ...UserWithFriends
    }
  }
`,
  [CellarSpiritDetailsFragment, UserWithFriendsFragment],
);

/**
 * Spirit edit fragment for form initialization
 * Includes only fields needed for editing spirit items
 */
export const SpiritEditFragment = graphql(`
  fragment SpiritEdit on spirits @_unmask {
    id
    name
    created_by_id
    vintage
    type
    style
    description
    alcohol_content_percentage
    barcode_code
    country
  }
`);

/**
 * Query to get spirit edit data for a specific item
 * Used for form initialization in edit pages
 */
export const GetSpiritEditQuery = graphql(
  `
  query GetSpiritEdit($itemId: uuid!) {
    spirits_by_pk(id: $itemId) {
      ...SpiritEdit
    }
  }
`,
  [SpiritEditFragment],
);
