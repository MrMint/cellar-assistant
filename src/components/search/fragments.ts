import { graphql } from "@cellar-assistant/shared";

/**
 * Query for search page discovery state.
 * Fetches collection stats, recent cellar items, and friend IDs in a single round-trip.
 */
export const SearchDiscoveryQuery = graphql(`
  query SearchDiscovery($userId: uuid!) {
    cellars_aggregate {
      aggregate {
        count
      }
    }

    beers_aggregate {
      aggregate {
        count
      }
    }
    wines_aggregate {
      aggregate {
        count
      }
    }
    spirits_aggregate {
      aggregate {
        count
      }
    }
    coffees_aggregate {
      aggregate {
        count
      }
    }
    sakes_aggregate {
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
