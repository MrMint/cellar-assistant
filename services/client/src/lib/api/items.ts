/**
 * Every GraphQL document the item pages, the add flow and the onboarding
 * wizard use (D3).
 *
 * Written against `packages/schema/schema.graphql`. Three things about that
 * schema shape everything here:
 *
 * 1. **`Item` is an interface over six physical tables.** `ItemActor` is one
 *    actor keyed `type:itemId`; the six concrete types differ only in their
 *    attribute columns. So the shared half is one fragment on `Item` and the
 *    per-type half is six inline fragments inside it.
 * 2. **`item`, `createItem` and `updateItem` use `errors: { directResult: false }`** —
 *    Pothos cannot wrap an interface-returning field — so their success branch
 *    is `QueryItemSuccess { data }` / `Mutation…Success { data }` rather than
 *    the item itself. Everything else in the schema returns the value directly.
 *    `unwrapResult` narrows both.
 * 3. **A fragment spread into a union branch types as `never` unless the
 *    fragment itself selects `__typename`** (D2 lost a debugging round to
 *    this). Every fragment below selects it, including the inline ones.
 *
 * Every error branch is `...ActorErrorFields` (`errors.ts`), which selects
 * `__typename`, `code`, `reason` and `message`. `reason` was once left out of
 * these documents because a running API had not picked it up yet; the API
 * has served it since, and `ApiFailure` now carries it, so a page that has to
 * tell two Conflicts apart can.
 *
 * `generic` is deliberately absent. `GenericItem` is not an `Item` — it has no
 * images, vector, reviews, brands, favourites or cellar membership, and its
 * only referent is `recipe_ingredients` (B2, decided against the database).
 */

import { ActorErrorFieldsFragment } from "./errors.ts";
import { graphql } from "./graphql.ts";

// ---------------------------------------------------------------------------
// Fragments
// ---------------------------------------------------------------------------

/**
 * The half of an item that does not depend on which table it lives in.
 *
 * `barcode` is here because it is on the interface: `ItemActor` reads the
 * `barcode_code` column, and the `barcodes` row it names is a separate
 * aggregate reached through `barcode(code:)`.
 */
export const ItemCoreFragment = graphql(`
  fragment ItemCore on Item {
    __typename
    id
    type
    name
    description
    country
    barcode
    createdById
    createdAt
    updatedAt
    score {
      average
      count
    }
  }
`);

/**
 * The per-type attribute columns, as six inline fragments.
 *
 * Each selects `__typename` of its own accord. `readFragment` on this hands
 * back a discriminated union of the six concrete types, which is exactly what
 * the attribute table wants to switch on.
 *
 * `vintage` is a `Date` on wine/beer/spirit and an `Int` on sake — where it is
 * called `vintageYear` on both the input and the object type, because one field
 * name may not have two types across siblings of an interface (A7c). Not a
 * mistake to unify.
 *
 * **Six fields used to be listed here as writable-and-not-readable**, and were
 * therefore not selected: `Wine.specialDesignation`,
 * `Wine.vineyardDesignation`, `Sake.riceVariety`, `Sake.servingTemperature`,
 * `Sake.vintageYear` and `Tea.cultivar`. This comment said that selecting one
 * was "a hard `GRAPHQL_VALIDATION_FAILED` that kills the whole document
 * (verified live)".
 *
 * **That is false, and all six are selected below.** Live introspection against
 * the running API on 2026-09-19 finds every one of them on its object type, and
 * so does the checked-in SDL; each was then read back through `item` and
 * `updateItem` individually. Whatever the original measurement caught — an
 * older API build, or the `style` conflict in the next comment down being
 * misattributed — the claim outlived it, and `ItemEditForm` was blanking those
 * six inputs on every visit because of it.
 *
 * The guard that replaces the claim is a type, not a sentence:
 * `AttributeKey<T>` in `itemFormRules.ts` requires a form field's key to exist
 * on both the `*AttributesInput` and the object type, so "writable but not
 * readable" is now a compile error rather than a comment. The live half —
 * whether the *deployed* schema agrees with the SDL these are checked against —
 * is `src/lib/dev-checks/item-form-keys.test.ts`.
 */
