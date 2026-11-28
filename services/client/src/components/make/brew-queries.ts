/**
 * ux-c L08 documents for the Steep / Brew guide (`item/BrewGuideSection`):
 * the tea's or coffee's style, the viewer's own numbers, and the write.
 */
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";

export const BrewPrefsFieldsFragment = graphql(`
  fragment BrewPrefsFields on BrewPrefs @_unmask {
    waterTempC
    steepSeconds
    doseGrams
    waterMl
    updatedAt
  }
`);

export const BrewGuideQuery = graphql(
  `
  query BrewGuide($id: ID!, $type: ItemType!) {
    item(id: $id, type: $type) {
      __typename
      ... on QueryItemSuccess {
        data {
          __typename
          id
          ... on Tea {
            category
            form
          }
          ... on Coffee {
            roastLevel
          }
          myBrewPrefs {
            ...BrewPrefsFields
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [BrewPrefsFieldsFragment, ActorErrorFieldsFragment],
);

export const SetBrewPrefsMutation = graphql(
  `
  mutation SetBrewPrefs(
    $itemType: ItemType!
    $itemId: ID!
    $waterTempC: Int
    $steepSeconds: Int
    $doseGrams: Float
    $waterMl: Float
  ) {
    setBrewPrefs(
      itemType: $itemType
      itemId: $itemId
      waterTempC: $waterTempC
      steepSeconds: $steepSeconds
      doseGrams: $doseGrams
      waterMl: $waterMl
    ) {
      __typename
      ... on SetBrewPrefsPayload {
        prefs {
          ...BrewPrefsFields
        }
        item {
          __typename
          id
          myBrewPrefs {
            ...BrewPrefsFields
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [BrewPrefsFieldsFragment, ActorErrorFieldsFragment],
);
