import { graphql } from "@cellar-assistant/shared";

/**
 * Query for search page discovery state.
 * Fetches collection stats, recent cellar items, and friend IDs in a single round-trip.
 */
export const SearchDiscoveryQuery = graphql(`
  query SearchDiscovery($userId: uuid!) {
    cellars_aggregate(
      where: {
        _or: [
          { created_by_id: { _eq: $userId } }
          { co_owners: { user_id: { _eq: $userId } } }
        ]
      }
    ) {
      aggregate {
        count
      }
    }

    beers_aggregate(
      where: {
        cellar_items: {
          cellar: {
            _or: [
              { created_by_id: { _eq: $userId } }
              { co_owners: { user_id: { _eq: $userId } } }
            ]
          }
        }
      }
    ) {
      aggregate {
        count
      }
    }
    wines_aggregate(
      where: {
        cellar_items: {
          cellar: {
            _or: [
              { created_by_id: { _eq: $userId } }
              { co_owners: { user_id: { _eq: $userId } } }
            ]
          }
        }
      }
    ) {
      aggregate {
        count
      }
    }
    spirits_aggregate(
      where: {
        cellar_items: {
          cellar: {
            _or: [
              { created_by_id: { _eq: $userId } }
              { co_owners: { user_id: { _eq: $userId } } }
            ]
          }
        }
      }
    ) {
      aggregate {
        count
      }
    }
    coffees_aggregate(
      where: {
        cellar_items: {
          cellar: {
            _or: [
              { created_by_id: { _eq: $userId } }
              { co_owners: { user_id: { _eq: $userId } } }
            ]
          }
        }
      }
    ) {
      aggregate {
        count
      }
    }
    sakes_aggregate(
      where: {
        cellar_items: {
          cellar: {
            _or: [
              { created_by_id: { _eq: $userId } }
              { co_owners: { user_id: { _eq: $userId } } }
            ]
          }
        }
      }
    ) {
      aggregate {
        count
      }
    }

    recent_cellar_items: cellar_items(
      order_by: { created_at: desc }
      limit: 6
    ) {
      id
      type
      createdAt: created_at
      createdBy {
        id
        displayName
        avatarUrl
      }
      cellar {
        id
        name
      }
      beer {
        id
        name
        item_images(limit: 1) {
          file_id
          placeholder
        }
      }
      wine {
        id
        name
        vintage
        item_images(limit: 1) {
          file_id
          placeholder
        }
      }
      spirit {
        id
        name
        item_images(limit: 1) {
          file_id
          placeholder
        }
      }
      coffee {
        id
        name
        item_images(limit: 1) {
          file_id
          placeholder
        }
      }
      sake {
        id
        name
        vintage
        item_images(limit: 1) {
          file_id
          placeholder
        }
      }
    }

    user(id: $userId) {
      displayName
      friends {
        friend {
          id
        }
      }
    }
  }
`);

/**
 * Query for recent reviews from the current user and their friends.
 * Fetches polymorphic item details for each review.
 */
export const RecentReviewsQuery = graphql(`
  query RecentReviews($userIds: [uuid!]!) {
    item_reviews(
      where: { user_id: { _in: $userIds } }
      order_by: { created_at: desc }
      limit: 6
    ) {
      id
      score
      text
      createdAt: created_at
      user {
        id
        displayName
        avatarUrl
      }
      beer {
        id
        name
        item_images(limit: 1) {
          file_id
          placeholder
        }
      }
      wine {
        id
        name
        vintage
        item_images(limit: 1) {
          file_id
          placeholder
        }
      }
      spirit {
        id
        name
        item_images(limit: 1) {
          file_id
          placeholder
        }
      }
      coffee {
        id
        name
        item_images(limit: 1) {
          file_id
          placeholder
        }
      }
      sake {
        id
        name
        vintage
        item_images(limit: 1) {
          file_id
          placeholder
        }
      }
    }
  }
`);

/**
 * Query for recent tier list item additions from the current user and their friends.
 * Includes item images for thumbnails and tier list name for context.
 */
export const RecentTierListItemsQuery = graphql(`
  query RecentTierListItems($userIds: [uuid!]!) {
    tier_list_items(
      where: { tier_list: { created_by_id: { _in: $userIds } } }
      order_by: { created_at: desc }
      limit: 6
    ) {
      id
      band
      type
      createdAt: created_at
      tier_list {
        id
        name
        createdBy {
          id
          displayName
          avatarUrl
        }
        items(order_by: [{ band: desc }, { position: asc }]) {
          id
        }
      }
      beer {
        id
        name
        item_images(limit: 1) {
          file_id
          placeholder
        }
      }
      wine {
        id
        name
        vintage
        item_images(limit: 1) {
          file_id
          placeholder
        }
      }
      spirit {
        id
        name
        item_images(limit: 1) {
          file_id
          placeholder
        }
      }
      coffee {
        id
        name
        item_images(limit: 1) {
          file_id
          placeholder
        }
      }
      sake {
        id
        name
        vintage
        item_images(limit: 1) {
          file_id
          placeholder
        }
      }
      place {
        id
        name
        display_name
        google_photos(limit: 1, order_by: { display_order: asc }) {
          storage_file_id
        }
      }
    }
  }
`);
