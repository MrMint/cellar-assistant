import { graphql } from "@cellar-assistant/shared";

/**
 * Beer-specific ranking data
 */
export const RankingBeerFragment = graphql(`
  fragment RankingBeer on beers @_unmask {
    id
    name
    vintage
    subtitle_field: style
    __typename
    brands(order_by: { is_primary: desc }, limit: 1) {
      brand {
        name
      }
    }
    item_favorites(where: { user_id: { _eq: $userId } }) {
      id
    }
    user_reviews: reviews_aggregate(
      where: { user_id: { _eq: $userId } }
      limit: 1
    ) {
      aggregate {
        count
      }
    }
    item_favorites_aggregate {
      aggregate {
        count
      }
    }
    item_images(limit: 1) {
      file_id
      placeholder
    }
  }
`);

/**
 * Wine-specific ranking data
 */
export const RankingWineFragment = graphql(`
  fragment RankingWine on wines @_unmask {
    id
    name
    vintage
    subtitle_field: variety
    __typename
    brands(order_by: { is_primary: desc }, limit: 1) {
      brand {
        name
      }
    }
    item_favorites(where: { user_id: { _eq: $userId } }) {
      id
    }
    user_reviews: reviews_aggregate(
      where: { user_id: { _eq: $userId } }
      limit: 1
    ) {
      aggregate {
        count
      }
    }
    item_favorites_aggregate {
      aggregate {
        count
      }
    }
    item_images(limit: 1) {
      file_id
      placeholder
    }
  }
`);

/**
 * Spirit-specific ranking data
 */
export const RankingSpiritFragment = graphql(`
  fragment RankingSpirit on spirits @_unmask {
    id
    name
    vintage
    subtitle_field: style
    __typename
    brands(order_by: { is_primary: desc }, limit: 1) {
      brand {
        name
      }
    }
    item_favorites(where: { user_id: { _eq: $userId } }) {
      id
    }
    user_reviews: reviews_aggregate(
      where: { user_id: { _eq: $userId } }
      limit: 1
    ) {
      aggregate {
        count
      }
    }
    item_favorites_aggregate {
      aggregate {
        count
      }
    }
    item_images(limit: 1) {
      file_id
      placeholder
    }
  }
`);

/**
 * Coffee-specific ranking data (no vintage field)
 */
export const RankingCoffeeFragment = graphql(`
  fragment RankingCoffee on coffees @_unmask {
    id
    name
    subtitle_field: roast_level
    __typename
    brands(order_by: { is_primary: desc }, limit: 1) {
      brand {
        name
      }
    }
    item_favorites(where: { user_id: { _eq: $userId } }) {
      id
    }
    user_reviews: reviews_aggregate(
      where: { user_id: { _eq: $userId } }
      limit: 1
    ) {
      aggregate {
        count
      }
    }
    item_favorites_aggregate {
      aggregate {
        count
      }
    }
    item_images(limit: 1) {
      file_id
      placeholder
    }
  }
`);

/**
 * Friends list fragment for rankings filters
 */
export const RankingFriendsFragment = graphql(`
  fragment RankingFriends on users @_unmask {
    friends {
      friend_id
    }
  }
`);

/**
 * Main ranking query with composed fragments
 */
export const GetRankingsQuery = graphql(
  `
  query GetRankings(
    $userId: uuid!
    $reviewers: String!
    $where: item_score_bool_exp_bool_exp
  ) {
    item_scores(
      args: { reviewers: $reviewers }
      order_by: { score: desc, count: desc }
      where: $where
      limit: 200
    ) {
      score
      count
      beer {
        ...RankingBeer
      }
      wine {
        ...RankingWine
      }
      spirit {
        ...RankingSpirit
      }
      coffee {
        ...RankingCoffee
      }
    }
  }
`,
  [
    RankingBeerFragment,
    RankingWineFragment,
    RankingSpiritFragment,
    RankingCoffeeFragment,
  ],
);

/**
 * Friends query for ranking filters
 */
export const GetRankingFriendsQuery = graphql(
  `
  query GetRankingFriends($userId: uuid!) {
    user(id: $userId) {
      ...RankingFriends
    }
  }
`,
  [RankingFriendsFragment],
);
