import type { Metadata } from "next";
import { type ReactNode, Suspense } from "react";
import {
  type ActivityEntry,
  type ActivityKind,
  activityFeedFromNodes,
  activityKindsFromParams,
  apiActivityKinds,
  collectionStatsLine,
  type NearbyPlace,
  nearbyPlacesFromNodes,
  type SearchParams,
  searchPageHeading,
  searchPageTitle,
  searchStateFromParams,
} from "@/components/search/adapter";
import { ServerCatalogSections } from "@/components/search/CatalogSections";
import { Greeting } from "@/components/search/Greeting";
import {
  NEARBY_PLACES_LIMIT,
  RECENT_ACTIVITY_CAP,
  RECENT_ACTIVITY_PER_KIND,
  SearchCollectionStatsQuery,
  SearchNearbyPlacesQuery,
  SearchRecentActivityQuery,
} from "@/components/search/queries";
import { SearchDiscoveryContent } from "@/components/search/SearchDiscovery";
import { SearchPageLayout } from "@/components/search/SearchPageLayout";
import {
  SearchDiscoverySkeleton,
  SearchResultsSkeleton,
} from "@/components/search/SearchResultsSkeleton";
import { ServerBarcodeResults } from "@/components/search/ServerBarcodeResults";
import {
  ExpiredImageSearch,
  ServerImageResults,
} from "@/components/search/ServerImageResults";
import { ServerSearchResults } from "@/components/search/ServerSearchResults";
import { apiServerQuery } from "@/lib/api/urql-server";
import { getGeolocationFromCookie } from "@/lib/geo-cookie/server";
import { getServerUser } from "@/utilities/auth-server";

/**
 * `/search` — `82450ad1:src/app/(authenticated)/search/page.tsx`, restored.
 *
 * Landing view: greeting, the collection line, the search box, and the
 * discovery section under them — Recent Activity
 * (`?activity=`) and Nearby Places (G31, restored at the user's request over
 * `me.recentActivity` / `me.nearbyPlaces`). Active search (`?q=`,
 * `?barcode=`, `?image=`): the box and the results. Image search (the Photo
 * button, G32) is back: the photo is uploaded and `?image=` carries its file
 * id where the old `?image_results=` carried the rows themselves.
 *
 * Not restored, each by decision rather than omission:
 *
 * - **The five quick-link chips** (Cellars, Map, Tier Lists, Favorites,
 *   Rankings) — X01 deletes them: every one duplicated a tab (Cellar, Map) or
 *   a row of the Me hub (Tier lists, Loved, Top rated) one thumb-reach away.
 * - **The rewrite's tabs** (brands, people, recipes) and its two extra quick
 *   links: the old page had neither, and the old UI wins where they overlap
 *   (UI parity decision 2). Brand search lives on `/brands`, people on
 *   `/friends`, recipes on `/recipes`.
 */
export const dynamic = "force-dynamic";

interface SearchPageProps {
  searchParams: Promise<SearchParams>;
}

/** X21: "Home", or what is being searched for. Reads the URL only. */
export async function generateMetadata({
  searchParams,
}: SearchPageProps): Promise<Metadata> {
  return { title: searchPageTitle(searchStateFromParams(await searchParams)) };
}

export default async function Search({ searchParams }: SearchPageProps) {
  const resolvedSearchParams = await searchParams;
  const state = searchStateFromParams(resolvedSearchParams);
  const { query, barcode, imageFileId, legacyImageLink, hasActiveSearch } =
    state;
  const activityKinds = activityKindsFromParams(resolvedSearchParams);

  const user = await getServerUser();

  // One frame for both views, so the search box never remounts (N01).
  return (
    <SearchPageLayout
      urlQuery={query}
      heading={searchPageHeading(state)}
      landing={
        hasActiveSearch
          ? null
          : {
              hero: <LandingHero displayName={user.displayName} />,
            }
      }
    >
      {/* Discovery: the hero renders instantly from SSR, this streams in */}
      {!hasActiveSearch && (
        <Suspense fallback={<SearchDiscoverySkeleton />}>
          <DiscoveryContent activityKinds={activityKinds} />
        </Suspense>
      )}

      {hasActiveSearch && (
        <div className="flex flex-col gap-6">
          {imageFileId !== null && (
            <ResultsSection title="Image search results">
              <Suspense fallback={<SearchResultsSkeleton />}>
                <ServerImageResults imageFileId={imageFileId} />
              </Suspense>
            </ResultsSection>
          )}

          {imageFileId === null && legacyImageLink && (
            <ResultsSection title="Image search results">
              <ExpiredImageSearch />
            </ResultsSection>
          )}

          {barcode !== null && (
            <ResultsSection title="Barcode search results">
              <Suspense fallback={<SearchResultsSkeleton />}>
                <ServerBarcodeResults code={barcode} />
              </Suspense>
            </ResultsSection>
          )}

          {query !== null && (
            <ResultsSection
              title={<>Search results for &ldquo;{query}&rdquo;</>}
            >
              <Suspense fallback={<SearchResultsSkeleton />}>
                <ServerSearchResults query={query} />
              </Suspense>
            </ResultsSection>
          )}

          {/* D1: recipes and brands are reached from search now. Streams
              in on its own, so the items never wait for it. */}
          {query !== null && (
            <Suspense fallback={null}>
              <ServerCatalogSections query={query} />
            </Suspense>
          )}
        </div>
      )}
    </SearchPageLayout>
  );
}

