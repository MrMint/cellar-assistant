"use client";

import { createContext, type ReactNode, useContext } from "react";
import { useQuery } from "urql";
import { graphql, type ResultOf } from "@/lib/api/graphql";

/** Who is signed in, as the tab bar's Me avatar draws them. */
export type ShellViewer = {
  displayName?: string | null;
  avatarUrl?: string | null;
  /** Incoming friend requests still pending: the Me badge (KIT amendments). */
  requests?: number;
};

/** Exported for tests and the kit gallery, which draw the shell without the API. */
export const ShellViewerContext = createContext<ShellViewer>({});

/** The viewer the shell draws; empty outside `ShellViewerProvider`. */
export const useShellViewer = (): ShellViewer => useContext(ShellViewerContext);

/** The API caps `first` at 100; past that the badge reads "99+". */
const REQUESTS_PAGE = 100;

const MeBadgeQuery = graphql(`
  query ShellMeBadge($requests: Int!) {
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
    }
  }
`);

/** The pending requests in the badge query's result; a failed read is 0. */
export const pendingRequests = (
  data: ResultOf<typeof MeBadgeQuery> | null | undefined,
): number => {
  const connection = data?.myFriendRequests;
  return connection?.__typename === "FriendRequestConnection"
    ? connection.edges.filter(({ node }) => node.status === "PENDING").length
    : 0;
};

/** The badge's words: the count, capped where the read stops. */
export const badgeCount = (count: number): string =>
  count >= REQUESTS_PAGE ? `${REQUESTS_PAGE - 1}+` : `${count}`;

/** "Me", or "Me, 2 friend requests" when some wait (KIT amendments). */
export const meLabel = (requests: number | undefined): string =>
  requests === undefined || requests <= 0
    ? "Me"
    : `Me, ${badgeCount(requests)} friend request${requests === 1 ? "" : "s"}`;

/**
 * Provides the viewer to the tab bar and rail, and reads the friend requests
 * waiting on them for the Me badge. Mount inside the GraphQL provider. A
 * failed read draws no badge, never an error.
 */
export function ShellViewerProvider({
  displayName,
  avatarUrl,
  children,
}: {
  displayName?: string | null;
  avatarUrl?: string | null;
  children: ReactNode;
}) {
  const [{ data }] = useQuery({
    query: MeBadgeQuery,
    variables: { requests: REQUESTS_PAGE },
    requestPolicy: "cache-and-network",
  });
  const requests = pendingRequests(data);
  return (
    <ShellViewerContext.Provider value={{ displayName, avatarUrl, requests }}>
      {children}
    </ShellViewerContext.Provider>
  );
}
