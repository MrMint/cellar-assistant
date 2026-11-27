import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";

/**
 * X17's documents. The three `shared*` reads and `friendInvitePreview` are
 * the only fields the anonymous client (`lib/api/urql-anonymous.ts`) asks
 * for; the rest are the signed-in invite actions.
 *
 * Page sizes are the API's cap (100): a tier list is curated, and a list
 * longer than that says how many more there are and links to the app.
 */
export const SHARED_PAGE_SIZE = 100;

export const SharedTierListQuery = graphql(
  `
  query SharedTierList($id: ID!, $first: Int!) {
    sharedTierList(id: $id) {
      __typename
      ... on SharedTierList {
        id
        name
        description
        listType
        ownerDisplayName
        updatedAt
        entries(first: $first) {
          totalCount
          edges {
            node {
              id
              band
              position
              notes
              entryType
              entryId
              name
              location
              imageUrl
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
 * The tier list's preview card: the name, the author and enough of each entry
 * to rank the top three. No `imageUrl`, which is one `FileActor` presign per
 * entry — a crawler fetching the card would otherwise pay for a hundred
 * photos it never draws. Entries come `band desc, position asc`, so the first
 * page always holds the top three.
 */
export const SharedTierListCardQuery = graphql(
  `
  query SharedTierListCard($id: ID!, $first: Int!) {
    sharedTierList(id: $id) {
      __typename
      ... on SharedTierList {
        id
        name
        listType
        ownerDisplayName
        entries(first: $first) {
          totalCount
          edges {
            node {
              id
              band
              position
              name
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

export const SharedItemQuery = graphql(
  `
  query SharedItem($id: ID!, $type: ItemType!) {
    sharedItem(id: $id, type: $type) {
      __typename
      ... on SharedItem {
        id
        type
        name
        description
        country
        attributes
        imageUrl
        imagePlaceholder
        scoreAverage
        scoreCount
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

export const SharedRecipeQuery = graphql(
  `
  query SharedRecipe($id: ID!, $first: Int!) {
    sharedRecipe(id: $id) {
      __typename
      ... on SharedRecipe {
        id
        name
        description
        type
        difficultyLevel
        prepTimeMinutes
        servingSize
        imageUrl
        ingredients(first: $first) {
          edges {
            node {
              name
              quantity
              unit
              isOptional
            }
          }
        }
        instructions(first: $first) {
          edges {
            node {
              stepNumber
              text
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

export const FriendInvitePreviewQuery = graphql(
  `
  query FriendInvitePreview($token: String!) {
    friendInvitePreview(token: $token) {
      __typename
      ... on FriendInvitePreview {
        inviterId
        inviterDisplayName
        inviterAvatarUrl
        status
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

export const MyFriendInviteQuery = graphql(`
  query MyFriendInvite {
    me {
      id
      friendInvite {
        token
        createdAt
      }
    }
  }
`);

export const EnsureFriendInviteMutation = graphql(
  `
  mutation EnsureFriendInvite {
    ensureFriendInvite {
      __typename
      ... on FriendInvite {
        token
        createdAt
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

export const ResetFriendInviteMutation = graphql(
  `
  mutation ResetFriendInvite {
    resetFriendInvite {
      __typename
      ... on FriendInvite {
        token
        createdAt
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

export const AcceptFriendInviteMutation = graphql(
  `
  mutation AcceptFriendInvite($token: String!) {
    acceptFriendInvite(token: $token) {
      __typename
      ... on AcceptFriendInvitePayload {
        friendId
        becameFriends
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);
