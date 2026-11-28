"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useQuery } from "urql";
import {
  FRIEND_REQUESTS_PAGE,
  MeHubQuery,
  meHubFromResult,
  PINNED_TIER_LISTS,
} from "@/components/user/me-hub-data";
import type { ResultOf } from "@/lib/api/graphql";

/** Who is signed in, as the tab bar's Me avatar draws them. */
export type ShellViewer = {
  displayName?: string | null;
  avatarUrl?: string | null;
  /** Incoming friend requests still pending: the Me badge (KIT amendments). */
  requests?: number;
};

/** Exported for tests and the kit gallery, which draw the shell without the API. */
export const ShellViewerContext = createContext<ShellViewer>({});

/**
 * The friend-request count, held outside React context. The provider sits
 * above every page, and its read answers after mount, often while React is
 * still hydrating the page's streamed `loading.tsx` boundary. A context change
 * then makes React client-render that boundary instead of hydrating it, which
 * leaves the server's copy in a hidden `S:n` div beside the client's: two of
 * everything on the page for a few hundred ms (m10-make, the F-24 rows). A
 * store changes only the components that read it.
 */
type RequestsStore = {
  get: () => number | undefined;
  set: (count: number) => void;
  subscribe: (onChange: () => void) => () => void;
};

const makeRequestsStore = (): RequestsStore => {
  let value: number | undefined;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (count) => {
      if (count === value) return;
      value = count;
      listeners.forEach((onChange) => {
        onChange();
      });
    },
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
  };
};

const RequestsStoreContext = createContext<RequestsStore | null>(null);
const noSubscribe = () => () => {};
const noCount = (): number | undefined => undefined;

/**
 * The viewer the shell draws; empty outside `ShellViewerProvider`. Under the
 * provider, `requests` comes from its store; without one (tests, the kit
 * gallery) it is whatever `ShellViewerContext` was given.
 */
export const useShellViewer = (): ShellViewer => {
  const viewer = useContext(ShellViewerContext);
  const store = useContext(RequestsStoreContext);
  const requests = useSyncExternalStore(
    store?.subscribe ?? noSubscribe,
    store?.get ?? noCount,
    noCount,
  );
  return store === null ? viewer : { ...viewer, requests };
};

/** The API caps `first` at 100; past that the badge reads "99+". */
const REQUESTS_PAGE = FRIEND_REQUESTS_PAGE;

/**
 * The pending requests in the Me hub's result (the same document the Me
 * page reads, so the two share one cache entry); a failed read is 0.
 */
export const pendingRequests = (
  data: ResultOf<typeof MeHubQuery> | null | undefined,
): number => meHubFromResult(data).pendingFriendRequests;

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
 * failed read draws no badge, never an error. The context value stays the
 * same object when the read answers (see `RequestsStore`).
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
  const [store] = useState(makeRequestsStore);
  const viewer = useMemo(
    () => ({ displayName, avatarUrl }),
    [displayName, avatarUrl],
  );
  const [{ data }] = useQuery({
    query: MeHubQuery,
    variables: { pinned: PINNED_TIER_LISTS, requests: REQUESTS_PAGE },
    requestPolicy: "cache-and-network",
  });
  const requests = pendingRequests(data);
  useEffect(() => store.set(requests), [store, requests]);
  return (
    <ShellViewerContext.Provider value={viewer}>
      <RequestsStoreContext.Provider value={store}>
        {children}
      </RequestsStoreContext.Provider>
    </ShellViewerContext.Provider>
  );
}
