import { Card, Grid, Skeleton, Stack } from "@mui/joy";

/** Placeholder cards — as many as a phone's first screen of results shows. */
const PLACEHOLDERS = [1, 2, 3, 4, 5, 6];

/**
 * The results skeleton (N01): shown while a search navigation is pending and
 * as the results' Suspense fallback, in the result grid's own columns.
 */
export function SearchResultsSkeleton() {
  return (
    <Grid container spacing={2} data-testid="search-results-skeleton">
      {PLACEHOLDERS.map((i) => (
        <Grid key={i} xs={6} sm={6} md={4} lg={2}>
          <Card sx={{ overflow: "hidden" }}>
            <Skeleton variant="rectangular" sx={{ aspectRatio: 1 }} />
            <Skeleton variant="text" sx={{ mx: 1, my: 1 }} />
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}

/** Placeholder rows for the landing view's activity feed. */
const DISCOVERY_ROWS = [1, 2, 3, 4];

/**
 * The landing view's discovery section while it streams: clearing the box
 * used to leave the region empty for a second or more between the results
 * skeleton and Recent Activity (UX lane, 2026-10-08).
 */
export function SearchDiscoverySkeleton() {
  return (
    <Stack spacing={2} data-testid="search-discovery-skeleton">
      <Skeleton variant="text" level="title-lg" sx={{ width: 180 }} />
      {DISCOVERY_ROWS.map((i) => (
        <Stack key={i} direction="row" spacing={2} alignItems="center">
          <Skeleton variant="rectangular" width={48} height={48} />
          <Stack spacing={0.5} sx={{ flex: 1 }}>
            <Skeleton variant="text" level="body-md" sx={{ width: "70%" }} />
            <Skeleton variant="text" level="body-sm" sx={{ width: "40%" }} />
          </Stack>
        </Stack>
      ))}
    </Stack>
  );
}
