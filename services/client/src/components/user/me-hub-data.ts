/**
 * What the `/me` hub reads beyond the session (D1, X18): the viewer's counts
 * (bottles, logs, places, tier lists), their own tier lists, pinned at the
 * top of Lists, and the friend requests waiting on them, for the badge on
 * Friends.
 *
 * Two documents, read side by side. Every part is optional to the page: a
 * failure in any renders what it would have shown anyway — no count row,
 * plain rows (`meHubFromResult`) — never an error over the hub. The counts
 * are their own document because `Viewer.counts` is a plain field: an error
 * there is a GraphQL error, which fails the whole operation, and it must not
 * take the pinned lists and the Friends badge down with it.
 */
import { ActorErrorFieldsFragment } from "@/lib/api/errors";
import { graphql, type ResultOf } from "@/lib/api/graphql";

/** How many of the viewer's own tier lists sit pinned above "All tier lists". */
export const PINNED_TIER_LISTS = 3;

/** The API caps `first` at 100; past that the badge reads "99+". */
export const FRIEND_REQUESTS_PAGE = 100;

export const MeHubQuery = graphql(
  `
  query MeHub($pinned: Int!, $requests: Int!) {
    myTierLists(first: $pinned, section: MINE) {
      __typename
      ... on TierListConnection {
        totalCount
        edges {
          node {
            id
            name
            itemCount
          }
        }
      }
      ...ActorErrorFields
    }
    myFriendRequests(direction: INCOMING, first: $requests) {
      __typename
      ... on FriendRequestConnection {
        edges {
          node {
            id
            status
          }
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/** The header's count row (X18), read on its own — see the module doc. */
export const MeCountsQuery = graphql(`
  query MeCounts {
    me {
      id
      counts {
        bottles
        logs
        places
        tierLists
      }
    }
  }
`);

export type PinnedTierList = { id: string; name: string; itemCount: number };

/** `Viewer.counts` (X18): each the viewer's own. */
export type MeCounts = {
  bottles: number;
  logs: number;
  places: number;
  tierLists: number;
};

export type MeHubData = {
  /** The header's counts, or `null` when they could not be read. */
  counts?: MeCounts | null;
  /** The viewer's own tier lists, most recently changed first. */
  pinnedTierLists: PinnedTierList[];
  /** How many tier lists the viewer owns in all, when known. */
  tierListCount: number | null;
  /** Incoming friend requests still pending. */
  pendingFriendRequests: number;
};

export const EMPTY_ME_HUB: MeHubData = {
  counts: null,
  pinnedTierLists: [],
  tierListCount: null,
  pendingFriendRequests: 0,
};

/** The query's result → the hub's props. A failed half reads as empty. */
export const meHubFromResult = (
  data: ResultOf<typeof MeHubQuery> | null | undefined,
): MeHubData => {
  const lists = data?.myTierLists;
  const requests = data?.myFriendRequests;
  const listConnection =
    lists?.__typename === "TierListConnection" ? lists : null;
  return {
    counts: null,
    pinnedTierLists:
      listConnection?.edges.map(({ node }) => ({
        id: node.id,
        name: node.name,
        itemCount: node.itemCount,
      })) ?? [],
    tierListCount: listConnection?.totalCount ?? null,
    pendingFriendRequests:
      requests?.__typename === "FriendRequestConnection"
        ? requests.edges.filter(({ node }) => node.status === "PENDING").length
        : 0,
  };
};

/** `MeCounts`' result → the count row's numbers, or `null` (no row). */
export const meCountsFromResult = (
  data: ResultOf<typeof MeCountsQuery> | null | undefined,
): MeCounts | null => data?.me?.counts ?? null;

/** The badge's text: the count, capped where the page read stops. */
export const badgeText = (count: number): string =>
  count >= FRIEND_REQUESTS_PAGE ? `${FRIEND_REQUESTS_PAGE - 1}+` : `${count}`;

/** One tile of the header's count row: the number, and its noun. */
export type CountTile = { key: keyof MeCounts; value: number; noun: string };

const NOUNS: Record<keyof MeCounts, readonly [string, string]> = {
  bottles: ["bottle", "bottles"],
  logs: ["log", "logs"],
  places: ["place", "places"],
  tierLists: ["tier list", "tier lists"],
};

/**
 * The count row (design §3.7): each count names its noun, and a count of zero
 * is not shown — a new account's Me has no row of zeros. Fixed order, so a
 * tile never moves when another one appears.
 */
export const countTiles = (counts: MeCounts | null | undefined): CountTile[] =>
  counts === null || counts === undefined
    ? []
    : (Object.keys(NOUNS) as (keyof MeCounts)[])
        .filter((key) => counts[key] > 0)
        .map((key) => {
          const [one, many] = NOUNS[key];
          return {
            key,
            value: counts[key],
            noun: counts[key] === 1 ? one : many,
          };
        });