export const ItemAttributesFragment = graphql(`
  fragment ItemAttributes on Item {
    __typename
    ... on Wine {
      __typename
      vintage
      # Aliased: Wine.style is String! while Beer.style and Spirit.style are
      # String, and graphql-js applies its same-response-shape rule even across
      # mutually exclusive fragments. Selecting all three as "style" is a hard
      # GRAPHQL_VALIDATION_FAILED (verified live).
      wineStyle: style
      variety
      region
      specialDesignation
      vineyardDesignation
      alcoholContentPercentage
    }
    ... on Beer {
      __typename
      vintage
      beerStyle: style
      internationalBitternessUnit
      alcoholContentPercentage
    }
    ... on Spirit {
      __typename
      vintage
      spiritType
      spiritStyle: style
      alcoholContentPercentage
    }
    ... on Coffee {
      __typename
      roastLevel
      species
      cultivar
      process
    }
    ... on Sake {
      __typename
      sakeType
      category
      region
      polishGrade
      riceVariety
      servingTemperature
      # An Int year, not the Date the other five carry — which is why it is not
      # called "vintage" here. See the note above the fragment.
      vintageYear
      alcoholContentPercentage
      # UI parity G12.
      sakeMeterValue
      acidity
      aminoAcid
      yeastStrain
    }
    ... on Tea {
      __typename
      category
      form
      caffeineLevel
      # Also on Coffee, and String on both, so the same-response-shape rule is
      # satisfied even though the two fragments are mutually exclusive.
      cultivar
      region
      harvestYear
      # UI parity G13. The two booleans are tri-state: null is "not recorded".
      oxidationLevel
      processing
      ingredients
      steepingTemperature
      steepingTime
      flavorProfile
      isOrganic
      isFairTrade
    }
  }
`);

/**
 * One `item_image` row, **with the signed URL that renders it** (D10).
 *
 * `file { url }` is the one selection in this file that can fail on a data
 * problem rather than a request problem: `File.url` presigns, and `FileActor`
 * throws `ConflictError` when the file is not verified. `url` is `String!`
 * inside `File!` inside `ItemImage!`, so such a throw would null its way up
 * the whole connection.
 *
 * It is safe because every `item_image` row is verified by construction —
 * the invariant `ItemCardFragment` (`components/item/ItemCard/fragments.ts`)
 * also leans on for its `images(first: 1) { … file { url } }`. `ItemActor.attachImage` is the sole writer of that
 * table and refuses a file whose `verifiedAt` is null; `deleteFile` cannot
 * remove the row out from under it, because `item_image`'s foreign key is
 * `RESTRICT`. Widen the fragment's use and that invariant has to be rechecked.
 *
 * `urlExpiresAt` is deliberately not selected: it would cost a second presign
 * per image to learn a deadline nothing acts on. The tile re-reads the item
 * rather than refreshing a URL.
 */
export const ItemImageFragment = graphql(`
  fragment ItemImageRow on ItemImage {
    __typename
    id
    fileId
    itemId
    itemType
    isPublic
    placeholder
    userId
    createdAt
    file {
      __typename
      id
      url
      mimeType
    }
  }
`);

/** One `item_reviews` row. `text` is a `json` column whose shape the client owns. */
export const ItemReviewFragment = graphql(`
  fragment ItemReviewRow on ItemReview {
    __typename
    id
    itemId
    itemType
    score
    text
    userId
    createdAt
    updatedAt
  }
`);

/**
 * One drink of this item, from the item's side.
 *
 * **`cellarItemId` is deliberately absent from `ItemCheckIn`** and must not be
 * reconstituted: this list is gated on the looser `canSeeCheckIn` (author OR
 * friend-of-author), so naming the cellar item would leak a row id inside a
 * cellar the viewer may not be allowed to see. `Cellar.checkIns` is the surface
 * that says which bottle, and it is gated on `canSeeCellar` instead.
 */
export const ItemCheckInFragment = graphql(`
  fragment ItemCheckInRow on ItemCheckIn {
    __typename
    id
    userId
    createdAt
  }
`);

/** One `item_brands` link, with the brand it points at. */
export const ItemBrandFragment = graphql(`
  fragment ItemBrandRow on ItemBrand {
    __typename
    id
    isPrimary
    brand {
      __typename
      id
      name
      brandType
      logoUrl
    }
  }
`);

/** One label-scan session. Visible to its owner and nobody else. */
export const ItemOnboardingFragment = graphql(`
  fragment ItemOnboardingRow on ItemOnboarding {
    __typename
    id
    itemType
    status
    defaults
    confidence
    barcode
    barcodeType
    frontLabelImageId
    backLabelImageId
    aiModel
    userId
    createdAt
    updatedAt
  }
`);

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * `/{type}/[itemId]` — everything the detail page paints in one round trip.
 *
 * The success branch is `QueryItemSuccess { data }`, not `Item`: see the module
 * header. `NotFoundError` covers both "no such row" and "not yours to see"
 * (§1.6), so the page renders an empty state rather than an error boundary.
 */
