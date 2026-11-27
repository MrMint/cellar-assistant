"use client";

import { cn } from "@/lib/utils";
import { attributionLines } from "../adapter";
import type { PlaceEnrichment, PlaceGooglePhoto } from "../types/places";

/**
 * FR-15 (H-43): one quiet line on place pages, "Place details from Google",
 * in the kit's caption (`t-cap`, ink-3). The Places terms require Google's
 * attribution blocks wherever its data shows, so they follow on that line:
 * the enrichment's own blocks, then the photo authors' for the photos on
 * screen.
 */
export function GoogleAttribution({
  enrichment,
  photos = [],
  className,
}: {
  enrichment: PlaceEnrichment | null | undefined;
  photos?: PlaceGooglePhoto[];
  /** Layout only; the bottom margin (`mb-2`) can be overridden here. */
  className?: string;
}) {
  if (!enrichment) return null;
  const lines = attributionLines(enrichment.attributions);
  const photoLines = Array.from(
    new Set(photos.flatMap((photo) => attributionLines(photo.attributions))),
  );
  return (
    <p
      className={cn("t-cap mb-2 text-ink-3", className)}
      data-testid="google-attribution"
    >
      Place details from Google
      {lines.length > 0 && ` · ${lines.join(" · ")}`}
      {photoLines.length > 0 && ` · Photos: ${photoLines.join(", ")}`}
    </p>
  );
}
