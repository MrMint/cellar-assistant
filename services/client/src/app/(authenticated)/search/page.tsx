import { Box, Button, Chip, Stack, Typography } from "@mui/joy";
import Link from "next/link";
import { Suspense } from "react";
import {
  MdAdd,
  MdFavorite,
  MdHome,
  MdLeaderboard,
  MdMap,
  MdViewList,
} from "react-icons/md";
import { FadeIn, StaggerIn, StaggerItem } from "@/components/search/AnimateIn";
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
  searchStateFromParams,
} from "@/components/search/adapter";
import { ClientSearchInterface } from "@/components/search/ClientSearchInterface";
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
import { ServerBarcodeResults } from "@/components/search/ServerBarcodeResults";
import { ServerImageResults } from "@/components/search/ServerImageResults";
import { ServerSearchResults } from "@/components/search/ServerSearchResults";
import { apiServerQuery } from "@/lib/api/urql-server";
import { getGeolocationFromCookie } from "@/lib/geo-cookie/server";
import { getServerUser } from "@/utilities/auth-server";

/**
 * `/search` — `82450ad1:src/app/(authenticated)/search/page.tsx`, restored.
 *
 * Landing view: greeting, the collection line, the search box, the five
 * quick links, and the discovery section under them — Recent Activity
 * (`?activity=`) and Nearby Places (G31, restored at the user's request over
 * `me.recentActivity` / `me.nearbyPlaces`). Active search (`?q=`,
 * `?barcode=`, `?image=`): the box and the results. Image search (the Photo
 * button, G32) is back: the photo is uploaded and `?image=` carries its file
 * id where the old `?image_results=` carried the rows themselves.
 *
 * Not restored, each by decision rather than omission:
 *
 * - **The rewrite's tabs** (brands, people, recipes) and its two extra quick
 *   links: the old page had neither, and the old UI wins where they overlap
 *   (UI parity decision 2). Brand search lives on `/brands`, people on
 *   `/friends`, recipes on `/recipes`.
 */
export const dynamic = "force-dynamic";

interface SearchPageProps {
  searchParams: Promise<SearchParams>;
}

export default async function Search({ searchParams }: SearchPageProps) {
  const resolvedSearchParams = await searchParams;
  const state = searchStateFromParams(resolvedSearchParams);
  const { query, barcode, imageFileId, legacyImageLink, hasActiveSearch } =
    state;
  const activityKinds = activityKindsFromParams(resolvedSearchParams);

  const user = await getServerUser();

  return (
    <Box>
      <Stack spacing={3}>
        {/* Discovery: hero renders instantly from SSR, async content streams in */}
        {!hasActiveSearch && (
          <Stack spacing={4}>
            <Stack
              spacing={3}
              alignItems="center"
              sx={{ pt: { xs: 2, sm: 4 } }}
            >
              <FadeIn>
                <Greeting displayName={user.displayName} />
              </FadeIn>
              <Box
                sx={{
                  minHeight: "1.5rem",
                  mt: -1.5,
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <Suspense fallback={null}>
                  <CollectionStats />
                </Suspense>
              </Box>
              <Box sx={{ width: "100%", maxWidth: 600 }}>
                <ClientSearchInterface initialQuery={query ?? undefined} />
              </Box>
              <StaggerIn>
                <Stack
                  direction="row"
                  spacing={1}
                  flexWrap="wrap"
                  justifyContent="center"
                  useFlexGap
                >
                  {[
                    { href: "/cellars", label: "Cellars", icon: <MdHome /> },
                    { href: "/map", label: "Map", icon: <MdMap /> },
                    {
                      href: "/tier-lists",
                      label: "Tier Lists",
                      icon: <MdViewList />,
                    },
                    {
                      href: "/favorites",
                      label: "Favorites",
                      icon: <MdFavorite />,
                    },
                    {
                      href: "/rankings",
                      label: "Rankings",
                      icon: <MdLeaderboard />,
                    },
                  ].map(({ href, label, icon }) => (
                    <StaggerItem key={href}>
                      <Link href={href} style={{ textDecoration: "none" }}>
                        <Chip
                          variant="outlined"
                          startDecorator={icon}
                          sx={{
                            cursor: "pointer",
                            "--Chip-minHeight": "32px",
                            fontSize: "sm",
                          }}
                        >
                          {label}
                        </Chip>
                      </Link>
                    </StaggerItem>
                  ))}
                </Stack>
              </StaggerIn>
            </Stack>

            <Suspense fallback={null}>
              <DiscoveryContent activityKinds={activityKinds} />
            </Suspense>
          </Stack>
        )}

        {/* Active search: just search bar + results */}
        {hasActiveSearch && (
          <>
            <ClientSearchInterface initialQuery={query ?? undefined} />

            {imageFileId !== null && (
              <Stack spacing={2}>
                <Typography level="title-lg">Image search results</Typography>
                <Suspense fallback={null}>
                  <ServerImageResults imageFileId={imageFileId} />
                </Suspense>
              </Stack>
            )}

            {imageFileId === null && legacyImageLink && (
              <Stack spacing={2}>
                <Typography level="title-lg">Image search results</Typography>
                <Stack spacing={2} alignItems="center" sx={{ py: 4 }}>
                  <Typography level="body-lg" sx={{ textAlign: "center" }}>
                    This image search link has expired. Tap Photo to search with
                    a new picture.
                  </Typography>
                  <Link href="/add" style={{ textDecoration: "none" }}>
                    <Button variant="outlined" startDecorator={<MdAdd />}>
                      Add an item
                    </Button>
                  </Link>
                </Stack>
              </Stack>
            )}

            {barcode !== null && (
              <Stack spacing={2}>
                <Typography level="title-lg">Barcode search results</Typography>
                <Suspense fallback={null}>
                  <ServerBarcodeResults code={barcode} />
                </Suspense>
              </Stack>
            )}

            {query !== null && (
              <Stack spacing={2}>
                <Typography level="title-lg">
                  Search results for &ldquo;{query}&rdquo;
                </Typography>
                <Suspense fallback={null}>
                  <ServerSearchResults query={query} />
                </Suspense>
              </Stack>
            )}
          </>
        )}
      </Stack>
    </Box>
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
    <Typography
      level="body-md"
      sx={{
        color: "text.secondary",
        textAlign: "center",
        "@keyframes fadeIn": {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        animation: "fadeIn 0.3s ease-out",
      }}
    >
      {collectionStatsLine(stats)}
    </Typography>
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
