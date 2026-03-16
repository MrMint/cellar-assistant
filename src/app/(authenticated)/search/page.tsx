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
import type { BarcodeSearchResult } from "@/components/common/OnboardingWizard/actors/types";
import { FadeIn, StaggerIn, StaggerItem } from "@/components/search/AnimateIn";
import { ClientSearchInterface } from "@/components/search/ClientSearchInterface";
import { Greeting } from "@/components/search/Greeting";
import { SearchDiscoveryContent } from "@/components/search/SearchDiscovery";
import {
  RecentReviewsQuery,
  RecentTierListItemsQuery,
  SearchDiscoveryQuery,
} from "@/components/search/fragments";
import { SearchResultGrid } from "@/components/search/SearchResultGrid";
import { ServerSearchResults } from "@/components/search/ServerSearchResults";
import type { ActivityKind } from "@/components/search/RecentActivity";
import { getGeolocationFromCookie } from "@/lib/geo-cookie/server";
import { serverQuery } from "@/lib/urql/server";
import { getServerUser } from "@/utilities/auth-server";

interface SearchPageProps {
  searchParams: Promise<{
    q?: string;
    image_results?: string;
    image_no_results?: string;
    barcode_results?: string;
    barcode_no_results?: string;
    activity?: string;
  }>;
}

