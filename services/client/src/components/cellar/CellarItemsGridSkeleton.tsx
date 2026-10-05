import { Card, Grid, Skeleton } from "@mui/joy";

/**
 * Skeleton placeholder for the items grid.
 * Used as Suspense fallback while items are loading.
 */
export function CellarItemsGridSkeleton() {
  return (
    <Grid container spacing={2}>
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <Grid key={i} xs={6} sm={6} md={4} lg={3} xl={2}>
          <Card sx={{ overflow: "hidden" }}>
            <Skeleton
              variant="rectangular"
              sx={{ aspectRatio: { xs: 1.2, sm: 1 } }}
            />
            <Skeleton variant="text" sx={{ mx: 1, my: 1 }} />
            <Skeleton variant="rectangular" height={40} />
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}