/** One block of results under its heading. */
function ResultsSection({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="type-headline text-ink-1">{title}</h2>
      {children}
    </section>
  );
}

/** Greeting and the collection line, above the box on the landing view. */
function LandingHero({ displayName }: { displayName?: string }) {
  return (
    <div className="flex flex-col items-center gap-6">
      <Greeting displayName={displayName} />
      <div className="-mt-3 flex min-h-6 justify-center">
        <Suspense fallback={null}>
          <CollectionStats />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * Collection stats subtitle. Streams in under the greeting.
 *
 * `me.collectionStats` counts cellars the viewer created or co-owns and the
 * distinct items in them — the old page's question. The rewrite summed
 * `myCellars`, which also lists strangers' PUBLIC and friends' cellars (G36).
 * A failed read renders nothing, as an empty slot did while the old line was
 * still streaming.
 */
async function CollectionStats() {
  const data = await apiServerQuery(SearchCollectionStatsQuery);
  const stats = data.me?.collectionStats;
  if (stats === undefined) return null;

  return (
    <p className="type-body animate-in fade-in text-center text-ink-2 duration-(--ca-dur-medium) ease-enter">
      {collectionStatsLine(stats)}
    </p>
  );
}

/**
 * The old `DiscoveryContent`: the activity feed and, when the geolocation
 * cookie holds a position, the nearby strip's first page — both server-side,
 * streamed in under the hero.
 *
 * Each half fails on its own and renders as empty: the old page swallowed a
 * nearby failure (`nearbyPromise.catch(() => null)`), and a feed that cannot
 * load is better absent than an error over the landing view.
 */
async function DiscoveryContent({
  activityKinds,
}: {
  activityKinds: ActivityKind[];
}) {
  const cachedLocation = await getGeolocationFromCookie();

  const [feed, nearbyPlaces] = await Promise.all([
    apiServerQuery(SearchRecentActivityQuery, {
      kinds: apiActivityKinds(activityKinds),
      limit: RECENT_ACTIVITY_PER_KIND,
      first: RECENT_ACTIVITY_CAP,
    })
      .then((data): ActivityEntry[] =>
        activityFeedFromNodes(
          data.me?.recentActivity.edges.map((edge) => edge.node) ?? [],
          data.me?.id ?? null,
        ),
      )
      .catch((error: unknown): ActivityEntry[] => {
        console.error("Recent activity failed:", error);
        return [];
      }),
    cachedLocation
      ? apiServerQuery(SearchNearbyPlacesQuery, {
          location: {
            lat: cachedLocation.latitude,
            lng: cachedLocation.longitude,
          },
          categories: null,
          limit: NEARBY_PLACES_LIMIT,
          first: NEARBY_PLACES_LIMIT,
        })
          .then((data): NearbyPlace[] =>
            nearbyPlacesFromNodes(
              data.me?.nearbyPlaces.edges.map((edge) => edge.node) ?? [],
            ),
          )
          .catch((): undefined => undefined)
      : Promise.resolve(undefined),
  ]);

  return (
    <SearchDiscoveryContent
      feed={feed}
      activityKinds={activityKinds}
      nearbyPlaces={nearbyPlaces}
      cachedLocation={cachedLocation}
    />
  );
}
