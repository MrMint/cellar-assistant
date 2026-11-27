"use client";

import { IconButton } from "@/components/app/IconButton";
import { Close } from "@/components/app/icons";
import { Button } from "@/components/ui/button";

interface CenterPinOverlayProps {
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Uber-style center pin overlay for placing a new location.
 * The pin is CSS-positioned at the map center — the user pans/zooms
 * the map underneath it to select a location.
 */
export function CenterPinOverlay({
  onConfirm,
  onCancel,
}: CenterPinOverlayProps) {
  return (
    <>
      {/* Pin at visual center of map */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 z-[1100] -translate-x-1/2 -translate-y-full drop-shadow-md">
        <svg
          width="40"
          height="52"
          viewBox="0 0 40 52"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <title>Location pin for placing a new place on the map</title>
          {/* Pin body */}
          <path
            d="M20 0C8.954 0 0 8.954 0 20c0 14 20 32 20 32s20-18 20-32C40 8.954 31.046 0 20 0z"
            className="fill-primary"
          />
          {/* Inner circle */}
          <circle cx="20" cy="20" r="8" className="fill-primary-foreground" />
        </svg>
      </div>

      {/* Shadow dot at pin base for depth */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 z-[1099] size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/20" />

      {/* Bottom action bar, centred from md. The map already ends above the
          tab bar and the home indicator (N22), so on phones this clears only
          the attribution — 40 px, the bottom stack's own offset — instead of
          the old 80 px + safe area that made room for a nav the map ran
          under. */}
      <div className="absolute right-4 bottom-10 left-4 z-[1250] max-w-[400px] md:right-auto md:bottom-6 md:left-1/2 md:-translate-x-1/2">
        <div className="surface-glass flex flex-col items-center gap-3 rounded-lg p-4">
          <p className="t-body text-center">
            Move the map to position the pin on the place
          </p>
          <div className="flex w-full gap-2">
            <Button onClick={onConfirm} className="flex-1">
              Confirm Location
            </Button>
            <IconButton
              aria-label="Cancel adding place"
              variant="outline"
              onClick={onCancel}
            >
              <Close />
            </IconButton>
          </div>
        </div>
      </div>
    </>
  );
}
