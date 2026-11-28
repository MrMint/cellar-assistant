/**
 * The Pour sheet's reads (X03). Its writes are other modules' documents:
 * `logDrink` and `deleteDrinkLog` (drink-log), `updateCellarItem`,
 * `setCellarItemPercentage` and `emptyCellarItem` (cellars), the review's
 * add/update (items) and the tier list's `reorderTierListBand` and
 * `undoTierListEdit`.
 */
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";

/**
 * After the last pour: your rating of the item (the review — one per item,
 * D5) and the tier lists it is on, so the sheet can suggest a band from the
 * rating for each list that is yours.
 */
export const PourFollowUpQuery = graphql(
  `
  query PourFollowUp($type: ItemType!, $itemId: ID!) {
    me {
      id
    }
    item(type: $type, id: $itemId) {
      __typename
      ... on QueryItemSuccess {
        data {
          __typename
          id
          myReview {
            __typename
            id
            score
          }
          tierListEntries(first: 100) {
            edges {
              node {
                __typename
                id
                band
                tierList {
                  __typename
                  id
                  name
                  createdById
                }
              }
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/**
 * One list's entries — what a band move needs: `reorderTierListBand` takes
 * the destination band's **whole** membership, in order.
 */
export const PourTierListBandQuery = graphql(
  `
  query PourTierListBand($tierListId: ID!) {
    tierList(id: $tierListId) {
      __typename
      ... on TierList {
        id
        items(first: 100) {
          pageInfo {
            hasNextPage
          }
          edges {
            node {
              __typename
              id
              band
              position
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/**
 * Where a list's history stands just after the sheet's band move: the edit
 * on top, so the move's Undo can name it (`expectedSeq`, D4) — the move
 * payload does not carry it.
 */
export const PourTierListHistoryQuery = graphql(
  `
  query PourTierListHistory($tierListId: ID!) {
    tierList(id: $tierListId) {
      __typename
      ... on TierList {
        id
        editHistory {
          undo {
            seq
            kind
            fromBand
            toBand
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);
