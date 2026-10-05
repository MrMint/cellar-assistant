/**
 * The tier-list queries and mutations — the successor of
 * `82450ad1:src/components/tier-list/queries.ts` and of the Hasura mutations
 * that lived in `82450ad1:src/app/actions/tierLists.ts`.
 *
 * - `tier_lists(order_by: updated_at desc)` (everything Hasura's permissions
 *   let through) → `myTierLists`, which is `canSeeTierList` server-side, most
 *   recently changed first, paged by cursor (100 a page).
 * - `tier_lists_by_pk` → `tierList(id:)`, a result union whose
 *   `NotFoundError` covers "no such list" and "not yours to see" alike.
 * - `TierList.items` is a connection capped at 100 a page; the page walks
 *   every page (`loadAllEntries` in `adapter.ts`), because a reorder must name
 *   a band's full membership and the old page always held every entry.
 * - `GetTierListsForItem` (the viewer's own lists of one type, each with the
 *   entity's row if present) → the viewer's visible lists, narrowed to theirs
 *   and the type client-side (G33 not built), plus the entity's own
 *   `tierListEntries` (G8) for "Already added (band)".
 * - `GetUserItemReviews` → `Item.myReview` on the entry (fragments.ts).
 * - Every write is a named command returning a result union.
 */

import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";
import {
  TierListCardFragment,
  TierListCoreFragment,
  TierListEditFragment,
  TierListItemFragment,
} from "./fragments";

/** The API caps `first` at 100 on every connection. */
export const TIER_LISTS_PAGE_SIZE = 100;
export const TIER_LIST_ITEMS_PAGE_SIZE = 100;
/** `Item/Place.tierListEntries` reaches at most 100 rows. */
export const ENTITY_ENTRIES_PAGE_SIZE = 100;

/** Every tier list the viewer may see, for the index page. */
export const GetTierListsQuery = graphql(
  `
    query GetTierLists($first: Int!, $after: String) {
      myTierLists(first: $first, after: $after) {
        __typename
        ... on TierListConnection {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            cursor
            node {
              ...TierListCard
            }
          }
        }
        ...ActorErrorFields
      }
    }
  `,
  [TierListCardFragment, ActorErrorFieldsFragment],
);

/** One tier list with a page of its entries, `band desc, position asc`. */
export const GetTierListQuery = graphql(
  `
    query GetTierList($id: ID!, $first: Int!, $after: String) {
      tierList(id: $id) {
        __typename
        ... on TierList {
          ...TierListCore
          items(first: $first, after: $after) {
            totalCount
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              cursor
              node {
                ...TierListItem
              }
            }
          }
        }
        ...ActorErrorFields
      }
    }
  `,
  [TierListCoreFragment, TierListItemFragment, ActorErrorFieldsFragment],
);

/** The edit form's initial values. */
export const GetTierListEditQuery = graphql(
  `
    query GetTierListEdit($id: ID!) {
      tierList(id: $id) {
        __typename
        ... on TierList {
          ...TierListEdit
        }
        ...ActorErrorFields
      }
    }
  `,
  [TierListEditFragment, ActorErrorFieldsFragment],
);

/** The signed-in viewer's id — "may I edit this" is creator-only. */
export const TierListViewerQuery = graphql(`
  query TierListViewer {
    me {
      id
    }
  }
`);

