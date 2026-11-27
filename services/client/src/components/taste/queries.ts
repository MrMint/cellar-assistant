import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";

/** One agreement row: counts only, and `agreed` null below the gate. */
export const TasteAgreementFieldsFragment = graphql(`
  fragment TasteAgreementFields on TasteAgreement {
    userId
    name
    avatarUrl
    shared
    agreed
    byType {
      edges {
        node {
          itemType
          shared
          agreed
        }
      }
    }
  }
`);

/** `/taste-profile`: your archetype and the styles you rate highest, what it
 * is built from, your friends (on the profile, each list a connection: §1.5).
 * Under the API's row cost: 20 friends × 20 types is the widest nesting. */
export const TasteProfileQuery = graphql(
  `
    query TasteProfile {
      tasteProfile {
        __typename
        ... on TasteProfile {
          ratingCount
          line
          linePhrasedByAi
          types {
            edges {
              node {
                itemType
                count
              }
            }
          }
          archetype {
            key
            title
            loves(first: 4) {
              edges {
                node {
                  itemType
                  label
                  average
                  count
                }
              }
            }
          }
          friends {
            __typename
            ... on TasteAgreementConnection {
              edges {
                node {
                  ...TasteAgreementFields
                }
              }
            }
            ...ActorErrorFields
          }
        }
        ...ActorErrorFields
      }
    }
  `,
  [ActorErrorFieldsFragment, TasteAgreementFieldsFragment],
);

/** FriendProfile's compare section: agreement with this one person. */
export const TasteAgreementQuery = graphql(
  `
    query TasteAgreement($userId: ID!) {
      tasteAgreement(userId: $userId) {
        __typename
        ... on TasteAgreement {
          ...TasteAgreementFields
        }
        ...ActorErrorFields
      }
    }
  `,
  [ActorErrorFieldsFragment, TasteAgreementFieldsFragment],
);

/** A PRIVATE copy of a list you may see (L03). Undo is `deleteTierList`. */
export const CloneTierListMutation = graphql(
  `
    mutation CloneTierList($sourceTierListId: ID!) {
      cloneTierList(sourceTierListId: $sourceTierListId) {
        __typename
        ... on TierList {
          id
          name
        }
        ...ActorErrorFields
      }
    }
  `,
  [ActorErrorFieldsFragment],
);
