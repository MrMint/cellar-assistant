import { Box, CircularProgress, Typography } from "@mui/joy";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PlaceDetails } from "@/components/map/places/PlaceDetails";
import { getServerUserId } from "@/utilities/auth-server";

interface PlaceDetailsPageProps {
  params: Promise<{
    placeId: string;
  }>;
}

export default async function PlaceDetailsPage({
  params,
}: PlaceDetailsPageProps) {
  const { placeId } = await params;
  const userId = await getServerUserId();

  if (!placeId) {
    notFound();
  }

  return (
    <Box
      sx={{
        height: "100vh",
        overflow: "auto",
        p: 2,
      }}
    >
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
            <Typography>Loading place details...</Typography>
          </Box>
        }
      >
        <PlaceDetails placeId={placeId} userId={userId} />
      </Suspense>
    </Box>
  );
}
