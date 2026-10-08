import { Box, CircularProgress, Typography } from "@mui/joy";
import { Suspense } from "react";
import { MapWrapper } from "@/components/map/core/MapWrapper";
import { getGeolocationFromCookie } from "@/lib/geo-cookie/server";
import { getServerUser } from "@/utilities/auth-server";

/**
 * `82450ad1:src/app/(authenticated)/map/page.tsx`, restored: the xstate map
 * (`components/map`) opening at the cached-location cookie. `getServerUserId`
 * → `getServerUser().id`; the id only gates the tier-list filter query — no
 * request names whose map to draw.
 */
export const dynamic = "force-dynamic";

export default async function MapPage() {
  const [user, cachedLocation] = await Promise.all([
    getServerUser(),
    getGeolocationFromCookie(),
  ]);

  return (
    <Box
      sx={{
        // N22: fill the content area (map/layout.tsx), not the viewport.
        flex: "1 1 auto",
        minHeight: 0,
        height: "100%",
        width: "100%",
        backgroundColor: "background.surface",
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
        <MapWrapper userId={user.id} cachedLocation={cachedLocation} />
      </Suspense>
    </Box>
  );
}
