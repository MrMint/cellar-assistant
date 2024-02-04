import { graphql } from "@shared/gql";

const favoriteFragment = graphql(`
  fragment favoriteFragment on item_favorites_aggregate {
    aggregate {
      count
    }
  }
`);

const reviewFragment = graphql(`
  fragment reviewFragment on item_reviews_aggregate {
    aggregate {
      count
      avg {
        score
      }
    }
  }
`);

export const beerItemCardFragment = graphql(`
  fragment beerItemCardFragment on beers {
    id
    name
    vintage
    item_images(limit: 1) {
      file_id
      placeholder
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
    reviews_aggregate {
      ...reviewFragment
    }
    item_favorites_aggregate {
      ...favoriteFragment
    }
  }
`);

export const wineItemCardFragment = graphql(`
  fragment wineItemCardFragment on wines {
    id
    name
    vintage
    item_images(limit: 1) {
      file_id
      placeholder
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
    reviews_aggregate {
      ...reviewFragment
    }
    item_favorites_aggregate {
      ...favoriteFragment
    }
  }
`);

export const spiritItemCardFragment = graphql(`
  fragment spiritItemCardFragment on spirits {
    id
    name
    vintage
    item_images(limit: 1) {
      file_id
      placeholder
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
    reviews_aggregate {
      ...reviewFragment
    }
    item_favorites_aggregate {
      ...favoriteFragment
    }
  }
`);

export const coffeeItemCardFragment = graphql(`
  fragment coffeeItemCardFragment on coffees {
    id
    name
    item_images(limit: 1) {
      file_id
      placeholder
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
    reviews_aggregate {
      ...reviewFragment
    }
    item_favorites_aggregate {
      ...favoriteFragment
    }
  }
`);
