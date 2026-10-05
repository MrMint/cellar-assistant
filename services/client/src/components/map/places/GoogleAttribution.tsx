"use client";

import { Typography } from "@mui/joy";
import { attributionLines } from "../adapter";
import type { PlaceEnrichment, PlaceGooglePhoto } from "../types/places";

/**
 * The old drawer and place page printed "Powered by Google" and nothing
 * else; the attribution blocks Google returns were fetched and dropped. The
 * Places terms require them wherever the data is shown, so they are printed
 * here, under the old line, in the old style: the enrichment's own blocks,
 * then the photo authors' for the photos on screen.
 */
export function GoogleAttribution({
  enrichment,
  photos = [],
  sx,
}: {
  enrichment: PlaceEnrichment | null | undefined;
  photos?: PlaceGooglePhoto[];
  sx?: Record<string, unknown>;
}) {
  if (!enrichment) return null;
  const lines = attributionLines(enrichment.attributions);
  const photoLines = Array.from(
    new Set(photos.flatMap((photo) => attributionLines(photo.attributions))),
  );
  return (
    <Typography
      level="body-xs"
      sx={{ color: "text.tertiary", mb: 1, ...sx }}
      data-testid="google-attribution"
    >
      Powered by Google
      {lines.length > 0 && ` · ${lines.join(" · ")}`}
      {photoLines.length > 0 && ` · Photos: ${photoLines.join(", ")}`}
    </Typography>
  );
}
