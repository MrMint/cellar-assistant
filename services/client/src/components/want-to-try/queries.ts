/**
 * X08's documents: the one mutation every Save target sends, the Me › Lists
 * "Want to try" page, and the map's want-to-go pins.
 *
 * The mutation selects each target's own state field — `Item.isWantToTry`,
 * `Recipe.isWantToTry`, `PlaceInteraction.wantToVisit` — so graphcache
 * normalises the answer onto every other query showing the same thing.
 */
import { PlaceInteractionFragment } from "@/components/map/queries";
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";

/** Rows per page on the list. The API caps any `first` at 100. */
export const WANT_TO_TRY_PAGE_SIZE = 50;
/** Pages of want-to-go places the map reads for its pins (100 each). */
export const WANT_TO_GO_PIN_PAGES = 5;

export const SetWantToTryMutation = graphql(
  `
  mutation SetWantToTry($target: WantToTryTargetInput!, $wantToTry: Boolean!) {
    setWantToTry(target: $target, wantToTry: $wantToTry) {
      __typename
      ... on SetWantToTryPayload {
        wantToTry
        changed
        kind
        key
        item {
          __typename
          id
          isWantToTry
        }
        recipe {
          __typename
          id
          isWantToTry
        }
        place {
          __typename
          id
          myInteraction {
            ...MapPlaceInteraction
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  // The whole interaction, not just `wantToVisit`: a place the viewer had
  // never touched has no row in the cache, and a partial one would send the
  // place sheet back to the network for the fields it lacks.
  [ActorErrorFieldsFragment, PlaceInteractionFragment],
);

export const WantToTryEntryFragment = graphql(`
  fragment WantToTryEntry on WantToTryEntry @_unmask {
    __typename
    key
    kind
    savedAt
    item {
      __typename
      id
      type
      name
      country
      isWantToTry
      images(first: 1) {
        edges {
          node {
            __typename
            id
            file {
              __typename
              id
              url
            }
          }
        }
      }
      ... on Wine {
        vintage
      }
      ... on Sake {
        vintageYear
      }
    }
    recipe {
      __typename
      id
      name
      type
      imageUrl
      isWantToTry
    }
    place {
      __typename
      id
      name
      displayName
      primaryCategory
      locality
    }
  }
`);

export const WantToTryListQuery = graphql(
  `
  query WantToTryList(
    $first: Int!
    $after: String
    $kinds: [WantToTryKind!]
  ) {
    me {
      __typename
      id
      wantToTry(first: $first, after: $after, kinds: $kinds) {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          cursor
          node {
            ...WantToTryEntry
          }
        }
      }
    }
  }
`,
  [WantToTryEntryFragment],
);

/** The ids of the viewer's want-to-go places, for the map's pins. */
export const WantToGoPlacesQuery = graphql(`
  query WantToGoPlaces($first: Int!, $after: String) {
    me {
      __typename
      id
      wantToTry(first: $first, after: $after, kinds: [PLACE]) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            __typename
            key
            place {
              __typename
              id
            }
          }
        }
      }
    }
  }
`);

/**
 * Insights' "Try this next" made actionable (X08): the AI's suggestion is a
 * style, never a product (its prompt forbids one), so the bottles offered
 * under it come from a catalog search for that phrase — real rows, ranked by
 * the search, not invented by the model. Run only when asked (one tap).
 */
export const TryThisNextSearchQuery = graphql(
  `
  query TryThisNextSearch(
    $text: String!
    $itemTypes: [ItemType!]
    $limit: Int
    $first: Int
  ) {
    itemSearch(text: $text, itemTypes: $itemTypes, limit: $limit, first: $first) {
      __typename
      ... on ItemSearchConnection {
        edges {
          node {
            id
            type
            name
            item {
              __typename
              id
              type
              name
              isWantToTry
              ... on Wine {
                vintage
              }
              ... on Sake {
                vintageYear
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
