/**
 * Every GraphQL document the restored map, place, create-place, scan and
 * discovery components use — the successor of
 * `82450ad1:src/components/map/queries.ts`, of the Hasura queries in
 * `82450ad1:src/app/(authenticated)/map/{actions,place-actions}.ts`,
 * `82450ad1:src/app/actions/menuScanning.ts`, `places/queries.ts` and
 * `shared/fragments/place-fragments.ts`.
 *
 * Substitutions (old → new):
 *
 * - `searchPlacesAdaptiveCluster(args)` → `mapBrowse(bounds, …)`, a
 *   `MapPlace | MapCluster` union. No `filterUserId`: the visit filter is the
 *   viewer's own, server-side. `limit: 500` is how many features the actor
 *   holds; `first` (≤ 100) pages that set, so the map walks the pages
 *   (`searchMapPlaces` in `actions.ts`) — the rewrite read only the first 100.
 * - `getCachedSearchVector` + `searchCategoryVectors` + `searchPlacesHybrid`
 *   (three admin round trips from Next) → `placeSearch`, which embeds and
 *   ranks server-side and answers with a typed error when no provider is up.
 * - `getCachedGeocode` → `geocode(query:)`; `getCachedReverseGeocode` →
 *   `reverseGeocode(location:)`.
 * - `places_by_pk` + `user_place_interactions` + `place_menus(is_current)` →
 *   `place(id:)` with `myInteraction` (G16) and `menuItems` (every line the
 *   place's scans wrote — what the old single "current" menu accumulated).
 * - `place_menu_items.{wine,beer,spirit,coffee}` → `matchedItem.item` (G18).
 * - `place_google_enrichments` / `place_google_photos.storage_file_id` →
 *   `Place.enrichment` / `Place.photos { file { url } }` (presigned).
 * - `insert_user_place_interactions_one(on_conflict)` with a client-computed
 *   `visit_count` → `recordPlaceInteraction` (patch; the count is the server's).
 * - `google_nearby_search` / `google_autocomplete` → `googlePlaceSuggestions`
 *   (`mode: NEARBY | AUTOCOMPLETE`).
 * - `findDuplicatePlaces` → `duplicatePlaces` (radius ≤ 5000, limit ≤ 5).
 * - rate limit + duplicate re-check + AI review + `insert_places_one` →
 *   `createPlace`, which does all three server-side.
 * - `menu_scans` / `place_menu_items(where menu_scan_id)` → `myMenuScans`,
 *   `menuScan(id:)` with `menuItems` (G19) and `suggestions`.
 * - `item_match_suggestions` (other users' scans — a disclosure leak) →
 *   `myDiscoveries` (owner-only) with `place` and `placeMenuItem` (G20).
 */

import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";

/** The API caps `first` at 100 on every connection. */
export const MAP_PAGE_SIZE = 100;
/** `mapBrowse`'s own ceiling on features held for one browse; the old `limit: 500`. */
export const MAP_FEATURE_LIMIT = 500;
/** The old semantic search capped results at 50. */
export const SEMANTIC_RESULT_LIMIT = 50;
export const MENU_ITEMS_PAGE_SIZE = 100;
export const PLACE_PHOTOS_PAGE_SIZE = 6;
export const PLACE_TIER_LIST_ENTRIES_PAGE_SIZE = 20;
export const SCANS_PAGE_SIZE = 50;
export const SUGGESTIONS_PAGE_SIZE = 50;
export const SAVED_PLACES_PAGE_SIZE = 100;
export const MAP_TIER_LISTS_PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

