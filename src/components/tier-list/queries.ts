import { graphql } from "@cellar-assistant/shared";
import {
  TierListCardFragment,
  TierListEditFragment,
  TierListFullFragment,
} from "./fragments";

/**
 * Get all tier lists for the index page
 */
export const GetTierListsQuery = graphql(
  `
    query GetTierLists {
      tier_lists(order_by: { updated_at: desc }) {
        ...TierListCard
      }
    }
  `,
  [TierListCardFragment],
);

/**
 * Get a single tier list with all items for the DnD view
 */
export const GetTierListQuery = graphql(
  `
    query GetTierList($id: uuid!) {
      tier_lists_by_pk(id: $id) {
        ...TierListFull
      }
    }
  `,
  [TierListFullFragment],
);

/**
 * Get tier list edit data for form initialization
 */
export const GetTierListEditQuery = graphql(
  `
    query GetTierListEdit($id: uuid!) {
      tier_lists_by_pk(id: $id) {
        ...TierListEdit
      }
    }
  `,
  [TierListEditFragment],
);

/**
 * Get user's tier lists that may contain a specific place
 * Used by the "Add to Tier List" modal
 */
export const GetTierListsForPlaceQuery = graphql(`
  query GetTierListsForPlace($placeId: uuid!, $userId: uuid!) {
    tier_lists(
      where: {
        list_type: { _eq: "place" }
        created_by_id: { _eq: $userId }
      }
      order_by: { updated_at: desc }
    ) {
      id
      name
      list_type
      items(where: { place_id: { _eq: $placeId } }) {
        id
        band
      }
    }
  }
`);

/**
 * Get user's tier lists that may contain a specific item
 * Used by the "Add to Tier List" modal for wines, beers, etc.
 * Filters by list_type to only show relevant tier lists.
 */
export const GetTierListsForItemQuery = graphql(`
  query GetTierListsForItem(
    $listType: String!
    $userId: uuid!
    $wineId: uuid
    $beerId: uuid
    $spiritId: uuid
    $coffeeId: uuid
    $sakeId: uuid
  ) {
    tier_lists(
      where: {
        list_type: { _eq: $listType }
        created_by_id: { _eq: $userId }
      }
      order_by: { updated_at: desc }
    ) {
      id
      name
      list_type
      items(
        where: {
          _or: [
            { wine_id: { _eq: $wineId } }
            { beer_id: { _eq: $beerId } }
            { spirit_id: { _eq: $spiritId } }
            { coffee_id: { _eq: $coffeeId } }
            { sake_id: { _eq: $sakeId } }
          ]
        }
      ) {
        id
        band
      }
    }
  }
`);

/**
 * Server-side query to fetch the current user's review scores for items.
 * Used in the page component to resolve review data before passing to client.
 * Polymorphic FKs match the item_reviews table structure.
 */
export const GetUserItemReviewsQuery = graphql(`
  query GetUserItemReviews(
    $userId: uuid!
    $wineIds: [uuid!]!
    $beerIds: [uuid!]!
    $spiritIds: [uuid!]!
    $coffeeIds: [uuid!]!
    $sakeIds: [uuid!]!
  ) {
    item_reviews(
      where: {
        user_id: { _eq: $userId }
        _or: [
          { wine_id: { _in: $wineIds } }
          { beer_id: { _in: $beerIds } }
          { spirit_id: { _in: $spiritIds } }
          { coffee_id: { _in: $coffeeIds } }
          { sake_id: { _in: $sakeIds } }
        ]
      }
    ) {
      wine_id
      beer_id
      spirit_id
      coffee_id
      sake_id
      score
    }
  }
`);
