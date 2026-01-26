import { graphql } from "@cellar-assistant/shared";

/**
 * Core item fields used across multiple components
 * Use this for basic item identification and display
 */
export const ItemCoreFragment = graphql(`
  fragment ItemCore on items {
    id
    name
    vintage
    created_by_id
    description
  }
`);

/**
 * Item statistics used in cards and lists
 * Includes favorites count and review aggregations
 */
export const ItemStatsFragment = graphql(`
  fragment ItemStats on items {
    item_favorites_aggregate {
      aggregate {
        count
      }
    }
    reviews_aggregate {
      aggregate {
        avg {
          score
        }
        count
      }
    }
  }
`);

/**
 * Item images for display components
 * Includes both placeholder and actual image data
 */
export const ItemImagesFragment = graphql(`
  fragment ItemImages on items {
    item_images(limit: 1, order_by: { created_at: desc }) {
      file_id
      placeholder
    }
  }
`);

/**
 * User-specific item data (favorites, reviews)
 * Requires $userId variable to be provided
 */
export const ItemUserDataFragment = graphql(`
  fragment ItemUserData on items {
    item_favorites(where: { user_id: { _eq: $userId } }) {
      id
    }
    user_reviews: reviews(where: { user_id: { _eq: $userId } }) {
      id
      score
      text
    }
  }
`);

/**
 * Full item data combining all fragments
 * Use this for detail views and comprehensive displays
 */
export const ItemFullFragment = graphql(
  `
  fragment ItemFull on items {
    ...ItemCore
    ...ItemStats
    ...ItemImages
    ...ItemUserData
  }
`,
  [
    ItemCoreFragment,
    ItemStatsFragment,
    ItemImagesFragment,
    ItemUserDataFragment,
  ],
);