/** Every feature in a viewport — the old `SearchPlacesClustered`. */
export const MapBrowseQuery = graphql(
  `
  query MapBrowse(
    $bounds: MapBoundsInput!
    $categories: [String!]
    $minRating: Float
    $tierListIds: [ID!]
    $visitStatus: VisitStatusFilter
    $limit: Int
    $first: Int
    $after: String
  ) {
    mapBrowse(
      bounds: $bounds
      categories: $categories
      minRating: $minRating
      tierListIds: $tierListIds
      visitStatus: $visitStatus
      limit: $limit
      first: $first
      after: $after
    ) {
      __typename
      ... on MapEntryConnection {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          cursor
          node {
            __typename
            ... on MapPlace {
              id
              name
              categories
              primaryCategory
              rating
              confidence
              isVerified
              location {
                lng
                lat
              }
            }
            ... on MapCluster {
              clusterId
              count
              center {
                lng
                lat
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

/** Meaning search — the old `searchPlacesHybrid`. `bounds` omitted = global. */
export const PlaceSearchQuery = graphql(
  `
  query MapPlaceSearch(
    $query: String!
    $bounds: MapBoundsInput
    $filterCategories: [String!]
    $minRating: Float
    $visitStatus: VisitStatusFilter
    $tierListIds: [ID!]
    $first: Int!
  ) {
    placeSearch(
      query: $query
      bounds: $bounds
      filterCategories: $filterCategories
      minRating: $minRating
      visitStatus: $visitStatus
      tierListIds: $tierListIds
      first: $first
    ) {
      __typename
      ... on PlaceSearchConnection {
        totalCount
        edges {
          node {
            id
            name
            primaryCategory
            categories
            rating
            priceLevel
            streetAddress
            locality
            region
            isVerified
            combinedScore
            location {
              lng
              lat
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

/** An address typed into the search bar — the old `getCachedGeocode`. */
export const GeocodeQuery = graphql(`
  query MapGeocode($query: String!) {
    geocode(query: $query) {
      latitude
      longitude
      displayName
    }
  }
`);

/** One place as a map marker, for a `?placeId=` deep link. */
export const PlaceByIdQuery = graphql(
  `
  query MapPlaceById($id: ID!) {
    place(id: $id) {
      __typename
      ... on Place {
        id
        name
        primaryCategory
        categories
        location {
          lng
          lat
        }
        rating
        priceLevel
        streetAddress
        locality
        region
        postcode
        countryCode
        phone
        website
        email
        hours
        confidence
        isVerified
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/**
 * The tier lists the map may filter by — the old `GetUserPlaceTierLists`
 * (`list_type = place`, created by the viewer). G33 is not built, so the
 * viewer's visible lists are narrowed to theirs and to places client-side.
 */
export const MapTierListsQuery = graphql(
  `
  query MapTierLists($first: Int!) {
    me {
      id
    }
    myTierLists(first: $first) {
      __typename
      ... on TierListConnection {
        edges {
          node {
            id
            name
            listType
            createdById
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

// ---------------------------------------------------------------------------
// One place (drawer and /places/[placeId])
// ---------------------------------------------------------------------------

/** One menu line, matched or not — the old `PlaceMenuItem` fragment. */
export const MenuLineFragment = graphql(`
  fragment MapMenuLine on PlaceMenuItem @_unmask {
    __typename
    id
    name
    description
    price
    menuCategory
    detectedItemType
    confidenceScore
    isAvailable
    createdAt
    extractedAttributes
    matchedItem {
      id
      type
      item {
        __typename
        id
        name
      }
    }
  }
`);

/** The viewer's own row for a place. */
export const PlaceInteractionFragment = graphql(`
  fragment MapPlaceInteraction on PlaceInteraction @_unmask {
    __typename
    id
    placeId
    isFavorite
    isVisited
    wantToVisit
    rating
    notes
    tags
    visitCount
    lastVisitedAt
    createdAt
    updatedAt
  }
`);

/** `GET_PLACE_DETAILS` + `GET_PLACE_ENRICHMENT`, in one read. */
export const PlaceDetailsQuery = graphql(
  `
  query MapPlaceDetails(
    $id: ID!
    $menuItems: Int!
    $photos: Int!
    $tierListEntries: Int!
  ) {
    place(id: $id) {
      __typename
      ... on Place {
        id
        overtureId
        name
        displayName
        description
        primaryCategory
        categories
        confidence
        location {
          lng
          lat
        }
        streetAddress
        locality
        region
        postcode
        countryCode
        phone
        website
        email
        isVerified
        isActive
        hours
        priceLevel
        rating
        reviewCount
        accessCount
        lastAccessedAt
        lastSyncAt
        createdAt
        updatedAt
        myInteraction {
          ...MapPlaceInteraction
        }
        enrichment {
          googlePlaceId
          googleName
          googleFormattedAddress
          googleRating
          googleUserRatingsTotal
          googlePriceLevel
          googleWebsite
          googlePhone
          googleOpeningHours
          googleTypes
          googleBusinessStatus
          googleEditorialSummary
          attributions
          detailsFetchedAt
          photosFetchedAt
        }
        photos(first: $photos) {
          edges {
            node {
              id
              displayOrder
              attributions
              file {
                __typename
                id
                url
              }
            }
          }
        }
        menuItems(first: $menuItems) {
          totalCount
          edges {
            node {
              ...MapMenuLine
            }
          }
        }
        tierListEntries(first: $tierListEntries) {
          edges {
            node {
              __typename
              id
              band
              tierList {
                __typename
                id
                name
              }
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [MenuLineFragment, PlaceInteractionFragment, ActorErrorFieldsFragment],
);

/**
 * Save / visit — the old `TOGGLE_FAVORITE_PLACE` and `MARK_PLACE_VISITED`.
 * Omitted fields keep their stored value; `visitCount` and `lastVisitedAt`
 * are computed by `UserActor` from the not-visited → visited transition.
 */
export const RecordPlaceInteractionMutation = graphql(
  `
  mutation MapRecordPlaceInteraction($input: RecordPlaceInteractionInput!) {
    recordPlaceInteraction(input: $input) {
      __typename
      ... on PlaceInteraction {
        ...MapPlaceInteraction
      }
      ...ActorErrorFields
    }
  }
`,
  [PlaceInteractionFragment, ActorErrorFieldsFragment],
);

/** Telemetry for `PlaceRefreshJobActor`'s staleness ordering (kept from D5). */
export const RecordPlaceAccessMutation = graphql(
  `
  mutation MapRecordPlaceAccess($placeId: ID!) {
    recordPlaceAccess(placeId: $placeId) {
      __typename
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/**
 * The old `enrich_place_from_google`. `QUEUED` (an outbox row) or `FRESH`
 * (details under 30 days old, nothing queued); `BUDGET_DENIED` when no
 * Google budget is configured. `input.googlePlaceId` binds a just-created
 * place to the suggestion its form was pre-filled from (G21's sequence).
 */
export const EnrichPlaceMutation = graphql(
  `
  mutation MapEnrichPlace($placeId: ID!, $input: EnrichPlaceInput) {
    enrichPlaceFromGoogle(placeId: $placeId, input: $input) {
      __typename
      ... on EnrichPlacePayload {
        placeId
        status
        enrichment {
          detailsFetchedAt
        }
        collision {
          googlePlaceId
          boundToPlaceId
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

// ---------------------------------------------------------------------------
// Create place
// ---------------------------------------------------------------------------

export const ReverseGeocodeQuery = graphql(`
  query MapReverseGeocode($location: LngLatInput!) {
    reverseGeocode(location: $location) {
      streetAddress
      locality
      region
      postcode
      countryCode
    }
  }
`);

/** `google_nearby_search` and `google_autocomplete`, one field. */
export const GooglePlaceSuggestionsQuery = graphql(`
  query MapGooglePlaceSuggestions(
    $input: String
    $location: LngLatInput!
    $mode: GooglePlacesSearchMode!
  ) {
    googlePlaceSuggestions(input: $input, location: $location, mode: $mode) {
      charged
      reason
      suggestions(first: 8) {
        edges {
          node {
            googlePlaceId
            name
            secondaryText
            types
            location {
              lng
              lat
            }
          }
        }
      }
    }
  }
`);

/** `findDuplicatePlaces` — name and proximity, no AI. */
export const DuplicatePlacesQuery = graphql(
  `
  query MapDuplicatePlaces(
    $name: String!
    $location: LngLatInput!
    $radiusMeters: Float
    $minSimilarity: Float
    $limit: Int
  ) {
    duplicatePlaces(
      name: $name
      location: $location
      radiusMeters: $radiusMeters
      minSimilarity: $minSimilarity
      limit: $limit
      first: 5
    ) {
      __typename
      ... on DuplicatePlaceConnection {
        edges {
          node {
            placeId
            name
            distanceMeters
            similarity
            place {
              id
              primaryCategory
              streetAddress
              locality
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

/** `createUserPlaceAction`'s whole pipeline, server-side. */
export const CreatePlaceMutation = graphql(
  `
  mutation MapCreatePlace($input: CreatePlaceInput!) {
    createPlace(input: $input) {
      __typename
      ... on CreatePlacePayload {
        place {
          id
        }
        nearbyDuplicates(first: 5) {
          edges {
            node {
              placeId
              name
              distanceMeters
              similarity
              place {
                id
                primaryCategory
                streetAddress
                locality
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

// ---------------------------------------------------------------------------
// Menu scans
// ---------------------------------------------------------------------------

/** `uploadAndProcessMenuScan`'s insert; the scan is processed via the outbox. */
export const CreateMenuScanMutation = graphql(
  `
  mutation MapCreateMenuScan($input: CreateMenuScanInput!, $menuScanId: ID) {
    createMenuScan(input: $input, menuScanId: $menuScanId) {
      __typename
      ... on MenuScan {
        id
        processingStatus
        processingError
        itemsDetected
        itemsMatched
        confidenceScore
        placeId
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/** `getMenuScanStatus`. */
export const MenuScanStatusQuery = graphql(
  `
  query MapMenuScanStatus($id: ID!) {
    menuScan(id: $id) {
      __typename
      ... on MenuScan {
        id
        processingStatus
        processingError
        itemsDetected
        itemsMatched
        confidenceScore
        placeId
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/** `getUserScanHistory` — the viewer's own scans, newest first. */
export const ScanHistoryQuery = graphql(
  `
  query MapScanHistory($first: Int!, $after: String) {
    myMenuScans(first: $first, after: $after) {
      __typename
      ... on MenuScanConnection {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          cursor
          node {
            id
            processingStatus
            processingError
            itemsDetected
            confidenceScore
            scannedAt
            processedAt
            place {
              id
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

/** One AI-proposed match, as the scan page and `/discoveries` show it. */
export const SuggestionFragment = graphql(`
  fragment MapSuggestion on MatchSuggestion @_unmask {
    __typename
    id
    menuScanId
    placeMenuItemId
    menuItemName
    confidenceScore
    matchReasoning
    targetKind
    accepted
    rejected
    createdAt
    suggestedItem {
      __typename
      id
      type
      name
    }
    suggestedRecipe {
      __typename
      id
      name
    }
  }
`);

/** `getScanResults` — every extracted line (G19) plus the suggestions. */
export const ScanResultsQuery = graphql(
  `
  query MapScanResults($id: ID!, $menuItems: Int!, $suggestions: Int!) {
    menuScan(id: $id) {
      __typename
      ... on MenuScan {
        id
        processingStatus
        processingError
        itemsDetected
        confidenceScore
        placeId
        scannedAt
        place {
          id
          name
        }
        menuItems(first: $menuItems) {
          totalCount
          edges {
            node {
              ...MapMenuLine
            }
          }
        }
        suggestions(first: $suggestions) {
          edges {
            node {
              ...MapSuggestion
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [MenuLineFragment, SuggestionFragment, ActorErrorFieldsFragment],
);

/** Accept or reject one suggestion (the nonexistent `processMatchSuggestion`). */
export const ActOnSuggestionMutation = graphql(
  `
  mutation MapActOnSuggestion(
    $menuScanId: ID!
    $input: MatchSuggestionActionInput!
  ) {
    actOnMenuScanSuggestion(menuScanId: $menuScanId, input: $input) {
      __typename
      ... on MatchSuggestionActionPayload {
        propagated
        suggestion {
          ...MapSuggestion
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [SuggestionFragment, ActorErrorFieldsFragment],
);

// ---------------------------------------------------------------------------
// Discoveries
// ---------------------------------------------------------------------------

/**
 * The dashboard's two tabs that the API serves: pending matches from the
 * viewer's own scans (G20 for the place and the line), and saved places
 * (`PlaceInteraction.place`, G16; the line count from `menuItems.totalCount`).
 */
export const DiscoveryDataQuery = graphql(
  `
  query MapDiscoveryData($suggestions: Int!, $places: Int!) {
    myDiscoveries(first: $suggestions) {
      __typename
      ... on MatchSuggestionConnection {
        edges {
          node {
            ...MapSuggestion
            placeMenuItem {
              id
              name
              description
              detectedItemType
            }
            place {
              id
              name
              primaryCategory
            }
          }
        }
      }
      ...ActorErrorFields
    }
    myPlaceInteractions(first: $places) {
      __typename
      ... on PlaceInteractionConnection {
        edges {
          node {
            ...MapPlaceInteraction
            place {
              id
              name
              primaryCategory
              categories
              streetAddress
              locality
              rating
              menuItems(first: 1) {
                totalCount
              }
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [SuggestionFragment, PlaceInteractionFragment, ActorErrorFieldsFragment],
);
