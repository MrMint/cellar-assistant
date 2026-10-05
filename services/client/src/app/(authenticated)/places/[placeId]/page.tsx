import { Box, CircularProgress, Typography } from "@mui/joy";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PlaceDetails } from "@/components/map/places/PlaceDetails";

/**
 * `82450ad1:src/app/(authenticated)/places/[placeId]/page.tsx`, restored.
 *
 * The old page queried the enrichment **during render** and, when it was
 * missing, called Google from the server component before answering (§7).
 * `PlaceDetails` now reads the place on the client and asks for enrichment
 * from an effect (`usePlaceEnrichment`: once, then a bounded poll), and the
 * "On Lists" card comes from `Place.tierListEntries` instead of a server slot.
 */
export const dynamic = "force-dynamic";

interface PlaceDetailsPageProps {
  params: Promise<{
    placeId: string;
  }>;
}

export default async function PlaceDetailsPage({
  params,
}: PlaceDetailsPageProps) {
  const { placeId } = await params;

  if (!placeId) {
    notFound();
  }

  return (
    <Box
      sx={{
        height: "100dvh",
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
        <PlaceDetails placeId={placeId} />
      </Suspense>
    </Box>
  );
}
