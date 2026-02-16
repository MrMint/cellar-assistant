import {
  Box,
  Button,
  Card,
  CardCover,
  Grid,
  Skeleton,
  Stack,
  Typography,
} from "@mui/joy";
import Link from "next/link";
import { Suspense } from "react";
import { MdAdd } from "react-icons/md";
import type { BarcodeSearchResult } from "@/components/common/OnboardingWizard/actors/types";
import { ItemCard } from "@/components/item/ItemCard";
import { ClientSearchInterface } from "@/components/search/ClientSearchInterface";
import { ServerSearchResults } from "@/components/search/ServerSearchResults";
import { formatItemType } from "@/utilities";
import { getServerUserId } from "@/utilities/auth-server";

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

export default async function Search({ searchParams }: SearchPageProps) {
  const resolvedSearchParams = await searchParams;
  const query = resolvedSearchParams.q;
  const imageResultsParam = resolvedSearchParams.image_results;
  const imageNoResults = resolvedSearchParams.image_no_results === "true";
  const barcodeResultsParam = resolvedSearchParams.barcode_results;
  const barcodeNoResults = resolvedSearchParams.barcode_no_results === "true";

  // Ensure user is authenticated (this will redirect if not)
  const _userId = await getServerUserId();

  // Parse image search results if present
  let imageResults: BarcodeSearchResult[] = [];
  if (imageResultsParam) {
    try {
      imageResults = JSON.parse(decodeURIComponent(imageResultsParam));
    } catch {
      // Invalid JSON, ignore
    }
  }

  // Parse barcode search results if present
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

  return (
    <Box>
      <Stack spacing={2}>
        <ClientSearchInterface initialQuery={query} />

        {/* Image search results */}
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
              <Grid container spacing={2}>
                {imageResults.map((item: BarcodeSearchResult) => (
                  <Grid
                    key={item.id}
                    xs={imageResults.length > 6 ? 6 : 12}
                    sm={6}
                    md={4}
                    lg={2}
                  >
                    <ItemCard
                      item={item}
                      type={item.type}
                      href={`${formatItemType(item.type).toLowerCase()}s/${item.id}`}
                    />
                  </Grid>
                ))}
              </Grid>
            )}
          </Stack>
        )}

        {/* Barcode search results */}
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
              <Grid container spacing={2}>
                {barcodeResults.map((item: BarcodeSearchResult) => (
                  <Grid
                    key={item.id}
                    xs={barcodeResults.length > 6 ? 6 : 12}
                    sm={6}
                    md={4}
                    lg={2}
                  >
                    <ItemCard
                      item={item}
                      type={item.type}
                      href={`${formatItemType(item.type).toLowerCase()}s/${item.id}`}
                    />
                  </Grid>
                ))}
              </Grid>
            )}
          </Stack>
        )}

        {/* Text search results */}
        {query && (
          <Stack spacing={2}>
            <Typography level="title-lg">
              Search results for "{query}"
            </Typography>
            <Suspense fallback={<SearchResultsSkeleton />}>
              <ServerSearchResults query={query} />
            </Suspense>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
