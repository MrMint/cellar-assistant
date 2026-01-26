import { Box, CircularProgress, Typography } from "@mui/joy";
import { Suspense } from "react";
import { DiscoveryDashboard } from "@/components/map/discovery/DiscoveryDashboard";
import { getServerUserId } from "@/utilities/auth-server";

export default async function DiscoveriesPage() {
  const userId = await getServerUserId();

  return (
    <Box
      sx={{
        height: "100vh",
        overflow: "auto",
        p: 2,
      }}
    >
      <Typography level="h2" sx={{ mb: 3 }}>
        Your Discoveries
      </Typography>

      <Suspense
        fallback={
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "50vh",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <CircularProgress />
            <Typography>Loading discoveries...</Typography>
          </Box>
        }
      >
        <DiscoveryDashboard userId={userId} />
      </Suspense>
    </Box>
  );
}
