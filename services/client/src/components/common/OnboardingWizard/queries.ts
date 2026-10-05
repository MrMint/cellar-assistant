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
