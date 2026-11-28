/**
 * X19 — the catalog correction loop's documents: the item's brand and AI
 * helpers for its edit page, D8's one-tap brand change, and the two model
 * calls that only ever *propose* (`rereadItemLabel`, `suggestItemDetails`).
 *
 * Kept apart from `items.ts` because nothing else reads them, and every
 * mutation here is creator-only on the server — the UI hides them from anyone
 * else, but the actors are what refuse.
 */
import { ActorErrorFieldsFragment } from "./errors.ts";
import { graphql } from "./graphql.ts";

/**
 * What the edit page needs beyond the item's own columns: its brands (the
 * picker starts from the primary one) and which AI helpers it supports for
 * this viewer (`correction`, null unless they created it).
 */
export const ItemCorrectionQuery = graphql(
  `
  query ItemCorrection($itemId: ID!, $type: ItemType!) {
    item(id: $itemId, type: $type) {
      __typename
      ... on QueryItemSuccess {
        data {
          __typename
          id
          correction {
            __typename
            canRereadLabel
            canSuggestDetails
          }
          brands(first: 20) {
            edges {
              node {
                __typename
                id
                isPrimary
                brand {
                  __typename
                  id
                  name
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

/** Find-or-create by name — the only brand-creation path a client has. */
export const ResolveBrandMutation = graphql(
  `
  mutation ResolveBrand($name: String!) {
    resolveBrand(name: $name) {
      __typename
      ... on Brand {
        id
        name
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/** D8: make `brandId` the primary and drop the one it corrects, in one turn. */
export const ReplaceItemBrandMutation = graphql(
  `
  mutation ReplaceItemBrand(
    $type: ItemType!
    $itemId: ID!
    $brandId: ID!
    $replacesBrandId: ID
  ) {
    replaceItemBrand(
      type: $type
      itemId: $itemId
      brandId: $brandId
      replacesBrandId: $replacesBrandId
    ) {
      __typename
      ... on ItemBrand {
        id
        isPrimary
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/** The edit form clearing the brand field. */
export const UnlinkItemBrandMutation = graphql(
  `
  mutation UnlinkItemBrand($type: ItemType!, $itemId: ID!, $brandId: ID!) {
    unlinkItemBrand(type: $type, itemId: $itemId, brandId: $brandId) {
      __typename
      ... on UnlinkedItemBrand {
        brandId
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/** "Re-read label": a fresh reading of the stored photographs. Writes nothing. */
export const RereadItemLabelMutation = graphql(
  `
  mutation RereadItemLabel($type: ItemType!, $itemId: ID!) {
    rereadItemLabel(type: $type, itemId: $itemId) {
      __typename
      ... on ItemLabelReading {
        defaults
        brandName
        confidence
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/** "Suggest details": a text-only pass for the empty fields. Writes nothing. */
export const SuggestItemDetailsMutation = graphql(
  `
  mutation SuggestItemDetails(
    $type: ItemType!
    $itemId: ID!
    $input: SuggestItemDetailsInput!
  ) {
    suggestItemDetails(type: $type, itemId: $itemId, input: $input) {
      __typename
      ... on ItemDetailSuggestions {
        abstained
        note
        defaults
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);