export default async function Search({ searchParams }: SearchPageProps) {
  const resolvedSearchParams = await searchParams;
  const query = resolvedSearchParams.q;
  const imageResultsParam = resolvedSearchParams.image_results;
  const imageNoResults = resolvedSearchParams.image_no_results === "true";
  const barcodeResultsParam = resolvedSearchParams.barcode_results;
  const barcodeNoResults = resolvedSearchParams.barcode_no_results === "true";
  const activityParam = resolvedSearchParams.activity;

  const VALID_KINDS = new Set<ActivityKind>([
    "added",
    "reviewed",
    "tier-listed",
  ]);
  const activityKinds: ActivityKind[] = activityParam
    ? activityParam
        .split(",")
        .filter((k): k is ActivityKind => VALID_KINDS.has(k as ActivityKind))
    : [];

  const user = await getServerUser();

  let imageResults: BarcodeSearchResult[] = [];
  if (imageResultsParam) {
    try {
      imageResults = JSON.parse(decodeURIComponent(imageResultsParam));
    } catch {
      // Invalid JSON, ignore
    }
  }

  let barcodeResults: BarcodeSearchResult[] = [];
  if (barcodeResultsParam) {
    try {
      barcodeResults = JSON.parse(decodeURIComponent(barcodeResultsParam));
    } catch {
      // Invalid JSON, ignore
    }
  }

  const hasImageResults = imageResults.length > 0;
  const hasBarcodeResults = barcodeResults.length > 0;
  const hasActiveSearch =
    !!query ||
    hasImageResults ||
    hasBarcodeResults ||
    imageNoResults ||
    barcodeNoResults;

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
                  <CollectionStats userId={user.id} />
                </Suspense>
              </Box>
              <Box sx={{ width: "100%", maxWidth: 600 }}>
                <ClientSearchInterface initialQuery={query} />
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
              <DiscoveryContent
                userId={user.id}
                activityKinds={activityKinds}
              />
            </Suspense>
          </Stack>
        )}

        {/* Active search: just search bar + results */}
        {hasActiveSearch && (
          <>
            <ClientSearchInterface initialQuery={query} />

            {(hasImageResults || imageNoResults) && (
              <Stack spacing={2}>
                <Typography level="title-lg">Image search results</Typography>
                {imageNoResults ? (
                  <Stack spacing={2} alignItems="center" sx={{ py: 4 }}>
                    <Typography level="body-lg" sx={{ textAlign: "center" }}>
                      No items found matching the image
                    </Typography>
                    <Link href="/add" style={{ textDecoration: "none" }}>
                      <Button variant="outlined" startDecorator={<MdAdd />}>
                        Add an item
                      </Button>
                    </Link>
                  </Stack>
                ) : (
                  <SearchResultGrid items={imageResults} />
                )}
              </Stack>
            )}

            {(hasBarcodeResults || barcodeNoResults) && (
              <Stack spacing={2}>
                <Typography level="title-lg">Barcode search results</Typography>
                {barcodeNoResults ? (
                  <Stack spacing={2} alignItems="center" sx={{ py: 4 }}>
                    <Typography level="body-lg" sx={{ textAlign: "center" }}>
                      No items found matching the barcode
                    </Typography>
                    <Link href="/add" style={{ textDecoration: "none" }}>
                      <Button variant="outlined" startDecorator={<MdAdd />}>
                        Add an item
                      </Button>
                    </Link>
                  </Stack>
                ) : (
                  <SearchResultGrid items={barcodeResults} />
                )}
              </Stack>
            )}

            {query && (
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
 * Shares the same SearchDiscoveryQuery as DiscoveryContent (request-deduplicated).
 */
async function CollectionStats({ userId }: { userId: string }) {
  const data = await serverQuery(SearchDiscoveryQuery, { userId });

  const totalItems =
    (data.beers_aggregate.aggregate?.count ?? 0) +
    (data.wines_aggregate.aggregate?.count ?? 0) +
    (data.spirits_aggregate.aggregate?.count ?? 0) +
    (data.coffees_aggregate.aggregate?.count ?? 0) +
    (data.sakes_aggregate.aggregate?.count ?? 0);
  const cellarCount = data.cellars_aggregate.aggregate?.count ?? 0;

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
      {totalItems === 0
        ? "Your collection awaits. Start by adding your first item."
        : totalItems === 1
          ? `1 item across ${cellarCount} ${cellarCount === 1 ? "cellar" : "cellars"}`
          : `${totalItems} items across ${cellarCount} ${cellarCount === 1 ? "cellar" : "cellars"}`}
    </Typography>
  );
}

async function DiscoveryContent({
  userId,
  activityKinds,
}: {
  userId: string;
  activityKinds: ActivityKind[];
}) {
  const [data, cachedLocation] = await Promise.all([
    serverQuery(SearchDiscoveryQuery, { userId }),
    getGeolocationFromCookie(),
  ]);

  const friendIds = data.user?.friends?.map((f) => f.friend.id) ?? [];
  const reviewUserIds = [userId, ...friendIds];

  const noFilter = activityKinds.length === 0;
  const wantReviews = noFilter || activityKinds.includes("reviewed");
  const wantTierListed = noFilter || activityKinds.includes("tier-listed");

  // Pre-fetch nearby places server-side when we have a cached location
  const nearbyPromise = cachedLocation
    ? import("@/app/(authenticated)/map/actions").then(
        ({ searchMapPlaces }) => {
          const NEARBY_RADIUS_DEG = 0.018;
          const bounds = {
            north: cachedLocation.latitude + NEARBY_RADIUS_DEG,
            south: cachedLocation.latitude - NEARBY_RADIUS_DEG,
            east: cachedLocation.longitude + NEARBY_RADIUS_DEG,
            west: cachedLocation.longitude - NEARBY_RADIUS_DEG,
          };
          return searchMapPlaces({ bounds, limit: 6 });
        },
      )
    : Promise.resolve(null);

  const [reviewsData, tierListItemsData, nearbyResult] = await Promise.all([
    wantReviews
      ? serverQuery(RecentReviewsQuery, { userIds: reviewUserIds })
      : Promise.resolve({ item_reviews: [] as never[] }),
    wantTierListed
      ? serverQuery(RecentTierListItemsQuery, { userIds: reviewUserIds })
      : Promise.resolve({ tier_list_items: [] as never[] }),
    nearbyPromise.catch(() => null),
  ]);

  // Sort and limit nearby places, then fetch summaries
  let nearbyPlaces: import("@/components/map/types").PlaceResult[] | undefined;
  let nearbySummaries:
    | Record<
        string,
        import("@/app/(authenticated)/map/place-actions").PlaceSummary
      >
    | undefined;

  if (
    nearbyResult?.places &&
    nearbyResult.places.length > 0 &&
    cachedLocation
  ) {
    const sorted = [...nearbyResult.places].sort((a, b) => {
      const [aLng, aLat] = a.location.coordinates;
      const [bLng, bLat] = b.location.coordinates;
      const aDist =
        (aLat - cachedLocation.latitude) ** 2 +
        (aLng - cachedLocation.longitude) ** 2;
      const bDist =
        (bLat - cachedLocation.latitude) ** 2 +
        (bLng - cachedLocation.longitude) ** 2;
      return aDist - bDist;
    });
    nearbyPlaces = sorted.slice(0, 6);

    try {
      const { getPlaceSummaries } = await import(
        "@/app/(authenticated)/map/place-actions"
      );
      nearbySummaries = await getPlaceSummaries(nearbyPlaces.map((p) => p.id));
    } catch {
      // Summaries are optional — proceed without them
    }
  }

  // Filter cellar items (added) on the server when filter is active
  const wantAdded = noFilter || activityKinds.includes("added");
  const cellarItems = wantAdded ? data.recent_cellar_items : [];

  return (
    <SearchDiscoveryContent
      data={{ ...data, recent_cellar_items: cellarItems }}
      reviews={reviewsData.item_reviews}
      tierListItems={tierListItemsData.tier_list_items}
      activityKinds={activityKinds}
      nearbyPlaces={nearbyPlaces}
      nearbySummaries={nearbySummaries}
      cachedLocation={cachedLocation}
    />
  );
}
