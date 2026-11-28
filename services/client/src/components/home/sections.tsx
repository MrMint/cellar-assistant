import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { ICON_STROKE, Ranked } from "@/components/app/icons";
import { PersonRow } from "@/components/app/parts/PersonRow";
import {
  type NearbyPlace,
  nearbyPlacesFromNodes,
} from "@/components/search/adapter";
import {
  NEARBY_PLACES_LIMIT,
  SearchCollectionStatsQuery,
  SearchNearbyPlacesQuery,
} from "@/components/search/queries";
import { readFragment } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { getGeolocationFromCookie } from "@/lib/geo-cookie/server";
import type { AiJob } from "./ai-jobs";
import { ContinueSection } from "./ContinueShelf";
import { openBottlesFromNodes, sealedSoonFromNodes } from "./continue";
import { FriendsFeed } from "./FriendsFeed";
import { HomeInbox } from "./HomeInbox";
import { NewPersonHero, SEE_ALL_CLASS, SectionHead } from "./HomeLayout";
import {
  type AiQuotaRow,
  type IncomingRequest,
  type PendingSuggestion,
  toCheckFromNodes,
} from "./inbox";
import { bottleCountLine, isNewPerson } from "./landing";
import { NearbySection } from "./NearbySection";
import { PressLink } from "./PressLink";
import {
  AiJobFieldsFragment,
  DRINK_SOON_READ,
  FEED_PAGE_SIZE,
  FRIENDS_RANKED_LIMIT,
  HomeContinueQuery,
  HomeDrinkSoonQuery,
  HomeFriendsFeedQuery,
  HomeFriendsRankedQuery,
  HomeInboxQuery,
  OPEN_BOTTLES_READ,
  TO_CHECK_READ,
} from "./queries";
import { parseSeenCookie, SEEN_COOKIE_NAME } from "./seen-cookie";

/*
 * Home's server halves. Each is its own async component behind its own
 * Suspense boundary on the page, so each streams in, and fails, on its own:
 * a section whose read fails renders nothing rather than an error over the
 * page — Home is a summary, and every row in it has a full page of its own
 * to show the error properly.
 */

/** "240 bottles", beside the greeting; nothing for a new person (CROSS-LOT 3). */
export async function CollectionLine() {
  const stats = await readStats();
  const line = stats === undefined ? null : bottleCountLine(stats);
  if (line === null) return null;
  return (
    <p className="t-cap tabular m-0 animate-in fade-in text-ink-2 duration-(--ca-dur-medium) ease-enter">
      {line}
    </p>
  );
}

const readStats = () =>
  apiServerQuery(SearchCollectionStatsQuery)
    .then((data) => data.me?.collectionStats)
    .catch(() => undefined);

/**
 * The new-person Home or the full one. Someone with no bottles yet gets the
 * hero (and still any friend request or AI work waiting on them); a failed
 * read is not taken for "new" and draws the full Home.
 */
export async function NewPersonGate({
  inbox,
  full,
}: {
  inbox: ReactNode;
  full: ReactNode;
}) {
  const stats = await readStats();
  if (stats === undefined || !isNewPerson(stats)) return full;
  return (
    <>
      {inbox}
      <NewPersonHero />
    </>
  );
}

/** The AI tray and "Waiting on you". */
export async function InboxSection() {
  const [data, jar] = await Promise.all([
    apiServerQuery(HomeInboxQuery, { toCheck: TO_CHECK_READ }).catch(
      () => null,
    ),
    cookies(),
  ]);
  if (data === null) return null;
  const jobs: AiJob[] =
    data.me?.aiJobs.edges.map((edge) =>
      readFragment(AiJobFieldsFragment, edge.node),
    ) ?? [];
  const discoveries = unwrapResult(
    data.myDiscoveries,
    "MatchSuggestionConnection",
  );
  const suggestions: PendingSuggestion[] = discoveries.ok
    ? discoveries.data.edges.map((edge) => ({
        id: edge.node.id,
        menuScanId: edge.node.menuScanId,
        accepted: edge.node.accepted,
        rejected: edge.node.rejected,
        menuItemName: edge.node.menuItemName,
        createdAt: edge.node.createdAt as string | null,
        place: { id: edge.node.place.id, name: edge.node.place.name },
      }))
    : [];
  const incoming = unwrapResult(
    data.myFriendRequests,
    "FriendRequestConnection",
  );
  const requests: IncomingRequest[] = incoming.ok
    ? incoming.data.edges.map((edge) => ({
        id: edge.node.id,
        status: edge.node.status,
        user: {
          id: edge.node.user.id,
          displayName: edge.node.user.displayName,
          avatarUrl: edge.node.user.avatarUrl,
        },
      }))
    : [];
  const quota = unwrapResult(data.myAiQuota, "AiQuotaConnection");
  const quotas: AiQuotaRow[] = quota.ok
    ? quota.data.edges.map(({ node }) => ({
        kind: node.kind,
        used: node.used,
        limit: node.limit,
        resetsAt: node.resetsAt as string,
      }))
    : [];
  return (
    <HomeInbox
      initialJobs={jobs}
      suggestions={suggestions}
      requests={requests}
      needsDetails={data.needsDetailsCount}
      toCheck={toCheckFromNodes(
        data.me?.openBottles.edges.map((edge) => edge.node) ?? [],
      )}
      quotas={quotas}
      initialSeen={parseSeenCookie(jar.get(SEEN_COOKIE_NAME)?.value)}
    />
  );
}

