"use client";

import { Suspense } from "react";
import { PlaceDetails } from "./PlaceDetails";
import { PlaceDetailsShell } from "./PlaceDetailsShell";

export type PlacePaneProps = { placeId: string };

/**
 * A place's body inside the desktop pane (MC-panes, L32): the place page's
 * own sections in one column at pane width, with no bar of its own (the
 * pane has its chrome). P1 mounts it in F2a's `DesktopPane`.
 */
export function PlacePane({ placeId }: PlacePaneProps) {
  return (
    <div data-testid="place-pane">
      <Suspense fallback={<PlaceDetailsShell />}>
        <PlaceDetails placeId={placeId} variant="pane" />
      </Suspense>
    </div>
  );
}
