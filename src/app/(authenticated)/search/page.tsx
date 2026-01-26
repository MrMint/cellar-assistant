import {
  Box,
  Card,
  CardCover,
  Grid,
  Skeleton,
  Stack,
  Typography,
} from "@mui/joy";
import { Suspense } from "react";
import { ClientSearchInterface } from "@/components/search/ClientSearchInterface";
import { ServerSearchResults } from "@/components/search/ServerSearchResults";
import { getServerUserId } from "@/utilities/auth-server";

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
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

  // Ensure user is authenticated (this will redirect if not)
  const _userId = await getServerUserId();

  return (
    <Box>
      <Stack spacing={2}>
        <ClientSearchInterface initialQuery={query} />

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
