/**
 * Home "Today" (X10) — every document the page reads. Each section has its
 * own query so it streams, and fails, on its own (`app/(authenticated)/(home)`).
 */
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql } from "@/lib/api/graphql";

/** How many open bottles Continue shows; Drink soon reads the same page. */
export const CONTINUE_LIMIT = 12;
/** One page of the friends feed. */
export const FEED_PAGE_SIZE = 20;
/** Friends ranked: a card, not a list. */
export const FRIENDS_RANKED_LIMIT = 3;

/**
 * Continue and Drink soon: the viewer's open bottles across their own
 * cellars (`me.openBottles`), with what the card draws and the style field
 * the drink-soon table reads (D29).
 */
export const HomeContinueQuery = graphql(`
  query HomeContinue($first: Int!) {
    me {
      __typename
      id
      openBottles(first: $first) {
        totalCount
        edges {
          node {
            __typename
            id
            cellarId
            openAt
            emptyAt
            percentageRemaining
            cellar {
              __typename
              id
              name
            }
            displayImage {
              __typename
              id
              placeholder
              file {
                __typename
                id
                url
              }
            }
            item {
              __typename
              id
              type
              name
              country
              ... on Wine {
                __typename
                vintage
                wineStyle: style
                region
                alcoholContentPercentage
              }
              ... on Beer {
                __typename
                vintage
                alcoholContentPercentage
              }
              ... on Spirit {
                __typename
                vintage
                spiritType
                alcoholContentPercentage
              }
              ... on Sake {
                __typename
                vintageYear
                category
                region
                alcoholContentPercentage
              }
              ... on Tea {
                __typename
                category
                form
                region
              }
            }
          }
        }
      }
    }
  }
`);

/**
 * One AI job, as the tray, the inbox and the watcher's toasts read it. The
 * failure is N07's typed outcome; there is no message to select.
 */
export const AiJobFieldsFragment = graphql(`
  fragment AiJobFields on AiJob {
    __typename
    id
    kind
    status
    subjectId
    itemType
    placeId
    placeName
    count
    tierListName
    recipeId
    recipeName
    startedAt
    finishedAt
    failureCode
    failureReason
    retryAt
  }
`);

/** The watcher's poll: just the jobs. */
export const AiJobsQuery = graphql(
  `
  query HomeAiJobs {
    me {
      __typename
      id
      aiJobs(first: 30) {
        edges {
          node {
            ...AiJobFields
          }
        }
      }
    }
  }
`,
  [AiJobFieldsFragment],
);

/**
 * "Waiting on you" and the job tray: the AI work, menu matches to confirm
 * (the viewer's own scans, `myDiscoveries`) and friend requests to answer.
 */
export const HomeInboxQuery = graphql(
  `
  query HomeInbox {
    me {
      __typename
      id
      aiJobs(first: 30) {
        edges {
          node {
            ...AiJobFields
          }
        }
      }
    }
    myDiscoveries(first: 50) {
      __typename
      ... on MatchSuggestionConnection {
        edges {
          node {
            __typename
            id
            menuScanId
            accepted
            rejected
            menuItemName
            createdAt
            place {
              __typename
              id
              name
            }
          }
        }
      }
      ...ActorErrorFields
    }
    myFriendRequests(direction: INCOMING, first: 20) {
      __typename
      ... on FriendRequestConnection {
        edges {
          node {
            __typename
            id
            status
            user {
              __typename
              id
              displayName
              avatarUrl
            }
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [AiJobFieldsFragment, ActorErrorFieldsFragment],
);

/** Friends ranked (D1): friends' tier lists, most recently changed first. */
export const HomeFriendsRankedQuery = graphql(
  `
  query HomeFriendsRanked($first: Int!) {
    myTierLists(section: FRIENDS, first: $first) {
      __typename
      ... on TierListConnection {
        totalCount
        edges {
          node {
            __typename
            id
            name
            itemCount
            listType
            contentUpdatedAt
            createdBy {
              __typename
              id
              displayName
              avatarUrl
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
 * The Friends section: one page of `me.friendsFeed`. The node selection is
 * `/search`'s `SearchRecentActivity` one, so `activityEntryFromNode` reads
 * both — plus the ids a burst groups by (the cellar, the list).
 */
export const HomeFriendsFeedQuery = graphql(
  `
  query HomeFriendsFeed($first: Int!, $after: String) {
    myFriends(first: 1) {
      __typename
      ... on FriendConnection {
        totalCount
      }
      ...ActorErrorFields
    }
    me {
      __typename
      id
      friendsFeed(first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            __typename
            id
            kind
            occurredAt
            rank
            cellarItemId
            user {
              __typename
              id
              displayName
              avatarUrl
            }
            item {
              __typename
              id
              type
              name
              isWantToTry
              images(first: 1) {
                edges {
                  node {
                    __typename
                    id
                    placeholder
                    file {
                      __typename
                      id
                      url
                    }
                  }
                }
              }
              ... on Wine {
                __typename
                vintage
              }
              ... on Sake {
                __typename
                vintageYear
              }
            }
            place {
              __typename
              id
              name
              displayName
              myInteraction {
                __typename
                id
                wantToVisit
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
            review {
              __typename
              id
              score
              text
            }
            tierListItem {
              __typename
              id
              tierListId
              tierList {
                __typename
                id
                name
              }
            }
            cellar {
              __typename
              id
              name
            }
            checkIn {
              __typename
              id
              score
              note
              tags
              companionIds
              place {
                __typename
                id
                name
                displayName
              }
              companions(first: 5) {
                edges {
                  node {
                    __typename
                    id
                    displayName
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`,
  [ActorErrorFieldsFragment],
);
