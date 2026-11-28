/**
 * The tier-list fragments — the successor of
 * `82450ad1:src/components/tier-list/fragments.ts`, on `TierList` /
 * `TierListItem` instead of the Hasura `tier_lists` / `tier_list_items` tables.
 *
 * Old field → new field:
 *
 * - `list_type`, `created_by_id`, `ai_insights`, `content_updated_at`, … →
 *   their camelCase SDL names.
 * - `items_aggregate { aggregate { count } }` → `itemCount`.
 * - `createdBy { id displayName avatarUrl }` → the same, on `UserProfile` (G4).
 * - `is_editing_locked` → nothing: the padlock is retired (X16; X23's
 *   Arrange replaced it), and the API no longer serves the flag.
 * - Seven nullable per-table relations (`place`, `wine`, … `tea`) →
 *   `entryType` plus `item: Item` / `place: Place`, exactly one non-null.
 * - The page's separate `GetUserItemReviews` round trip (the viewer's own
 *   score per item) → `Item.myReview { score }` (G7), on the row.
 * - X23: the **list owner's** score per item → `TierListItem.ownerReview`
 *   (a place rating stays its giver's: null for places).
 * - `place.user_place_interactions { rating }` (the viewer's own place
 *   rating) → `place.myInteraction { rating }` (G16, one batched call).
 * - `place.google_enrichment { google_rating google_user_ratings_total }` →
 *   `place.enrichment { googleRating googleUserRatingsTotal }`.
 *
 * The per-type subtitle fields are aliased per type: the same response name
 * may not carry two types across sibling inline fragments, and `type` is
 * already `Item.type: ItemType!` (a spirit's old `type` is `spiritType`).
 */

import { graphql } from "@/lib/api/graphql";

/** The header fields the detail page and the edit form read. */
export const TierListCoreFragment = graphql(`
  fragment TierListCore on TierList @_unmask {
    __typename
    id
    name
    description
    createdById
    privacy
    listType
    itemCount
    aiInsights
    insightsGeneratedAt
    insightsStatus
    insightsFailureReason
    insightsRetryAt
    contentUpdatedAt
    createdAt
    updatedAt
  }
`);

/** One ranked entry, with whichever side its `entryType` names. */
export const TierListItemFragment = graphql(`
  fragment TierListItem on TierListItem @_unmask {
    __typename
    id
    tierListId
    band
    position
    notes
    entryType
    createdAt
    updatedAt
    ownerReview {
      id
      score
    }
    place {
      id
      name
      displayName
      primaryCategory
      categories
      locality
      region
      countryCode
      myInteraction {
        id
        rating
      }
      enrichment {
        googleRating
        googleUserRatingsTotal
      }
      photos(first: 1) {
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
    }
    item {
      __typename
      id
      type
      name
      country
      myReview {
        id
        score
      }
      score {
        average
        count
      }
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
        wineVariety: variety
        wineVintage: vintage
        wineRegion: region
      }
      ... on Beer {
        beerStyle: style
      }
      ... on Spirit {
        spiritKind: spiritType
      }
      ... on Sake {
        sakeCategory: category
        sakeRegion: region
      }
      ... on Tea {
        teaCategory: category
        teaRegion: region
      }
    }
  }
`);

/** The edit form's initial values. */
export const TierListEditFragment = graphql(`
  fragment TierListEdit on TierList @_unmask {
    __typename
    id
    name
    description
    privacy
    listType
    createdById
    itemCount
  }
`);

/** One recorded edit, as Undo and Redo name it (D4). */
export const TierListRecordedEditFragment = graphql(`
  fragment TierListEditFields on TierListEdit @_unmask {
    __typename
    seq
    kind
    entryName
    fromBand
    toBand
    entryCount
  }
`);

/** Where the list's edit history stands — the owner's alone (D4). */
export const TierListEditHistoryFragment = graphql(
  `
    fragment TierListEditHistoryFields on TierListEditHistory @_unmask {
      __typename
      canUndo
      canRedo
      undo {
        ...TierListEditFields
      }
      redo {
        ...TierListEditFields
      }
    }
  `,
  [TierListRecordedEditFragment],
);
