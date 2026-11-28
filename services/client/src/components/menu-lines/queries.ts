/**
 * X07 — the documents behind a menu line's actions. The line itself is
 * `MapMenuLine` (`map/queries.ts`), which now carries `canCorrectMatch` and
 * `forYou`; these are what the line sheet asks or changes.
 */

import { MenuLineFragment } from "@/components/map/queries";
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";

/**
 * "Not this" (`match: null`) and "That's it" (a candidate) — the scan
 * owner's correction of a line's match. Selects the whole line back so the
 * cache redraws it in place.
 */
export const VerifyMenuLineMatchMutation = graphql(
  `
  mutation VerifyMenuLineMatch(
    $placeId: ID!
    $menuItemId: ID!
    $match: MenuItemMatchInput
  ) {
    verifyMenuItemMatch(
      placeId: $placeId
      menuItemId: $menuItemId
      match: $match
    ) {
      __typename
      ... on PlaceMenuItem {
        ...MapMenuLine
      }
      ...ActorErrorFields
    }
  }
`,
  [MenuLineFragment, ActorErrorFieldsFragment],
);

/**
 * "Is it one of these?" — catalog rows for an unmatched line's name, inside
 * its type. Real rows ranked by the search; a guess is offered as a
 * question, never filed as an answer.
 */
export const MenuLineCandidatesQuery = graphql(
  `
  query MenuLineCandidates($text: String!, $itemTypes: [ItemType!]) {
    itemSearch(text: $text, itemTypes: $itemTypes, limit: 3, first: 3) {
      __typename
      ... on ItemSearchConnection {
        edges {
          node {
            id
            type
            name
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/** The cellars "Add to cellar" can file into: the viewer's own and co-owned. */
export const MenuLineCellarsQuery = graphql(
  `
  query MenuLineCellars {
    myCellars(first: 100, section: MINE) {
      __typename
      ... on CellarConnection {
        edges {
          node {
            __typename
            id
            name
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/** "Suggest details" on the Add-to-catalog draft — may abstain; writes nothing. */
export const SuggestNewItemDetailsMutation = graphql(
  `
  mutation SuggestNewItemDetails(
    $draftId: ID!
    $type: ItemType!
    $input: SuggestItemDetailsInput!
  ) {
    suggestNewItemDetails(draftId: $draftId, type: $type, input: $input) {
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

/** The onboarding a typed draft is confirmed through (no model call). */
export const OpenItemDraftMutation = graphql(
  `
  mutation OpenItemDraft($draftId: ID!, $type: ItemType!) {
    openItemDraft(draftId: $draftId, type: $type) {
      __typename
      ... on ItemOnboarding {
        id
        status
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);