/** Open (the rail and "Rate the n") and Drink soon (sealed, with Open). */
export async function ContinueSectionServer() {
  const [data, soonData] = await Promise.all([
    apiServerQuery(HomeContinueQuery, { first: OPEN_BOTTLES_READ }).catch(
      () => null,
    ),
    // L02: sealed bottles closing soon. Its failure costs only those rows.
    apiServerQuery(HomeDrinkSoonQuery, { first: DRINK_SOON_READ }).catch(
      () => null,
    ),
  ]);
  const bottles = openBottlesFromNodes(
    data?.me?.openBottles.edges.map((edge) => edge.node) ?? [],
  );
  const sealed = sealedSoonFromNodes(
    soonData?.me?.drinkSoon.edges.map((edge) => edge.node) ?? [],
  );
  if (bottles.length === 0 && sealed.length === 0) return null;
  return (
    <ContinueSection
      bottles={bottles}
      total={data?.me?.openBottles.totalCount ?? bottles.length}
      sealed={sealed}
      serverNow={Date.now()}
    />
  );
}

/** D1: friends' tier lists, a card of rows (Shell-Home "Friends ranked"). */
export async function FriendsRankedSection() {
  const data = await apiServerQuery(HomeFriendsRankedQuery, {
    first: FRIENDS_RANKED_LIMIT,
  }).catch(() => null);
  if (data === null) return null;
  const lists = unwrapResult(data.myTierLists, "TierListConnection");
  if (!lists.ok || lists.data.edges.length === 0) return null;
  return (
    <section aria-labelledby="friends-ranked" className="flex flex-col gap-2">
      <SectionHead
        id="friends-ranked"
        title="Friends ranked"
        action={
          <PressLink href="/tier-lists" className={SEE_ALL_CLASS}>
            See all
          </PressLink>
        }
      />
      <ul className="m-0 flex list-none flex-col divide-y divide-rule overflow-hidden rounded-md border border-edge bg-card p-0">
        {lists.data.edges.map(({ node }) => (
          <li
            key={node.id}
            className="px-3.5 has-[a[data-slot=link]:active]:bg-raised"
          >
            {node.createdBy === null ? (
              <div className="relative flex min-h-14 items-center gap-3">
                <Ranked
                  aria-hidden
                  strokeWidth={ICON_STROKE}
                  className="size-6 text-glyph"
                />
                <PressLink
                  href={`/tier-lists/${node.id}`}
                  overlay
                  className="t-head min-w-0 flex-1 truncate text-ink"
                >
                  {node.name}
                </PressLink>
              </div>
            ) : (
              <PersonRow
                displayName={node.createdBy.displayName}
                avatarUrl={node.createdBy.avatarUrl}
                name={
                  <PressLink href={`/tier-lists/${node.id}`} overlay>
                    {node.name}
                  </PressLink>
                }
                status={`${node.createdBy.displayName} · ${node.itemCount} ranked`}
                chevron
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The Friends feed's first page; the rest pages in on the client. */
export async function FriendsSection({ viewerId }: { viewerId: string }) {
  const data = await apiServerQuery(HomeFriendsFeedQuery, {
    first: FEED_PAGE_SIZE,
    after: null,
  }).catch(() => null);
  if (data === null) return null;
  const feed = data.me?.friendsFeed;
  const friends = unwrapResult(data.myFriends, "FriendConnection");
  return (
    <FriendsFeed
      initialNodes={feed?.edges.map((edge) => edge.node) ?? []}
      initialCursor={feed?.pageInfo.endCursor ?? null}
      initialHasMore={feed?.pageInfo.hasNextPage ?? false}
      friendCount={friends.ok ? (friends.data.totalCount ?? null) : null}
      viewerId={viewerId}
    />
  );
}

/** Nearby, pre-read from the location cookie when there is one. */
export async function NearbySectionServer() {
  const cachedLocation = await getGeolocationFromCookie();
  const initialPlaces: NearbyPlace[] | undefined = cachedLocation
    ? await apiServerQuery(SearchNearbyPlacesQuery, {
        location: {
          lat: cachedLocation.latitude,
          lng: cachedLocation.longitude,
        },
        categories: null,
        limit: NEARBY_PLACES_LIMIT,
        first: NEARBY_PLACES_LIMIT,
      })
        .then((data) =>
          nearbyPlacesFromNodes(
            data.me?.nearbyPlaces.edges.map((edge) => edge.node) ?? [],
          ),
        )
        .catch(() => undefined)
    : undefined;
  return (
    <NearbySection
      initialPlaces={initialPlaces}
      cachedLocation={cachedLocation}
    />
  );
}
