import { Box, CircularProgress, Typography } from "@mui/joy";
import { Suspense } from "react";
import { MapWrapper } from "@/components/map/core/MapWrapper";
import { getGeolocationFromCookie } from "@/lib/geo-cookie/server";
import { getServerUserId } from "@/utilities/auth-server";

export default async function MapPage() {
  const [userId, cachedLocation] = await Promise.all([
    getServerUserId(),
    getGeolocationFromCookie(),
  ]);

  return (
    <Box
      sx={{
        height: "100vh",
        width: "100%",
        position: "relative",
        overflow: "hidden",
        // Ensure map takes full available space
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Suspense
        fallback={
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <CircularProgress />
            <Typography>Loading map...</Typography>
          </Box>
        }
      >
        <MapWrapper userId={userId} cachedLocation={cachedLocation} />
      </Suspense>
    </Box>
  );
}
