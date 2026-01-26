import { graphql } from "@cellar-assistant/shared";

/**
 * Core coffee-specific fields
 * Includes coffee process, roast level, species, cultivar, country, etc.
 */
export const CoffeeCoreFragment = graphql(`
  fragment CoffeeCore on coffees {
    id
    name
    created_by_id
    description
    country
    process
    roast_level
    species
    cultivar
  }
`);

/**
 * Coffee images for display
 * Extends base ItemImages pattern for coffees table
 */
export const CoffeeImagesFragment = graphql(`
  fragment CoffeeImages on coffees {
    item_images(limit: 1) {
      file_id
      placeholder
    }
  }
`);

/**
 * User-specific coffee data (favorites)
 * Requires $userId variable to be provided
 */
export const CoffeeUserDataFragment = graphql(`
  fragment CoffeeUserData on coffees {
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
 * Coffee reviews with user information
 * Limited to recent reviews for display
 */
export const CoffeeReviewsFragment = graphql(`
  fragment CoffeeReviews on coffees {
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
 * Coffee cellars where this coffee is stored
 * Includes cellar ownership information
 */
export const CoffeeCellarsFragment = graphql(`
  fragment CoffeeCellars on coffees {
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
 * Coffee brands and recipe relationships
 * Includes associated brands and recipes using this coffee
 */
export const CoffeeRelationshipsFragment = graphql(`
  fragment CoffeeRelationships on coffees {
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
 * Full coffee details combining all fragments
 * Use this for comprehensive coffee detail views
 */
export const CoffeeDetailsFragment = graphql(
  `
  fragment CoffeeDetails on coffees @_unmask {
    ...CoffeeCore
    ...CoffeeImages
    ...CoffeeUserData
    ...CoffeeReviews
    ...CoffeeCellars
    ...CoffeeRelationships
  }
`,
  [
    CoffeeCoreFragment,
    CoffeeImagesFragment,
    CoffeeUserDataFragment,
    CoffeeReviewsFragment,
    CoffeeCellarsFragment,
    CoffeeRelationshipsFragment,
  ],
);

/**
 * Query to get coffee details for a specific item
 * Also includes user's cellars for potential actions
 */
export const GetCoffeeDetailsQuery = graphql(
  `
  query GetCoffeeDetails($itemId: uuid!, $userId: uuid!) {
    coffees_by_pk(id: $itemId) {
      ...CoffeeDetails
    }
    cellars(where: { created_by_id: { _eq: $userId } }) {
      id
      name
    }
  }
`,
  [CoffeeDetailsFragment],
);

/**
 * Cellar-specific coffee fragments for contextual item views
 */

/**
 * Cellar coffee item data including cellar context
 * Includes ownership information and item-specific details
 */
export const CellarCoffeeItemFragment = graphql(`
  fragment CellarCoffeeItem on cellar_items {
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
 * Coffee data within cellar context
 * Reuses core coffee fragments but focused on cellar item view
 */
export const CellarCoffeeDataFragment = graphql(
  `
  fragment CellarCoffeeData on cellar_items {
    coffee {
      ...CoffeeCore
      ...CoffeeUserData
      ...CoffeeReviews
    }
  }
`,
  [CoffeeCoreFragment, CoffeeUserDataFragment, CoffeeReviewsFragment],
);

/**
 * Check-ins data for cellar items
 * Includes user information for social features
 */
export const CellarCoffeeCheckInsFragment = graphql(`
  fragment CellarCoffeeCheckIns on cellar_items {
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
 * Complete cellar coffee details combining all cellar-specific fragments
 * Use this for comprehensive cellar coffee views
 */
export const CellarCoffeeDetailsFragment = graphql(
  `
  fragment CellarCoffeeDetails on cellar_items @_unmask {
    ...CellarCoffeeItem
    ...CellarCoffeeData
    ...CellarCoffeeCheckIns
  }
`,
  [
    CellarCoffeeItemFragment,
    CellarCoffeeDataFragment,
    CellarCoffeeCheckInsFragment,
  ],
);

/**
 * Query to get cellar coffee details for a specific cellar item
 * Includes user data with friends for social features
 */
export const GetCellarCoffeeDetailsQuery = graphql(
  `
  query GetCellarCoffeeDetails($itemId: uuid!, $userId: uuid!) {
    cellar_items_by_pk(id: $itemId) {
      ...CellarCoffeeDetails
    }
    user(id: $userId) {
      ...UserWithFriends
    }
  }
`,
  [CellarCoffeeDetailsFragment, UserWithFriendsFragment],
);

/**
 * Coffee edit fragment for form initialization
 * Includes only fields needed for editing coffee items
 */
export const CoffeeEditFragment = graphql(`
  fragment CoffeeEdit on coffees @_unmask {
    id
    name
    created_by_id
    description
    barcode_code
    country
  }
`);

/**
 * Query to get coffee edit data for a specific item
 * Used for form initialization in edit pages
 */
export const GetCoffeeEditQuery = graphql(
  `
  query GetCoffeeEdit($itemId: uuid!) {
    coffees_by_pk(id: $itemId) {
      ...CoffeeEdit
    }
  }
`,
  [CoffeeEditFragment],
);
