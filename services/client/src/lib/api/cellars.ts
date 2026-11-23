/**
 * Every GraphQL document the cellars pages use (D2).
 *
 * One module rather than one per component, because the documents are small,
 * the fragments are shared across four routes, and gql.tada's fragment
 * composition wants the fragment in scope where the query is written.
 *
 * Read against `packages/schema/schema.graphql`, not against Hasura: there is
 * no `where`, no `_aggregate`, no `on_conflict`. Filtering is an argument or it
 * does not exist, counts are fields (`Cellar.itemCount`), and idempotency is a
 * client-minted id (`AddCellarItemInput.cellarItemId`, `checkIn(checkInId:)`).
 */

import { ActorErrorFieldsFragment } from "./errors.ts";
import { graphql } from "./graphql.ts";

// ---------------------------------------------------------------------------
// Fragments
// ---------------------------------------------------------------------------

/**
 * What a cellar looks like on a card.
 *
 * `coOwnerIds` and `createdById` are here because the *viewer's* relationship
 * to the cellar decides whether the edit, add and delete controls render. The API deliberately does not answer that
 * question for us — `myCellars` is `canSeeCellar`, a superset of "mine".
 */
export const CellarCardFragment = graphql(`
  fragment CellarCard on Cellar {
    __typename
    id
    name
    privacy
    itemCount
    createdById
    coOwnerIds
    createdAt
    updatedAt
  }
`);

/** One bottle, as a row or a card. */
export const CellarItemRowFragment = graphql(`
  fragment CellarItemRow on CellarItem {
    __typename
    id
    cellarId
    createdAt
    createdBy
    openAt
    emptyAt
    percentageRemaining
    displayImageId
    # Null except on a semanticQuery page, where it is the cosine distance.
    distance
    sourceType
    item {
      id
      type
      name
      description
      country
      score {
        average
        count
      }
    }
  }
`);

/**
 * One drink.
 *
 * `CheckIn` carries ids and nothing else — no drinker profile, no item. That is
 * C3's deliberate shape: the check-in mutations echo it back.
 */
export const CheckInRowFragment = graphql(`
  fragment CheckInRow on CheckIn {
    __typename
    id
    userId
    cellarItemId
    createdAt
  }
`);

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** One cellar's header fields (`/cellars/[cellarId]/items/add`). */
export const CellarHeaderQuery = graphql(
  `
  query CellarHeader($cellarId: ID!) {
    cellar(id: $cellarId) {
      __typename
      ... on Cellar {
        ...CellarCard
      }
      ...ActorErrorFields
    }
  }
`,
  [CellarCardFragment, ActorErrorFieldsFragment],
);

/** The signed-in viewer. `me` is null for an anonymous request, never an error. */
export const ViewerQuery = graphql(`
  query Viewer {
    me {
      id
      email
      role
      profile {
        id
        displayName
        avatarUrl
      }
    }
  }
`);

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const CreateCellarMutation = graphql(
  `
  mutation CreateCellar($input: CreateCellarInput!) {
    createCellar(input: $input) {
      __typename
      ... on Cellar {
        ...CellarCard
      }
      ...ActorErrorFields
    }
  }
`,
  [CellarCardFragment, ActorErrorFieldsFragment],
);

export const UpdateCellarMutation = graphql(
  `
  mutation UpdateCellar($cellarId: ID!, $input: UpdateCellarInput!) {
    updateCellar(cellarId: $cellarId, input: $input) {
      __typename
      ... on Cellar {
        ...CellarCard
      }
      ...ActorErrorFields
    }
  }
`,
  [CellarCardFragment, ActorErrorFieldsFragment],
);

/**
 * Creator only, and a `ConflictError` while the cellar still holds bottles —
 * which the UI pre-empts by disabling delete on a non-empty cellar, and still
 * renders the message if the count was stale.
 */
