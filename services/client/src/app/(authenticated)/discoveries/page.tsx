import { Box, CircularProgress, Typography } from "@mui/joy";
import { Suspense } from "react";
import { DiscoveryDashboard } from "@/components/map/discovery/DiscoveryDashboard";

/** `82450ad1:src/app/(authenticated)/discoveries/page.tsx`, restored. */
export default function DiscoveriesPage() {
  return (
    <Box
      sx={{
        height: "100dvh",
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
        <DiscoveryDashboard />
      </Suspense>
    </Box>
  );
}
