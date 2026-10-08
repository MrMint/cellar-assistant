import { Card, Grid, Skeleton } from "@mui/joy";

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
