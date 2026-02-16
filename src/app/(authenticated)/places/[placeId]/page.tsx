import { Box, CircularProgress, Typography } from "@mui/joy";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PlaceDetails } from "@/components/map/places/PlaceDetails";
import { getServerUserId } from "@/utilities/auth-server";
import { serverQuery } from "@/lib/urql/server";
import { enrichPlaceAction } from "@/app/(authenticated)/map/place-actions";
import {
  GET_PLACE_ENRICHMENT,
  transformDbEnrichment,
  transformDbPhotos,
} from "../queries";

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

  // Fetch enrichment from DB (already cached server-side for 30 days)
  let enrichmentData = await serverQuery(GET_PLACE_ENRICHMENT, { placeId });
  const place = enrichmentData.places_by_pk;

  // Trigger enrichment if missing, or if photos haven't been fetched yet
  const enrichment = place?.google_enrichment;
  const needsEnrichment = place && !enrichment;
  const needsPhotos =
    enrichment &&
    !enrichment.photos_fetched_at &&
    Array.isArray(enrichment.photo_references) &&
    enrichment.photo_references.length > 0;

  if (needsEnrichment || needsPhotos) {
    const result = await enrichPlaceAction({ placeId });
    if (result.success) {
      enrichmentData = await serverQuery(GET_PLACE_ENRICHMENT, { placeId });
    }
  }

  const serverEnrichment = transformDbEnrichment(
    enrichmentData.places_by_pk?.google_enrichment,
  );
  const serverPhotos = transformDbPhotos(
    enrichmentData.places_by_pk?.google_photos,
  );

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
        <PlaceDetails
          placeId={placeId}
          userId={userId}
          serverEnrichment={serverEnrichment}
          serverPhotos={serverPhotos}
        />
      </Suspense>
    </Box>
  );
}
