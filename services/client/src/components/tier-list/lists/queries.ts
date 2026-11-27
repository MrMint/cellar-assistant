/**
 * The lists index's own read (Social-Lists 01): each card's name, privacy,
 * count and date, its top four entries with a photo (the strip), and the
 * bands of its first 100 entries (the five-band bar). A list longer than 100
 * draws its remainder neutral (`bandStrip`), never a guessed band.
 *
 * Its own document rather than `GetTierLists` (`../queries.ts`), which the
 * list page's stream owns and which carries none of the strip or the bar.
 */

import type { SectionKey } from "@/components/common/CollectionSection";
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql, type ResultOf } from "@/lib/api/graphql";

export const ListCardFragment = graphql(`
  fragment ListCard on TierList @_unmask {
    __typename
    id
    name
    privacy
    listType
    itemCount
    contentUpdatedAt
    createdById
    createdBy {
      id
      displayName
      avatarUrl
    }
    top: items(first: 4) {
      edges {
        node {
          id
          band
          position
          entryType
          item {
            __typename
            id
            type
            name
            images(first: 1) {
              edges {
                node {
                  id
                  file {
                    id
                    url
                  }
                }
              }
            }
          }
          place {
            id
            name
            photos(first: 1) {
              edges {
                node {
                  id
                  file {
                    id
                    url
                  }
                }
              }
            }
          }
        }
      }
    }
    bands: items(first: 100) {
      edges {
        node {
          id
          band
        }
      }
    }
  }
`);

export type ListCardData = ResultOf<typeof ListCardFragment>;

/**
 * A section's page of the index. `first` is a literal on purpose: the API
 * costs a `first: $first` at `MAX_PAGE_SIZE` (100), and each card nests up
 * to 112 rows (`bands`, `top` and their photos), so a variable page blew the
 * 10,000-row limit (`row-cost.test.ts`). Yours and From friends read 20 a
 * page, Discover 6 (`sectionPageSize`).
 */
export const ListsIndexQuery = graphql(
  `
    query ListsIndex($after: String, $section: CollectionSection) {
      myTierLists(first: 20, after: $after, section: $section) {
        __typename
        ... on TierListConnection {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            cursor
            node {
              ...ListCard
            }
          }
        }
        ...ActorErrorFields
      }
    }
  `,
  [ListCardFragment, ActorErrorFieldsFragment],
);

export const ListsDiscoverQuery = graphql(
  `
    query ListsDiscover($after: String, $section: CollectionSection) {
      myTierLists(first: 6, after: $after, section: $section) {
        __typename
        ... on TierListConnection {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            cursor
            node {
              ...ListCard
            }
          }
        }
        ...ActorErrorFields
      }
    }
  `,
  [ListCardFragment, ActorErrorFieldsFragment],
);

/** The index's document for one section. */
export const listsIndexQueryFor = (section: SectionKey) =>
  section === "DISCOVER" ? ListsDiscoverQuery : ListsIndexQuery;

/**
 * One list's entries, for a rank: where an entry stands after an add (the
 * toast's "#n") and on the Add to a list sheet's rows.
 */
export const ListRanksQuery = graphql(
  `
    query ListRanks($id: ID!) {
      tierList(id: $id) {
        __typename
        ... on TierList {
          id
          itemCount
          items(first: 100) {
            edges {
              node {
                id
                band
                position
                item {
                  id
                }
                place {
                  id
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

/**
 * The list share sheet's read: who made it (only they change who can see
 * it), and its top three with the first photo, for the preview card.
 */
export const ListShareQuery = graphql(
  `
    query ListShare($id: ID!) {
      me {
        id
      }
      tierList(id: $id) {
        __typename
        ... on TierList {
          id
          name
          privacy
          listType
          itemCount
          createdById
          createdBy {
            id
            displayName
          }
          items(first: 3) {
            edges {
              node {
                id
                band
                position
                item {
                  __typename
                  id
                  name
                  images(first: 1) {
                    edges {
                      node {
                        id
                        file {
                          id
                          url
                        }
                      }
                    }
                  }
                }
                place {
                  id
                  name
                  photos(first: 1) {
                    edges {
                      node {
                        id
                        file {
                          id
                          url
                        }
                      }
                    }
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

/**
 * Every list the viewer owns, a page at a time (`useAllMyTierLists`): the
 * Add to a list sheet's rows ("My beers · 100 beers") and the map's filter.
 * 50 a page, as a literal: each list nests its first 100 bands, and a
 * `$first` would be costed at 100 × 101 rows, over the API's 10,000.
 */
export const MyListOptionsPageQuery = graphql(
  `
    query MyListOptionsPage($after: String) {
      me {
        id
      }
      myTierLists(first: 50, after: $after, section: MINE) {
        __typename
        ... on TierListConnection {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              __typename
              id
              name
              listType
              createdById
              itemCount
              bands: items(first: 100) {
                edges {
                  node {
                    id
                    band
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