export const DeleteCellarMutation = graphql(
  `
  mutation DeleteCellar($cellarId: ID!) {
    deleteCellar(cellarId: $cellarId) {
      __typename
      ... on DeletedCellar {
        id
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

export const RemoveItemFromCellarMutation = graphql(
  `
  mutation RemoveItemFromCellar($cellarId: ID!, $cellarItemId: ID!) {
    removeItemFromCellar(cellarId: $cellarId, cellarItemId: $cellarItemId) {
      __typename
      ... on RemovedCellarItem {
        id
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/** Idempotent: an already-open bottle keeps its `openAt`. */
export const OpenCellarItemMutation = graphql(
  `
  mutation OpenCellarItem($cellarId: ID!, $cellarItemId: ID!) {
    openCellarItem(cellarId: $cellarId, cellarItemId: $cellarItemId) {
      __typename
      ... on CellarItem {
        ...CellarItemRow
      }
      ...ActorErrorFields
    }
  }
`,
  [CellarItemRowFragment, ActorErrorFieldsFragment],
);

/** Idempotent, and implies open. */
export const EmptyCellarItemMutation = graphql(
  `
  mutation EmptyCellarItem($cellarId: ID!, $cellarItemId: ID!) {
    emptyCellarItem(cellarId: $cellarId, cellarItemId: $cellarItemId) {
      __typename
      ... on CellarItem {
        ...CellarItemRow
      }
      ...ActorErrorFields
    }
  }
`,
  [CellarItemRowFragment, ActorErrorFieldsFragment],
);

/**
 * L02: a bottle's own dates, price and place, and the item fields the
 * shelf-life table keys on. Owner-only on the server: anyone else reads null.
 */
export const BottleFreshnessFragment = graphql(`
  fragment BottleFreshness on CellarItem {
    __typename
    id
    openAt
    emptyAt
    packagedOn
    acquiredOn
    drinkFrom
    drinkUntil
    priceAmount
    priceCurrency
    location
  }
`);

/** The bottle page's freshness card: the bottle, and its item's style keys. */
export const BottleFreshnessQuery = graphql(
  `
  query BottleFreshness($cellarId: ID!, $cellarItemId: ID!) {
    cellar(id: $cellarId) {
      __typename
      ... on Cellar {
        id
        item(id: $cellarItemId) {
          ...BottleFreshness
          item {
            __typename
            id
            type
            ... on Wine {
              wineStyle: style
              vintage
            }
            ... on Beer {
              beerStyle: style
            }
            ... on Spirit {
              spiritType
            }
            ... on Sake {
              category
              vintageYear
            }
            ... on Tea {
              teaCategory: category
              form
            }
          }
        }
      }
    }
  }
`,
  [BottleFreshnessFragment],
);

/**
 * A partial patch of one bottle. The client's one use is Undo after
 * finishing (N13a): `emptyAt: null` puts the bottle back in the cellar.
 */
export const UpdateCellarItemMutation = graphql(
  `
  mutation UpdateCellarItem(
    $cellarId: ID!
    $cellarItemId: ID!
    $input: UpdateCellarItemInput!
  ) {
    updateCellarItem(
      cellarId: $cellarId
      cellarItemId: $cellarItemId
      input: $input
    ) {
      __typename
      ... on CellarItem {
        ...CellarItemRow
        ...BottleFreshness
      }
      ...ActorErrorFields
    }
  }
`,
  [CellarItemRowFragment, BottleFreshnessFragment, ActorErrorFieldsFragment],
);

export const SetCellarItemPercentageMutation = graphql(
  `
  mutation SetCellarItemPercentage(
    $cellarId: ID!
    $cellarItemId: ID!
    $percentageRemaining: Float!
  ) {
    setCellarItemPercentage(
      cellarId: $cellarId
      cellarItemId: $cellarItemId
      percentageRemaining: $percentageRemaining
    ) {
      __typename
      ... on CellarItem {
        ...CellarItemRow
      }
      ...ActorErrorFields
    }
  }
`,
  [CellarItemRowFragment, ActorErrorFieldsFragment],
);

/**
 * "I drank some of this."
 *
 * `checkInId` is minted by the caller so a retry after a dropped response
 * writes one row, not two (§8.4). Requires the cellar to be *visible*, not
 * owned — checking in to a friend's bottle at their table is the point.
 */
export const CheckInMutation = graphql(
  `
  mutation CheckIn($cellarId: ID!, $cellarItemId: ID!, $checkInId: ID) {
    checkIn(
      cellarId: $cellarId
      cellarItemId: $cellarItemId
      checkInId: $checkInId
    ) {
      __typename
      ... on CheckIn {
        ...CheckInRow
      }
      ...ActorErrorFields
    }
  }
`,
  [CheckInRowFragment, ActorErrorFieldsFragment],
);

/**
 * The same drink, for everyone at the table.
 *
 * Every id must be the viewer or a friend of theirs; one that is not rejects
 * the whole call, so the picker only offers friends.
 */
export const BulkCheckInMutation = graphql(
  `
  mutation BulkCheckIn($cellarId: ID!, $cellarItemId: ID!, $userIds: [ID!]!) {
    bulkCheckIn(
      cellarId: $cellarId
      cellarItemId: $cellarItemId
      userIds: $userIds
    ) {
      __typename
      ... on BulkCheckInPayload {
        cellarItemId
        checkIns(first: 50) {
          totalCount
          edges {
            node {
              ...CheckInRow
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [CheckInRowFragment, ActorErrorFieldsFragment],
);

/**
 * The viewer's friends, for the bulk check-in picker and the cellar forms'
 * co-owner picker. `after` is optional: the cellar forms walk every page
 * (`useWholeConnection`), as the old unbounded `user.friends` read did.
 */
export const MyFriendsQuery = graphql(
  `
  query MyFriendsForCheckIn($first: Int!, $after: String) {
    myFriends(first: $first, after: $after) {
      __typename
      ... on FriendConnection {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            user {
              id
              displayName
              avatarUrl
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
