"use client";

import { Suspense } from "react";
import { PlaceDetails } from "./PlaceDetails";
import { PlaceDetailsShell } from "./PlaceDetailsShell";

export type PlacePaneProps = { placeId: string };

/**
 * A place's body inside the desktop pane (MC-panes, L32). Lead stub over
 * today's `PlaceDetails`; P2 replaces the body with the place page's own
 * sections at pane width, and P1 mounts it in F2a's `DesktopPane`.
 */
export function PlacePane({ placeId }: PlacePaneProps) {
  return (
    <div data-testid="place-pane">
      <Suspense fallback={<PlaceDetailsShell />}>
        <PlaceDetails placeId={placeId} />
      </Suspense>
    </div>
  );
}
