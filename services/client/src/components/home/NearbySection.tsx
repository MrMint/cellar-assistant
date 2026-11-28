"use client";

import { ICON_STROKE, MyLocation } from "@/components/app/icons";
import { locationPrePromptVisible } from "@/components/map/hooks/geolocation-store";
import { useGeolocation } from "@/components/map/hooks/useGeolocation";
import type { NearbyPlace } from "@/components/search/adapter";
import { NearbyPlaces } from "@/components/search/NearbyPlaces";
import { Button } from "@/components/ui/button";
import type { CachedLocation } from "@/lib/geo-cookie/parse";
import { SectionHead } from "./HomeLayout";

/** D14's one line, Home's version: why we are about to ask. */
export const HOME_LOCATION_COPY =
  "Use your location to see bars, shops and restaurants near you.";

/**
 * Home's Nearby (X10, D14). Nothing here asks the browser by itself: when the
 * browser has not been asked yet, the app says why in one line first, and
 * only "Use my location" raises the browser's prompt (the same store the
 * map uses, so a "Not now" here holds there too, for the session). Once
 * there is a position — or a cookie from an earlier one — it is the nearby
 * strip; a refusal shows nothing.
 */
export function NearbySection({
  initialPlaces,
  cachedLocation,
}: {
  initialPlaces?: NearbyPlace[];
  cachedLocation?: CachedLocation | null;
}) {
  const geo = useGeolocation();
  const hasInitial = initialPlaces !== undefined && initialPlaces.length > 0;

  if (!hasInitial && cachedLocation == null && locationPrePromptVisible(geo)) {
    return (
      <section aria-labelledby="nearby-heading" className="flex flex-col gap-2">
        <SectionHead id="nearby-heading" title="Nearby" />
        <div className="flex flex-col gap-3 rounded-md border border-edge bg-card px-3.5 py-3">
          <p className="t-body m-0 flex items-start gap-2 text-ink">
            <MyLocation
              aria-hidden
              strokeWidth={ICON_STROKE}
              className="mt-0.5 size-4 shrink-0 text-glyph"
            />
            {HOME_LOCATION_COPY}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="quiet" onClick={geo.dismiss}>
              Not now
            </Button>
            <Button variant="secondary" onClick={geo.request}>
              Use my location
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <NearbyPlaces
      initialPlaces={initialPlaces}
      cachedLocation={cachedLocation}
    />
  );
}