/** "Add to Tier List" modal for an item: lists, and where the item already is. */
export const GetTierListsForItemQuery = graphql(
  `
    query GetTierListsForItem(
      $itemId: ID!
      $itemType: ItemType!
      $first: Int!
    ) {
      me {
        id
      }
      myTierLists(first: $first) {
        __typename
        ... on TierListConnection {
          edges {
            node {
              __typename
              id
              name
              listType
              createdById
            }
          }
        }
        ...ActorErrorFields
      }
      item(id: $itemId, type: $itemType) {
        __typename
        ... on QueryItemSuccess {
          data {
            __typename
            id
            tierListEntries(first: $first) {
              edges {
                node {
                  id
                  band
                  tierListId
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

/** "Add to Tier List" modal for a place. */
export const GetTierListsForPlaceQuery = graphql(
  `
    query GetTierListsForPlace($placeId: ID!, $first: Int!) {
      me {
        id
      }
      myTierLists(first: $first) {
        __typename
        ... on TierListConnection {
          edges {
            node {
              __typename
              id
              name
              listType
              createdById
            }
          }
        }
        ...ActorErrorFields
      }
      place(id: $placeId) {
        __typename
        ... on Place {
          id
          tierListEntries(first: $first) {
            edges {
              node {
                id
                band
                tierListId
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

// ---------------------------------------------------------------------------
// Mutations (the old server actions' Hasura documents)
// ---------------------------------------------------------------------------

export const AddTierListMutation = graphql(
  `
    mutation AddTierList($input: CreateTierListInput!) {
      createTierList(input: $input) {
        __typename
        ... on TierList {
          id
        }
        ...ActorErrorFields
      }
    }
  `,
  [ActorErrorFieldsFragment],
);

/** Only the fields passed are written; also the editing lock. */
export const EditTierListMutation = graphql(
  `
    mutation EditTierList($id: ID!, $input: UpdateTierListInput!) {
      updateTierList(tierListId: $id, input: $input) {
        __typename
        ... on TierList {
          id
          isEditingLocked
        }
        ...ActorErrorFields
      }
    }
  `,
  [ActorErrorFieldsFragment],
);

/** Cascades to the list's entries (B7). */
export const DeleteTierListMutation = graphql(
  `
    mutation DeleteTierList($id: ID!) {
      deleteTierList(tierListId: $id) {
        __typename
        ... on DeletedTierList {
          id
        }
        ...ActorErrorFields
      }
    }
  `,
  [ActorErrorFieldsFragment],
);

/**
 * `tierListItemId` is minted client-side so a retried add is idempotent; the
 * server appends at the end of `band` (no max-position read-then-insert race).
 */
export const AddItemToTierListMutation = graphql(
  `
    mutation AddItemToTierList(
      $tierListId: ID!
      $input: AddTierListItemInput!
    ) {
      addTierListItem(tierListId: $tierListId, input: $input) {
        __typename
        ... on TierListItem {
          id
          band
          position
          entryType
        }
        ...ActorErrorFields
      }
    }
  `,
  [ActorErrorFieldsFragment],
);

export const RemoveItemFromTierListMutation = graphql(
  `
    mutation RemoveItemFromTierList($tierListId: ID!, $id: ID!) {
      removeTierListItem(tierListId: $tierListId, tierListItemId: $id) {
        __typename
        ... on RemovedTierListItem {
          id
        }
        ...ActorErrorFields
      }
    }
  `,
  [ActorErrorFieldsFragment],
);

/**
 * `orderedIds` is the band's **full** membership (B7). One call per drag: the
 * destination band, with a cross-band arrival included — the server renumbers
 * the band it left in the same transaction.
 */
export const ReorderBandMutation = graphql(
  `
    mutation ReorderBand($tierListId: ID!, $band: Int!, $orderedIds: [ID!]!) {
      reorderTierListBand(
        tierListId: $tierListId
        band: $band
        orderedIds: $orderedIds
      ) {
        __typename
        ... on ReorderBandPayload {
          band
        }
        ...ActorErrorFields
      }
    }
  `,
  [ActorErrorFieldsFragment],
);

// ---------------------------------------------------------------------------
// In-page add (AddEntryModal) — kept from the rewrite
// ---------------------------------------------------------------------------

export const PICKER_PAGE_SIZE = 20;

/** Items of the list's type, by phrase (`ItemSearchActor`, embeds the text). */
export const TierListItemPickerQuery = graphql(
  `
    query TierListItemPicker(
      $text: String!
      $itemTypes: [ItemType!]
      $first: Int!
    ) {
      itemSearch(text: $text, itemTypes: $itemTypes, first: $first, limit: 25) {
        __typename
        ... on ItemSearchConnection {
          edges {
            cursor
            node {
              id
              type
              name
              item {
                __typename
                id
                country
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
 * Places by phrase, with no `bounds`: a tier list is not a viewport, and
 * `placeSearch` without bounds searches globally.
 */
export const TierListPlacePickerQuery = graphql(
  `
    query TierListPlacePicker($query: String!, $first: Int!) {
      placeSearch(query: $query, first: $first) {
        __typename
        ... on PlaceSearchConnection {
          edges {
            cursor
            node {
              id
              name
              place {
                id
                name
                displayName
                primaryCategory
                locality
                countryCode
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
