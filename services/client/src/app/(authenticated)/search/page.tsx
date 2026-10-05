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
  collectionStatsLine,
  type SearchParams,
  searchStateFromParams,
} from "@/components/search/adapter";
import { ClientSearchInterface } from "@/components/search/ClientSearchInterface";
import { Greeting } from "@/components/search/Greeting";
import { SearchCollectionStatsQuery } from "@/components/search/queries";
import { ServerBarcodeResults } from "@/components/search/ServerBarcodeResults";
import { ServerSearchResults } from "@/components/search/ServerSearchResults";
import { apiServerQuery } from "@/lib/api/urql-server";
import { getServerUser } from "@/utilities/auth-server";

/**
 * `/search` — `82450ad1:src/app/(authenticated)/search/page.tsx`, restored.
 *
 * Landing view: greeting, the collection line, the search box and the five
 * quick links. Active search (`?q=`, `?barcode=`): the box and the results.
 *
 * Not restored, each by decision rather than omission:
 *
 * - **The discovery feed and the nearby-places strip** below the quick links
 *   (`RecentActivity`, `NearbyPlaces`, `?activity=`): chosen drops, G31 and
 *   e4 §6b. The schema has no cross-user activity field.
 * - **Image search** (the Photo button and `?image_results=`): chosen drop,
 *   G32. An old image-results link lands on a notice saying so.
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
  const state = searchStateFromParams(await searchParams);
  const { query, barcode, imageSearch, hasActiveSearch } = state;

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
          </Stack>
        )}

        {/* Active search: just search bar + results */}
        {hasActiveSearch && (
          <>
            <ClientSearchInterface initialQuery={query ?? undefined} />

            {imageSearch && (
              <Stack spacing={2}>
                <Typography level="title-lg">Image search results</Typography>
                <Stack spacing={2} alignItems="center" sx={{ py: 4 }}>
                  <Typography level="body-lg" sx={{ textAlign: "center" }}>
                    Image search is no longer available. Search by name or scan
                    a barcode instead.
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
