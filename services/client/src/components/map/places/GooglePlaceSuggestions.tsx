"use client";

import { ICON_STROKE, Place } from "@/components/app/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { GoogleNearbyPlace } from "../actions";

interface GooglePlaceSuggestionsProps {
  places: GoogleNearbyPlace[];
  loading: boolean;
  onSelect: (place: GoogleNearbyPlace) => void;
  onDismiss: () => void;
}

/** Maps Google place types to user-friendly labels. */
function formatPlaceType(type: string): string {
  return type.replace(/_/g, " ");
}

export function GooglePlaceSuggestions({
  places,
  loading,
  onSelect,
  onDismiss,
}: GooglePlaceSuggestionsProps) {
  if (loading) {
    return (
      <div className="mb-4 flex items-center gap-2">
        <Spinner className="text-ink-2" />
        <p className="t-body text-ink-2">
          Checking for known places nearby...
        </p>
      </div>
    );
  }

  if (places.length === 0) return null;

  return (
    <div className="mb-4">
      <p className="t-body mb-2 font-semibold text-ink">
        We found these places nearby. Is yours one of them?
      </p>
      <ul className="flex flex-col gap-2">
        {places.map((place) => (
          <li
            key={place.googlePlaceId}
            className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Place
                  aria-hidden
                  strokeWidth={ICON_STROKE}
                  className="size-5 shrink-0 text-ink-2"
                />
                <p className="t-body truncate font-semibold text-ink">
                  {place.name}
                </p>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {place.types.slice(0, 2).map((type) => (
                  <Badge key={type} variant="secondary">
                    {formatPlaceType(type)}
                  </Badge>
                ))}
              </div>
              {place.address && (
                <p className="t-cap mt-1 truncate">{place.address}</p>
              )}
            </div>
            <Button variant="outline" onClick={() => onSelect(place)}>
              This is it
            </Button>
          </li>
        ))}
      </ul>
      <Button
        variant="ghost"
        onClick={onDismiss}
        className="mt-2 h-auto min-h-11 whitespace-normal text-left"
      >
        None of these — I'll enter details manually
      </Button>
    </div>
  );
}
