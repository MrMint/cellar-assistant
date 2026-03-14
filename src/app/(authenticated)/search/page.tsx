import {
  Box,
  Button,
  Card,
  CardCover,
  Chip,
  Grid,
  Skeleton,
  Stack,
  Typography,
} from "@mui/joy";
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
import {
  AnimatedDiscovery,
  AnimatedDiscoveryItem,
} from "@/components/search/AnimatedDiscovery";
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
import { serverQuery } from "@/lib/urql/server";
import { getServerUser } from "@/utilities/auth-server";

interface SearchPageProps {
  searchParams: Promise<{
    q?: string;
    image_results?: string;
    image_no_results?: string;
    barcode_results?: string;
    barcode_no_results?: string;
  }>;
}

const SearchResultsSkeleton = () => (
  <Grid container spacing={2}>
    {[1, 2, 3, 4, 5, 6].map((x) => (
      <Grid key={x} sx={{ overflow: "hidden" }} xs={12} sm={6} md={4} lg={2}>
        <Card sx={{ aspectRatio: { xs: 1.2, sm: 1 } }}>
          <CardCover>
            <Skeleton />
          </CardCover>
        </Card>
      </Grid>
    ))}
  </Grid>
);

const ContentSkeleton = () => (
  <Stack spacing={4}>
    <Stack spacing={1.5}>
      <Skeleton variant="text" level="title-lg" width="30%" />
      <Grid container spacing={1} columns={{ xs: 1, md: 2 }}>
        {[1, 2, 3, 4, 5, 6].map((x) => (
          <Grid key={x} xs={1}>
            <Card
              orientation="horizontal"
              variant="outlined"
              sx={{ "--Card-padding": "0.625rem" }}
            >
              <Skeleton
                variant="rectangular"
                width={44}
                height={44}
                sx={{ borderRadius: "md", flexShrink: 0 }}
              />
              <Stack spacing={0.5} sx={{ flex: 1 }}>
                <Skeleton variant="text" level="title-sm" width="60%" />
                <Skeleton variant="text" level="body-xs" width="80%" />
              </Stack>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Stack>
  </Stack>
);

export default async function Search({ searchParams }: SearchPageProps) {
  const resolvedSearchParams = await searchParams;
  const query = resolvedSearchParams.q;
  const imageResultsParam = resolvedSearchParams.image_results;
  const imageNoResults = resolvedSearchParams.image_no_results === "true";
  const barcodeResultsParam = resolvedSearchParams.barcode_results;
  const barcodeNoResults = resolvedSearchParams.barcode_no_results === "true";

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
        {/* Discovery: greeting + search render immediately, content streams in */}
        {!hasActiveSearch && (
          <Stack spacing={4}>
            <AnimatedDiscovery>
              <Stack
                spacing={3}
                alignItems="center"
                sx={{ pt: { xs: 2, sm: 4 } }}
              >
                <AnimatedDiscoveryItem>
                  <Greeting displayName={user.displayName} />
                </AnimatedDiscoveryItem>
                <AnimatedDiscoveryItem>
                  <Suspense
                    fallback={
                      <Skeleton
                        variant="text"
                        level="body-md"
                        width={180}
                        sx={{ mt: -1.5 }}
                      />
                    }
                  >
                    <CollectionStats userId={user.id} />
                  </Suspense>
                </AnimatedDiscoveryItem>
                <AnimatedDiscoveryItem>
                  <Box sx={{ width: "100%", maxWidth: 600 }}>
                    <ClientSearchInterface initialQuery={query} />
                  </Box>
                </AnimatedDiscoveryItem>
                <AnimatedDiscoveryItem>
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
                      <Link
                        key={href}
                        href={href}
                        style={{ textDecoration: "none" }}
                      >
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
                    ))}
                  </Stack>
                </AnimatedDiscoveryItem>
              </Stack>
            </AnimatedDiscovery>

            <Suspense fallback={<ContentSkeleton />}>
              <DiscoveryContent userId={user.id} />
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
                <Suspense fallback={<SearchResultsSkeleton />}>
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
      sx={{ color: "text.secondary", textAlign: "center", mt: -1.5 }}
    >
      {totalItems === 0
        ? "Your collection awaits. Start by adding your first item."
        : totalItems === 1
          ? `1 item across ${cellarCount} ${cellarCount === 1 ? "cellar" : "cellars"}`
          : `${totalItems} items across ${cellarCount} ${cellarCount === 1 ? "cellar" : "cellars"}`}
    </Typography>
  );
}

async function DiscoveryContent({ userId }: { userId: string }) {
  const data = await serverQuery(SearchDiscoveryQuery, { userId });

  const friendIds = data.user?.friends?.map((f) => f.friend.id) ?? [];
  const reviewUserIds = [userId, ...friendIds];
  const [reviewsData, tierListItemsData] = await Promise.all([
    serverQuery(RecentReviewsQuery, { userIds: reviewUserIds }),
    serverQuery(RecentTierListItemsQuery, { userIds: reviewUserIds }),
  ]);

  return (
    <SearchDiscoveryContent
      data={data}
      reviews={reviewsData.item_reviews}
      tierListItems={tierListItemsData.tier_list_items}
    />
  );
}
