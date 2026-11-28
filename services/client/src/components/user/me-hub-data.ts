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

/** Requests drawn as rows on the hub; the rest wait on Friends. */
export const REQUEST_ROWS = 3;

/**
 * How many entries a pinned list may hold and still draw its band strip.
 * H-131: the strip reads `bandCounts` (F-85), which counts every entry, so
 * there is no sample to hide any more and no cap.
 */
export const BAND_STRIP_MAX = Number.POSITIVE_INFINITY;

/**
 * The hub's own extras (Shell-Me), a document of its own because the shell
 * reads `MeHubQuery` on every page for the Me badge: the Loved, Want to try
 * and Friends counts, each pinned list's bands, and the requests drawn as
 * rows. The pages are literals, not variables: a variable `first` is costed
 * at the cap (`avatar.test.ts` runs its rule). 3 = PINNED_TIER_LISTS,
 * 3 = REQUEST_ROWS. Each list's bands come from `bandCounts` (F-85, H-131),
 * not a page of its entries.
 */
export const MeExtrasQuery = graphql(
  `
  query MeExtras {
    me {
      id
      favorites(first: 1) {
        totalCount
      }
      wantToTry(first: 1) {
        totalCount
      }
    }
    myFriends(first: 1) {
      __typename
      ... on FriendConnection {
        totalCount
      }
      ...ActorErrorFields
    }
    myTierLists(first: 3, section: MINE) {
      __typename
      ... on TierListConnection {
        edges {
          node {
            id
            bandCounts
          }
        }
      }
      ...ActorErrorFields
    }
    myFriendRequests(direction: INCOMING, first: 3) {
      __typename
      ... on FriendRequestConnection {
        edges {
          node {
            id
            status
            direction
            user {
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

export type BandCount = { band: number; count: number };

export type HubRequest = {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
};

export type MeExtras = {
  loved: number | null;
  wantToTry: number | null;
  friends: number | null;
  /** Each pinned list's entries per band, best band first; by list id. */
  bands: Record<string, BandCount[]>;
  /** Pending requests sent to the viewer, the only ones Accept can answer. */
  requests: HubRequest[];
};

export const EMPTY_ME_EXTRAS: MeExtras = {
  loved: null,
  wantToTry: null,
  friends: null,
  bands: {},
  requests: [],
};

/** `bandCounts` (indexed by band, bottom first) → the bands held, best first. */
const bandsOf = (counts: readonly number[]): BandCount[] =>
  counts
    .map((count, band) => ({ band, count }))
    .filter(({ count }) => count > 0)
    .reverse();

/** The extras' result → the hub's props; any failed part reads as absent. */
export const meExtrasFromResult = (
  data: ResultOf<typeof MeExtrasQuery> | null | undefined,
): MeExtras => {
  if (data === null || data === undefined) return EMPTY_ME_EXTRAS;
  const friends =
    data.myFriends.__typename === "FriendConnection" ? data.myFriends : null;
  const lists =
    data.myTierLists.__typename === "TierListConnection"
      ? data.myTierLists.edges
      : [];
  const requests =
    data.myFriendRequests.__typename === "FriendRequestConnection"
      ? data.myFriendRequests.edges
      : [];
  return {
    loved: data.me?.favorites.totalCount ?? null,
    wantToTry: data.me?.wantToTry.totalCount ?? null,
    friends: friends?.totalCount ?? null,
    bands: Object.fromEntries(
      lists.map(({ node }) => [node.id, bandsOf(node.bandCounts)]),
    ),
    requests: requests
      .filter(
        ({ node }) =>
          node.status === "PENDING" && node.direction === "INCOMING",
      )
      .map(({ node }) => ({
        id: node.id,
        userId: node.user.id,
        displayName: node.user.displayName,
        avatarUrl: node.user.avatarUrl ?? null,
      })),
  };
};
