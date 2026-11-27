/**
 * The onboarding wizard's own document — the successor of
 * `82450ad1:src/components/common/OnboardingWizard/actors/searchByBarcode.ts`'s
 * `SearchByBarcode` (`barcodes_by_pk { wines beers spirits coffees }`, four
 * `*ItemCardFragment`s and a `$userId` for the viewer's own review count).
 *
 * Now `barcode(code:)` → `items`, a connection over all six types, each node
 * spread with the one `ItemCard` fragment (`item/ItemCard/fragments.ts`).
 * No `userId`: `Item.myReview` is the viewer's from the session.
 *
 * Everything else the wizard sends is already in `lib/api/items.ts`
 * (`StartItemOnboardingMutation`, `ConfirmItemOnboardingMutation`,
 * `ItemSummaryQuery`, `EnsureBarcodeMutation`, `LinkBarcodeItemMutation`,
 * `AttachItemImageMutation`, `AddItemToCellarFromItemMutation`).
 */

import { ItemCardFragment } from "@/components/item/ItemCard/fragments";
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";

/**
 * Items sharing one scanned code. A real code names one product and a few
 * near-duplicates at most; the old query had no limit at all, and each node
 * here resolves through the item loader, so one page is capped well under the
 * API's 100.
 */
export const BARCODE_MATCHES_LIMIT = 24;

export const OnboardingBarcodeQuery = graphql(
  `
  query OnboardingBarcodeMatches($code: String!, $first: Int!) {
    barcode(code: $code) {
      __typename
      ... on Barcode {
        barcodeCode: code
        items(first: $first) {
          edges {
            node {
              ...ItemCard
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ItemCardFragment, ActorErrorFieldsFragment],
);

/**
 * `82450ad1:…/actors/searchByImage.ts`'s `GetImageVector` + `ImageSearchQuery`
 * (`image_search … distance <= 0.3, limit: 10`, four `*ItemCardFragment`s) as
 * one document: `itemSearch(imageFileId:)` embeds the display photo and
 * matches it server-side (G32). `itemTypes` narrows it to the type being
 * added — see `searchByImage`.
 */
export const OnboardingImageMatchQuery = graphql(
  `
  query OnboardingImageMatches(
    $imageFileId: ID!
    $itemTypes: [ItemType!]
    $first: Int!
  ) {
    itemSearch(imageFileId: $imageFileId, itemTypes: $itemTypes, first: $first) {
      __typename
      ... on ItemSearchConnection {
        edges {
          node {
            item {
              ...ItemCard
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ItemCardFragment, ActorErrorFieldsFragment],
);

/**
 * N19: after the label is read, the name goes to `itemSearch(text:)`,
 * narrowed to the type being added, so the wizard can lead with "Is it this
 * one? +1 bottle" instead of minting a second row for a bottle the catalogue
 * already holds. `distance` ranks the hits; the vintage is compared
 * explicitly afterwards (`catalog-match.ts`), never trusted to the embedding.
 */
export const CATALOG_MATCH_LIMIT = 5;
/** Similarity 0.75 and up — near enough to ask about, never to auto-add. */
export const CATALOG_MATCH_MAX_DISTANCE = 0.5;

export const OnboardingCatalogMatchQuery = graphql(
  `
  query OnboardingCatalogMatches(
    $text: String!
    $itemTypes: [ItemType!]
    $first: Int!
    $limit: Int!
    $maxDistance: Float!
  ) {
    itemSearch(
      text: $text
      itemTypes: $itemTypes
      first: $first
      limit: $limit
      maxDistance: $maxDistance
    ) {
      __typename
      ... on ItemSearchConnection {
        edges {
          node {
            __typename
            distance
            item {
              ...ItemCard
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ItemCardFragment, ActorErrorFieldsFragment],
);

/**
 * Brands the onboarding form's `BrandPicker` offers — the old
 * `SearchBrands($search: "%term%", limit: 10)` over `brands(_ilike)`. Now
 * `brandSearch(term:)`, which takes a term rather than a pattern (so
 * `escapeLike` goes) and holds at most `limit` results.
 */
export const BRAND_PICKER_LIMIT = 10;

export const BrandPickerSearchQuery = graphql(
  `
  query BrandPickerSearch($term: String!, $limit: Int!, $first: Int!) {
    brandSearch(term: $term, limit: $limit, first: $first) {
      __typename
      ... on BrandSearchConnection {
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

/**
 * "Finish later" (MC-drafts, DECISIONS 34): keep the unfinished bottle on the
 * account, aimed at a cellar. The server refuses someone else's onboarding or
 * a cellar the viewer cannot write (`NotFoundError`).
 */
export const SaveDraftMutation = graphql(
  `
  mutation SaveOnboardingDraft($input: SaveDraftInput!) {
    saveDraft(input: $input) {
      __typename
      ... on ItemOnboarding {
        id
        status
        cellarId
        confirmedFields
        vintageAnswer
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);