export const ItemDetailQuery = graphql(
  `
  query ItemDetail(
    $itemId: ID!
    $type: ItemType!
    $images: Int!
    $reviews: Int!
    $checkIns: Int!
    $brands: Int!
  ) {
    item(id: $itemId, type: $type) {
      __typename
      ... on QueryItemSuccess {
        data {
          ...ItemCore
          ...ItemAttributes
          images(first: $images) {
            totalCount
            pageInfo { hasNextPage endCursor }
            edges { cursor node { ...ItemImageRow } }
          }
          reviews(first: $reviews) {
            totalCount
            pageInfo { hasNextPage endCursor }
            edges { cursor node { ...ItemReviewRow } }
          }
          checkIns(first: $checkIns) {
            totalCount
            pageInfo { hasNextPage endCursor }
            edges { cursor node { ...ItemCheckInRow } }
          }
          brands(first: $brands) {
            totalCount
            edges { node { ...ItemBrandRow } }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [
    ItemCoreFragment,
    ItemAttributesFragment,
    ItemImageFragment,
    ItemReviewFragment,
    ItemCheckInFragment,
    ItemBrandFragment,
    ActorErrorFieldsFragment,
  ],
);

/**
 * The same item, attributes only — the edit form's initial values, and the
 * poll the onboarding wizard runs while it waits for the outbox.
 */
export const ItemSummaryQuery = graphql(
  `
  query ItemSummary($itemId: ID!, $type: ItemType!) {
    item(id: $itemId, type: $type) {
      __typename
      ... on QueryItemSuccess {
        data {
          ...ItemCore
          ...ItemAttributes
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ItemCoreFragment, ItemAttributesFragment, ActorErrorFieldsFragment],
);

/**
 * Every reference table the six item forms constrain a field against.
 *
 * One document with ten aliases rather than ten documents: `referenceData`
 * takes a single `kind`, URQL caches the whole response, and nine of the ten
 * tables fit in a single page.
 *
 * **`first` is capped at 100 across this whole API** (`pageArgs` in
 * `packages/contracts`), and going over is a `ValidationError` thrown *inside*
 * a direct-result field — so it arrives as a top-level `INTERNAL_SERVER_ERROR`
 * with `data: null` and takes the other nine aliases down with it. Found by
 * asking for 300 countries. `country` has 197 rows and therefore needs a second
 * page; `MoreCountriesQuery` fetches it.
 *
 * **Six constrained columns have no `ReferenceKind`** — coffee roast level,
 * species and process; tea form and caffeine level; sake serving temperature.
 * They are Postgres enums rather than reference tables, and the schema exposes
 * them as GraphQL enums instead (`CoffeeRoastLevel`…). `itemFormRules.ts`
 * carries those as constants.
 */
export const ReferenceOptionsQuery = graphql(
  `
  query ReferenceOptions {
    country: referenceData(kind: COUNTRY, first: 100) {
      __typename
      ... on ReferenceRowConnection {
        pageInfo { hasNextPage endCursor }
        edges { node { value comment } }
      }
      ...ActorErrorFields
    }
    wineStyle: referenceData(kind: WINE_STYLE, first: 100) {
      __typename
      ... on ReferenceRowConnection {
        edges { node { value comment } }
      }
      ...ActorErrorFields
    }
    wineVariety: referenceData(kind: WINE_VARIETY, first: 100) {
      __typename
      ... on ReferenceRowConnection {
        edges { node { value comment } }
      }
      ...ActorErrorFields
    }
    beerStyle: referenceData(kind: BEER_STYLE, first: 100) {
      __typename
      ... on ReferenceRowConnection {
        edges { node { value comment } }
      }
      ...ActorErrorFields
    }
    spiritType: referenceData(kind: SPIRIT_TYPE, first: 100) {
      __typename
      ... on ReferenceRowConnection {
        edges { node { value comment } }
      }
      ...ActorErrorFields
    }
    coffeeCultivar: referenceData(kind: COFFEE_CULTIVAR, first: 100) {
      __typename
      ... on ReferenceRowConnection {
        edges { node { value comment } }
      }
      ...ActorErrorFields
    }
    sakeCategory: referenceData(kind: SAKE_CATEGORY, first: 100) {
      __typename
      ... on ReferenceRowConnection {
        edges { node { value comment } }
      }
      ...ActorErrorFields
    }
    sakeType: referenceData(kind: SAKE_TYPE, first: 100) {
      __typename
      ... on ReferenceRowConnection {
        edges { node { value comment } }
      }
      ...ActorErrorFields
    }
    sakeRiceVariety: referenceData(kind: SAKE_RICE_VARIETY, first: 100) {
      __typename
      ... on ReferenceRowConnection {
        edges { node { value comment } }
      }
      ...ActorErrorFields
    }
    teaCategory: referenceData(kind: TEA_CATEGORY, first: 100) {
      __typename
      ... on ReferenceRowConnection {
        edges { node { value comment } }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/**
 * The rest of the countries.
 *
 * `country` is the only reference table longer than one page — 197 rows against
 * a hard ceiling of 100 — so the picker would silently stop at Mozambique
 * without this. Paused until the first page's `endCursor` is known.
 */
export const MoreCountriesQuery = graphql(
  `
  query MoreCountries($after: String!) {
    referenceData(kind: COUNTRY, first: 100, after: $after) {
      __typename
      ... on ReferenceRowConnection {
        pageInfo { hasNextPage endCursor }
        edges { node { value comment } }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

// ---------------------------------------------------------------------------
// Mutations — onboarding
// ---------------------------------------------------------------------------

/**
 * Open a label-scan session.
 *
 * `onboardingId` is minted by the caller so a retry after a dropped response
 * reuses the same session instead of burning a second AI call (§8.4).
 *
 * Two outcomes, both normal. With an AI provider configured this returns
 * `ItemOnboarding` with `status: COMPLETED` and a `defaults` bag the wizard
 * pre-fills from — verified live. Without one, or on a label the model cannot
 * read, it returns a typed error; the row is still written with
 * `status: FAILED`, and **confirm works against it** — which is what makes the
 * manual path a real path rather than a workaround.
 *
 * This note used to say the first outcome was impossible ("X1 has not wired an
 * AI provider"). It was wrong, and callers must not branch on the assumption:
 * whether a provider is configured is a property of the deployment, not of this
 * build. See `src/lib/dev-checks/capability-claims.test.ts`.
 */
export const StartItemOnboardingMutation = graphql(
  `
  mutation StartItemOnboarding(
    $input: StartItemOnboardingInput!
    $onboardingId: ID
  ) {
    startItemOnboarding(input: $input, onboardingId: $onboardingId) {
      __typename
      ... on ItemOnboarding {
        ...ItemOnboardingRow
      }
      ...ActorErrorFields
    }
  }
`,
  [ItemOnboardingFragment, ActorErrorFieldsFragment],
);

/**
 * Turn an accepted proposal into an item, a brand link and a cellar item.
 *
 * **`item` is deliberately not selected.** The schema says it is "null until
 * the outbox has delivered `ItemActor.create`", but the resolver goes through
 * the item DataLoader and a missing row raises `NotFoundError` — which arrives
 * as a top-level `INTERNAL_SERVER_ERROR` in `errors[]` and, because the field
 * is non-null inside `Item!`, nulls it. Verified live against the running API.
 * Poll `item(type:, id:)` with `itemId` instead; that is what the schema's own
 * note tells you to do, and it is the only thing that works.
 *
 * `ItemActor.create`, `linkBrand` and `CellarActor.addItem` all run through the
 * outbox (§8.5), so every id here names a row that is *being* created. They are
 * minted deterministically from the onboarding id, so re-sending this confirm
 * yields the same ids and one of each row.
 */
export const ConfirmItemOnboardingMutation = graphql(
  `
  mutation ConfirmItemOnboarding(
    $onboardingId: ID!
    $input: ConfirmItemOnboardingInput!
  ) {
    confirmItemOnboarding(onboardingId: $onboardingId, input: $input) {
      __typename
      ... on ConfirmedItemOnboarding {
        onboardingId
        itemId
        itemType
        brandId
        cellarItemId
        barcode
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

// ---------------------------------------------------------------------------
// Mutations — the item itself
// ---------------------------------------------------------------------------

/** Creator only. Enrichment updates arrive as `system` and never through here. */
export const UpdateItemMutation = graphql(
  `
  mutation UpdateItem($itemId: ID!, $type: ItemType!, $input: UpdateItemInput!) {
    updateItem(itemId: $itemId, type: $type, input: $input) {
      __typename
      ... on MutationUpdateItemSuccess {
        data {
          ...ItemCore
          ...ItemAttributes
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ItemCoreFragment, ItemAttributesFragment, ActorErrorFieldsFragment],
);

// ---------------------------------------------------------------------------
// Mutations — reviews, favourites, images, brands, barcodes
// ---------------------------------------------------------------------------

/** Any signed-in viewer, at most one review each. A second is a `ConflictError`. */
export const AddItemReviewMutation = graphql(
  `
  mutation AddItemReview(
    $itemId: ID!
    $type: ItemType!
    $input: AddItemReviewInput!
  ) {
    addItemReview(itemId: $itemId, type: $type, input: $input) {
      __typename
      ... on ItemReview {
        ...ItemReviewRow
      }
      ...ActorErrorFields
    }
  }
`,
  [ItemReviewFragment, ActorErrorFieldsFragment],
);

/** The author's alone. */
export const UpdateItemReviewMutation = graphql(
  `
  mutation UpdateItemReview(
    $itemId: ID!
    $type: ItemType!
    $reviewId: ID!
    $input: UpdateItemReviewInput!
  ) {
    updateItemReview(
      itemId: $itemId
      type: $type
      reviewId: $reviewId
      input: $input
    ) {
      __typename
      ... on ItemReview {
        ...ItemReviewRow
      }
      ...ActorErrorFields
    }
  }
`,
  [ItemReviewFragment, ActorErrorFieldsFragment],
);

/** The author's alone. */
export const DeleteItemReviewMutation = graphql(
  `
  mutation DeleteItemReview($itemId: ID!, $type: ItemType!, $reviewId: ID!) {
    deleteItemReview(itemId: $itemId, type: $type, reviewId: $reviewId) {
      __typename
      ... on DeletedItemReview {
        id
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/**
 * Add or remove one item from the viewer's favourites.
 *
 * `favorited` in the payload is the state *after* the toggle, so the star does
 * not have to guess. `item` is not selected: the payload resolves it through
 * the item DataLoader, and the star already has everything it needs.
 */
export const ToggleFavoriteMutation = graphql(
  `
  mutation ToggleItemFavorite($itemId: ID!, $type: ItemType!) {
    toggleFavorite(itemId: $itemId, type: $type) {
      __typename
      ... on ToggleFavoritePayload {
        favorited
        itemId
        itemType
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/**
 * Point an `item_image` row at an already-uploaded file.
 *
 * `fileId` must name a `files` row `FileActor.verify` has accepted — an upload
 * that never landed is refused, verified live: a made-up id comes back
 * `NotFoundError: FileActor(…) has no row`. `imageId` is minted by the caller
 * so a retry writes one row.
 */
export const AttachItemImageMutation = graphql(
  `
  mutation AttachItemImage(
    $itemId: ID!
    $type: ItemType!
    $input: AttachItemImageInput!
  ) {
    attachItemImage(itemId: $itemId, type: $type, input: $input) {
      __typename
      ... on ItemImage {
        ...ItemImageRow
      }
      ...ActorErrorFields
    }
  }
`,
  [ItemImageFragment, ActorErrorFieldsFragment],
);

/** Register a code before `linkBarcodeItem` or `CreateItemInput.barcodeCode`. */
export const EnsureBarcodeMutation = graphql(
  `
  mutation EnsureBarcode($code: String!, $type: String) {
    ensureBarcode(code: $code, type: $type) {
      __typename
      ... on Barcode {
        # Aliased: Barcode.code is a String! and ActorError.code an
        # ActorErrorCode!, and one response name in one selection set must
        # have one shape even across disjoint types (OverlappingFieldsCanBeMerged).
        barcodeCode: code
        type
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/**
 * The item's creator only.
 *
 * `LinkedBarcodeItem` carries `code`, `item` and `outboxRowId` — **not**
 * `itemId`/`itemType`, which gql.tada types as `unknown` rather than rejecting
 * and which the server refuses outright. `outboxRowId` is null when the item
 * already carried the code and nothing was enqueued, which is how a caller
 * tells a no-op from a queued `setBarcode`.
 */
export const LinkBarcodeItemMutation = graphql(
  `
  mutation LinkBarcodeItem($code: String!, $itemId: ID!, $itemType: ItemType!) {
    linkBarcodeItem(code: $code, itemId: $itemId, itemType: $itemType) {
      __typename
      ... on LinkedBarcodeItem {
        # Aliased for the same reason as EnsureBarcode's.
        barcodeCode: code
        outboxRowId
        item {
          __typename
          id
          type
          name
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/** Drop this bottle into a cellar from the item page. */
export const AddItemToCellarFromItemMutation = graphql(
  `
  mutation AddItemToCellarFromItem($cellarId: ID!, $input: AddCellarItemInput!) {
    addItemToCellar(cellarId: $cellarId, input: $input) {
      __typename
      ... on CellarItem {
        id
        cellarId
        item {
          id
          type
          name
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);
