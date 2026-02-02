import { graphql } from "@cellar-assistant/shared";

/**
 * Core wine-specific fields
 * Includes wine variety, region, style, alcohol content, country, etc.
 */
export const WineCoreFragment = graphql(`
  fragment WineCore on wines {
    id
    name
    created_by_id
    region
    variety
    style
    vintage
    description
    barcode_code
    alcohol_content_percentage
    country
  }
`);

/**
 * Wine images for display
 * Extends base ItemImages pattern for wines table
 */
export const WineImagesFragment = graphql(`
  fragment WineImages on wines {
    item_images(limit: 1) {
      file_id
      placeholder
    }
  }
`);

/**
 * User-specific wine data (favorites)
 * Requires $userId variable to be provided
 */
export const WineUserDataFragment = graphql(`
  fragment WineUserData on wines {
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
 * Wine reviews with user information
 * Limited to recent reviews for display
 */
export const WineReviewsFragment = graphql(`
  fragment WineReviews on wines {
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
 * Wine cellars where this wine is stored
 * Includes cellar ownership information
 */
export const WineCellarsFragment = graphql(`
  fragment WineCellars on wines {
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
 * Wine brands and recipe relationships
 * Includes associated brands and recipes using this wine
 */
export const WineRelationshipsFragment = graphql(`
  fragment WineRelationships on wines {
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
 * Full wine details combining all fragments
 * Use this for comprehensive wine detail views
 */
export const WineDetailsFragment = graphql(
  `
  fragment WineDetails on wines @_unmask {
    ...WineCore
    ...WineImages
    ...WineUserData
    ...WineReviews
    ...WineCellars
    ...WineRelationships
  }
`,
  [
    WineCoreFragment,
    WineImagesFragment,
    WineUserDataFragment,
    WineReviewsFragment,
    WineCellarsFragment,
    WineRelationshipsFragment,
  ],
);

/**
 * Query to get wine details for a specific item
 * Also includes user's cellars for potential actions
 */
export const GetWineDetailsQuery = graphql(
  `
  query GetWineDetails($itemId: uuid!, $userId: uuid!) {
    wines_by_pk(id: $itemId) {
      ...WineDetails
    }
    cellars(where: { created_by_id: { _eq: $userId } }) {
      id
      name
    }
  }
`,
  [WineDetailsFragment],
);

/**
 * Cellar-specific wine fragments for contextual item views
 */

/**
 * Cellar wine item data including cellar context
 * Includes ownership information and item-specific details
 */
export const CellarWineItemFragment = graphql(`
  fragment CellarWineItem on cellar_items {
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
 * Wine data within cellar context
 * Reuses core wine fragments but focused on cellar item view
 */
export const CellarWineDataFragment = graphql(
  `
  fragment CellarWineData on cellar_items {
    wine {
      ...WineCore
      ...WineUserData
      ...WineReviews
      ...WineRelationships
    }
  }
`,
  [
    WineCoreFragment,
    WineUserDataFragment,
    WineReviewsFragment,
    WineRelationshipsFragment,
  ],
);

/**
 * Check-ins data for cellar items
 * Includes user information for social features
 */
export const CellarWineCheckInsFragment = graphql(`
  fragment CellarWineCheckIns on cellar_items {
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
 * Complete cellar wine details combining all cellar-specific fragments
 * Use this for comprehensive cellar wine views
 */
export const CellarWineDetailsFragment = graphql(
  `
  fragment CellarWineDetails on cellar_items @_unmask {
    ...CellarWineItem
    ...CellarWineData
    ...CellarWineCheckIns
  }
`,
  [CellarWineItemFragment, CellarWineDataFragment, CellarWineCheckInsFragment],
);

/**
 * Query to get cellar wine details for a specific cellar item
 * Includes user data with friends for social features
 */
export const GetCellarWineDetailsQuery = graphql(
  `
  query GetCellarWineDetails($itemId: uuid!, $userId: uuid!) {
    cellar_items_by_pk(id: $itemId) {
      ...CellarWineDetails
    }
    user(id: $userId) {
      ...UserWithFriends
    }
  }
`,
  [CellarWineDetailsFragment, UserWithFriendsFragment],
);

/**
 * Wine edit fragment for form initialization
 * Includes only fields needed for editing wine items
 */
export const WineEditFragment = graphql(`
  fragment WineEdit on wines @_unmask {
    id
    name
    description
    created_by_id
    vintage
    alcohol_content_percentage
    barcode_code
    special_designation
    vineyard_designation
    variety
    region
    style
    country
  }
`);

/**
 * Query to get wine edit data for a specific item
 * Used for form initialization in edit pages
 */
export const GetWineEditQuery = graphql(
  `
  query GetWineEdit($itemId: uuid!) {
    wines_by_pk(id: $itemId) {
      ...WineEdit
    }
  }
`,
  [WineEditFragment],
);
