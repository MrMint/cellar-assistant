"use client";

import { IconButton } from "@/components/app/IconButton";
import { Close, ErrorIcon, ICON_STROKE } from "@/components/app/icons";

interface MapErrorBannerProps {
  message: string;
  /** Omitted for an error the map clears by itself (a places fetch). */
  onDismiss?: () => void;
}

/**
 * The map's one error card — "Location is off for this site…", a failed
 * places fetch. Placed by `MapBottomStack`, first of the map's bottom cards:
 * it used to sit at `top: 80`, under the search/filter panel, so on a phone
 * only its last line showed and the message could not be read.
 */
export function MapErrorBanner({ message, onDismiss }: MapErrorBannerProps) {
  return (
    <div
      role="alert"
      data-slot="map-error"
      className="flex items-start gap-3 rounded-md border border-destructive/60 bg-surface-2 py-3 pr-1.5 pl-4 text-destructive shadow-md"
    >
      <ErrorIcon
        aria-hidden
        strokeWidth={ICON_STROKE}
        className="mt-0.5 size-4 shrink-0"
      />
      <p className="type-callout min-w-0 flex-1 self-center">{message}</p>
      {onDismiss ? (
        <IconButton
          aria-label="Dismiss"
          size="sm"
          onClick={onDismiss}
          className="-my-1.5 shrink-0 text-destructive hover:text-destructive"
        >
          <Close />
        </IconButton>
      ) : null}
    </div>
  );
}
