import { graphql } from "@cellar-assistant/shared";

/**
 * Core sake-specific fields
 * Includes sake category, type, region, polish grade, etc.
 * Note: Brewery information accessed via brands relationship
 */
export const SakeCoreFragment = graphql(`
  fragment SakeCore on sakes @_unmask {
    id
    name
    created_by_id
    region
    category
    type
    polish_grade
    alcohol_content_percentage
    serving_temperature
    rice_variety
    yeast_strain
    sake_meter_value
    acidity
    amino_acid
    vintage
    country
    description
    barcode_code
  }
`);

/**
 * Sake images for display
 * Extends base ItemImages pattern for sakes table
 */
export const SakeImagesFragment = graphql(`
  fragment SakeImages on sakes @_unmask {
    item_images(limit: 1) {
      file_id
      placeholder
    }
  }
`);

/**
 * User-specific sake data (favorites)
 * Requires $userId variable to be provided
 */
export const SakeUserDataFragment = graphql(`
  fragment SakeUserData on sakes @_unmask {
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
 * Sake reviews with user information
 * Limited to recent reviews for display
 */
export const SakeReviewsFragment = graphql(`
  fragment SakeReviews on sakes @_unmask {
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
 * Sake cellars where this sake is stored
 * Includes cellar ownership information
 */
export const SakeCellarsFragment = graphql(`
  fragment SakeCellars on sakes @_unmask {
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
 * Sake brands and recipe relationships
 * Includes associated brands and recipes using this sake
 */
export const SakeRelationshipsFragment = graphql(`
  fragment SakeRelationships on sakes @_unmask {
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
 * Full sake details combining all fragments
 * Use this for comprehensive sake detail views
 */
export const SakeDetailsFragment = graphql(
  `
  fragment SakeDetails on sakes @_unmask {
    ...SakeCore
    ...SakeImages
    ...SakeUserData
    ...SakeReviews
    ...SakeCellars
    ...SakeRelationships
  }
`,
  [
    SakeCoreFragment,
    SakeImagesFragment,
    SakeUserDataFragment,
    SakeReviewsFragment,
    SakeCellarsFragment,
    SakeRelationshipsFragment,
  ],
);

/**
 * Query to get sake details for a specific item
 * Also includes user's cellars for potential actions
 */
export const GetSakeDetailsQuery = graphql(
  `
  query GetSakeDetails($itemId: uuid!, $userId: uuid!) {
    sakes_by_pk(id: $itemId) {
      ...SakeDetails
    }
    cellars(where: { created_by_id: { _eq: $userId } }) {
      id
      name
    }
  }
`,
  [SakeDetailsFragment],
);

/**
 * Cellar-specific sake fragments for contextual item views
 */

/**
 * Cellar sake item data including cellar context
 * Includes ownership information and item-specific details
 */
export const CellarSakeItemFragment = graphql(`
  fragment CellarSakeItem on cellar_items @_unmask {
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
 * Sake data within cellar context
 * Reuses core sake fragments but focused on cellar item view
 */
export const CellarSakeDataFragment = graphql(
  `
  fragment CellarSakeData on cellar_items @_unmask {
    sake {
      ...SakeCore
      ...SakeUserData
      ...SakeReviews
    }
  }
`,
  [SakeCoreFragment, SakeUserDataFragment, SakeReviewsFragment],
);

/**
 * Check-ins data for cellar items
 * Includes user information for social features
 */
export const CellarSakeCheckInsFragment = graphql(`
  fragment CellarSakeCheckIns on cellar_items @_unmask {
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
  fragment UserWithFriends on users @_unmask {
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
 * Complete cellar sake details combining all cellar-specific fragments
 * Use this for comprehensive cellar sake views
 */
export const CellarSakeDetailsFragment = graphql(
  `
  fragment CellarSakeDetails on cellar_items @_unmask {
    ...CellarSakeItem
    ...CellarSakeData
    ...CellarSakeCheckIns
  }
`,
  [CellarSakeItemFragment, CellarSakeDataFragment, CellarSakeCheckInsFragment],
);

/**
 * Query to get cellar sake details for a specific cellar item
 * Includes user data with friends for social features
 */
export const GetCellarSakeDetailsQuery = graphql(
  `
  query GetCellarSakeDetails($itemId: uuid!, $userId: uuid!) {
    cellar_items_by_pk(id: $itemId) {
      ...CellarSakeDetails
    }
    user(id: $userId) {
      ...UserWithFriends
    }
  }
`,
  [CellarSakeDetailsFragment, UserWithFriendsFragment],
);

/**
 * Sake edit fragment for form initialization
 * Includes only fields needed for editing sake items
 */
export const SakeEditFragment = graphql(`
  fragment SakeEdit on sakes @_unmask {
    id
    name
    description
    created_by_id
    region
    category
    type
    polish_grade
    alcohol_content_percentage
    serving_temperature
    rice_variety
    yeast_strain
    sake_meter_value
    acidity
    amino_acid
    vintage
    country
    barcode_code
  }
`);

/**
 * Query to get sake edit data for a specific item
 * Used for form initialization in edit pages
 */
export const GetSakeEditQuery = graphql(
  `
  query GetSakeEdit($itemId: uuid!) {
    sakes_by_pk(id: $itemId) {
      ...SakeEdit
    }
  }
`,
  [SakeEditFragment],
);
