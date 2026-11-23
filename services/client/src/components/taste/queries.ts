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
      itemType
      shared
      agreed
    }
  }
`);

/** `/taste-profile`: your archetype, what it is built from, your friends. */
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
            itemType
            count
          }
          archetype {
            key
            title
            loves {
              itemType
              label
            }
          }
        }
        ...ActorErrorFields
      }
      friendTasteAgreements {
        __typename
        ... on QueryFriendTasteAgreementsSuccess {
          data {
            ...TasteAgreementFields
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
