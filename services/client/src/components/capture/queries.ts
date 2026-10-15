import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";

/**
 * The viewer and the first page of their cellars, for the add page's "Into"
 * row (X05). `myCellars` is ordered by recent activity (D13), so the first
 * one the viewer may add to is the default when nothing is remembered.
 */
export const CaptureCellarsQuery = graphql(
  `
  query CaptureCellars {
    me {
      id
    }
    myCellars(first: 100) {
      __typename
      ... on CellarConnection {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            __typename
            id
            name
            createdById
            coOwnerIds
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
 * X06: the places near the person, for "At Cork & Barrel?" — the same
 * `me.nearbyPlaces` browse the search page's Nearby strip runs (a ±0.018°
 * box, nearest first), with only what the question needs.
 */
export const CaptureNearbyPlacesQuery = graphql(`
  query CaptureNearbyPlaces($location: LngLatInput!, $limit: Int!) {
    me {
      __typename
      id
      nearbyPlaces(location: $location, limit: $limit, first: $limit) {
        edges {
          node {
            __typename
            distanceMeters
            place {
              __typename
              id
              name
              primaryCategory
            }
          }
        }
      }
    }
  }
`);

/**
 * X06: the place picker's search, by name — `placeSearch`'s hybrid ranking
 * matches names by trigram as well as by meaning.
 */
export const CapturePlaceSearchQuery = graphql(
  `
  query CapturePlaceSearch($query: String!, $first: Int!) {
    placeSearch(query: $query, first: $first) {
      __typename
      ... on PlaceSearchConnection {
        edges {
          node {
            __typename
            id
            name
            primaryCategory
            locality
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
 * X06: a stored capture's URL — a draft resumed after a full reload has lost
 * its photo, but its session still names the label's file.
 */
export const CaptureFileUrlQuery = graphql(
  `
  query CaptureFileUrl($id: ID!) {
    file(id: $id) {
      __typename
      ... on File {
        id
        url
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);
