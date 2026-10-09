import { cookies } from "next/headers";
import { EmptyState } from "@/components/app/EmptyState";
import {
  Camera,
  ChevronRight,
  ICON_STROKE,
  Ranked,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { InsetSection, ListRow } from "@/components/app/Page";
import { UserAvatar } from "@/components/app/UserAvatar";
import {
  collectionStatsLine,
  type NearbyPlace,
  nearbyPlacesFromNodes,
} from "@/components/search/adapter";
import {
  NEARBY_PLACES_LIMIT,
  SearchCollectionStatsQuery,
  SearchNearbyPlacesQuery,
} from "@/components/search/queries";
import { Button } from "@/components/ui/button";
import { readFragment } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import { apiServerQuery } from "@/lib/api/urql-server";
import { getGeolocationFromCookie } from "@/lib/geo-cookie/server";
import type { AiJob } from "./ai-jobs";
import { ContinueSection } from "./ContinueShelf";
import { openBottlesFromNodes } from "./continue";
import { FriendsFeed } from "./FriendsFeed";
import { HomeInbox } from "./HomeInbox";
import type { IncomingRequest, PendingSuggestion } from "./inbox";
import { NearbySection } from "./NearbySection";
import {
  AiJobFieldsFragment,
  CONTINUE_LIMIT,
  FEED_PAGE_SIZE,
  FRIENDS_RANKED_LIMIT,
  HomeContinueQuery,
  HomeFriendsFeedQuery,
  HomeFriendsRankedQuery,
  HomeInboxQuery,
} from "./queries";
import { parseSeenCookie, SEEN_COOKIE_NAME } from "./seen-cookie";

/*
 * Home "Today"'s server halves (X10). Each is its own async component behind
 * its own Suspense boundary on the page, so each streams in, and fails, on
 * its own: a section whose read fails renders nothing rather than an error
 * over the page — Home is a summary, and every row in it has a full page of
 * its own to show the error properly.
 */

/** "53 bottles across 4 cellars", under the greeting. */
export async function CollectionLine() {
  const stats = await apiServerQuery(SearchCollectionStatsQuery)
    .then((data) => data.me?.collectionStats)
    .catch(() => undefined);
  if (stats === undefined) return null;
  return (
    <p className="type-body animate-in fade-in text-ink-2 duration-(--ca-dur-medium) ease-enter">
      {collectionStatsLine(stats)}
    </p>
  );
}

/** The job tray and "Waiting on you". */
export async function InboxSection() {
  const [data, jar] = await Promise.all([
    apiServerQuery(HomeInboxQuery).catch(() => null),
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
  return (
    <HomeInbox
      initialJobs={jobs}
      suggestions={suggestions}
      requests={requests}
      initialSeen={parseSeenCookie(jar.get(SEEN_COOKIE_NAME)?.value)}
    />
  );
}

/**
 * Continue and Drink soon — or, for someone with no bottles at all yet,
 * N15's first-run line and its one action.
 */
export async function ContinueSectionServer() {
  const [data, stats] = await Promise.all([
    apiServerQuery(HomeContinueQuery, { first: CONTINUE_LIMIT }).catch(
      () => null,
    ),
    apiServerQuery(SearchCollectionStatsQuery)
      .then((answer) => answer.me?.collectionStats)
      .catch(() => undefined),
  ]);
  const bottles = openBottlesFromNodes(
    data?.me?.openBottles.edges.map((edge) => edge.node) ?? [],
  );
  if (bottles.length === 0) {
    if (stats?.itemCounts.total !== 0) return null;
    return (
      <div className="rounded-lg bg-surface-1">
        <EmptyState
          illustration={<Camera aria-hidden strokeWidth={1.5} />}
          title="Your cellar is waiting."
          description="Snap a label and the app fills in the rest."
          action={
            <Button asChild>
              <Link href="/add?mode=bottle" underline="none">
                Snap a bottle
              </Link>
            </Button>
          }
          className="px-2 py-6"
        />
      </div>
    );
  }
  return <ContinueSection bottles={bottles} serverNow={Date.now()} />;
}

/** D1: friends' tier lists, the card Home keeps for them. */
export async function FriendsRankedSection() {
  const data = await apiServerQuery(HomeFriendsRankedQuery, {
    first: FRIENDS_RANKED_LIMIT,
  }).catch(() => null);
  if (data === null) return null;
  const lists = unwrapResult(data.myTierLists, "TierListConnection");
  if (!lists.ok || lists.data.edges.length === 0) return null;
  const total = lists.data.totalCount ?? lists.data.edges.length;
  return (
    <InsetSection
      label="Friends ranked"
      aria-label="Friends ranked"
      action={
        <Link href="/tier-lists" className="type-footnote text-ink-1">
          {total > FRIENDS_RANKED_LIMIT ? `See all ${total}` : "See all"}
        </Link>
      }
    >
      {lists.data.edges.map(({ node }) => (
        <ListRow
          key={node.id}
          leading={
            node.createdBy === null ? (
              <Ranked
                aria-hidden
                strokeWidth={ICON_STROKE}
                className="size-5"
              />
            ) : (
              <UserAvatar
                avatarUrl={node.createdBy.avatarUrl}
                displayName={node.createdBy.displayName}
                size="sm"
              />
            )
          }
          title={
            <Link
              href={`/tier-lists/${node.id}`}
              overlay
              underline="none"
              className="text-ink-1"
            >
              {node.name}
            </Link>
          }
          description={[node.createdBy?.displayName, `${node.itemCount} ranked`]
            .filter(Boolean)
            .join(" · ")}
          trailing={
            <ChevronRight
              aria-hidden
              strokeWidth={ICON_STROKE}
              className="size-5"
            />
          }
        />
      ))}
    </InsetSection>
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
