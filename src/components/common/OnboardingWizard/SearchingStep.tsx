import { Card, Grid, LinearProgress, Stack, Typography } from "@mui/joy";

export const SearchingStep = () => (
  <Grid container spacing={2}>
    <Grid xs={12} sm={12} md={6}>
      <Card>
        <Stack spacing={2}>
          <Typography level="title-lg" textAlign="center">
            Searching...
          </Typography>
          <LinearProgress />
        </Stack>
      </Card>
    </Grid>
  </Grid>
);
