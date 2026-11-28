/**
 * The drink log's documents (X02, D5, D8).
 *
 * One rating per item (the review) and **many logs**: `logDrink` writes an
 * entry with an optional score, note, flavour tags, place, photo and
 * companions, with or without a bottle. The sheet mints the entry's id up
 * front, which makes a retry the same log and is what Undo deletes.
 *
 * `suggestFlavourTags` is an abstaining AI seam: it answers only words the
 * note itself contains, and the sheet shows them as `source="suggested"`
 * chips that do nothing until tapped.
 */
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";

/** One entry, as "Your log" and the sheet's edit mode read it. */
export const DrinkLogEntryFragment = graphql(`
  fragment DrinkLogEntry on ItemCheckIn {
    __typename
    id
    createdAt
    score
    note
    tags
    isMine
    canRemove
    fromCellar
    userId
    createdById
    companionIds
    user {
      __typename
      id
      displayName
      avatarUrl
    }
    companions(first: 20) {
      edges {
        node {
          __typename
          id
          displayName
          avatarUrl
        }
      }
    }
    place {
      __typename
      id
      name
      displayName
    }
    photo {
      __typename
      id
      url
    }
  }
`);

/** "Your log" (D8): the viewer's own entries on one item, newest first. */
export const ItemDrinkLogQuery = graphql(
  `
  query ItemDrinkLog($type: ItemType!, $itemId: ID!, $first: Int!) {
    item(type: $type, id: $itemId) {
      __typename
      ... on QueryItemSuccess {
        data {
          __typename
          id
          checkIns(first: $first, scope: MINE) {
            totalCount
            edges {
              node {
                ...DrinkLogEntry
              }
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [DrinkLogEntryFragment, ActorErrorFieldsFragment],
);

export const LogDrinkMutation = graphql(
  `
  mutation LogDrink($id: ID!, $input: LogDrinkInput!) {
    logDrink(id: $id, input: $input) {
      __typename
      ... on LoggedDrinkPayload {
        drinkerCount
        entryIds
        entry {
          id
          ...DrinkLogEntry
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [DrinkLogEntryFragment, ActorErrorFieldsFragment],
);

export const UpdateDrinkLogMutation = graphql(
  `
  mutation UpdateDrinkLog($id: ID!, $input: UpdateDrinkLogInput!) {
    updateDrinkLog(id: $id, input: $input) {
      __typename
      ... on ItemCheckIn {
        ...DrinkLogEntry
      }
      ...ActorErrorFields
    }
  }
`,
  [DrinkLogEntryFragment, ActorErrorFieldsFragment],
);

export const DeleteDrinkLogMutation = graphql(
  `
  mutation DeleteDrinkLog($id: ID!) {
    deleteDrinkLog(id: $id) {
      __typename
      ... on DeletedDrinkLogPayload {
        ids
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/**
 * Who else was there, after the fact (X03): the whole new set. Only on your
 * own entry of a drink you logged.
 */
export const SetDrinkLogCompanionsMutation = graphql(
  `
  mutation SetDrinkLogCompanions($id: ID!, $companionIds: [ID!]!) {
    setDrinkLogCompanions(id: $id, companionIds: $companionIds) {
      __typename
      ... on ItemCheckIn {
        ...DrinkLogEntry
      }
      ...ActorErrorFields
    }
  }
`,
  [DrinkLogEntryFragment, ActorErrorFieldsFragment],
);

/**
 * Undo of `deleteDrinkLog` (X03): the same entries back — ids, dates and
 * companions — for whoever removed them, within the hour.
 */
export const RestoreDrinkLogMutation = graphql(
  `
  mutation RestoreDrinkLog($id: ID!) {
    restoreDrinkLog(id: $id) {
      __typename
      ... on RestoredDrinkLogPayload {
        ids
        entry {
          id
          ...DrinkLogEntry
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [DrinkLogEntryFragment, ActorErrorFieldsFragment],
);

export const SuggestFlavourTagsMutation = graphql(
  `
  mutation SuggestFlavourTags(
    $logId: ID!
    $note: String!
    $itemType: ItemType!
    $existing: [String!]
  ) {
    suggestFlavourTags(
      logId: $logId
      note: $note
      itemType: $itemType
      existing: $existing
    ) {
      __typename
      ... on FlavourTagSuggestionsPayload {
        abstained
        suggestions(first: 6) {
          edges {
            node {
              tag
              evidence
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

/** Places by phrase, for "Where?" — no bounds: a log is not a viewport. */
export const DrinkLogPlacePickerQuery = graphql(
  `
  query DrinkLogPlacePicker($query: String!, $first: Int!) {
    placeSearch(query: $query, first: $first) {
      __typename
      ... on PlaceSearchConnection {
        edges {
          node {
            id
            place {
              __typename
              id
              name
              displayName
              locality
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
 * C3 "Check this": the label read's guesses the creator never confirmed
 * (`Item.unconfirmedFields`, empty for anyone else and for an item not
 * created from a read). Here rather than beside the edit page because this
 * module is one documents.test.ts validates; it belongs in an item module.
 */
export const ItemUncheckedFieldsQuery = graphql(
  `
  query ItemUncheckedFields($itemId: ID!, $type: ItemType!) {
    item(id: $itemId, type: $type) {
      __typename
      ... on QueryItemSuccess {
        data {
          __typename
          id
          unconfirmedFields
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);
