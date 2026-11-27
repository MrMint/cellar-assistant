"use client";

import { DesktopPane } from "@/components/app/overlays/DesktopPane";
import { PlacePane } from "../places/PlacePane";
import type { PlaceResult } from "../types";
import { PlacePlate } from "./PlacePlate";

/**
 * Desktop places' pane (KIT § 3; L32): F2a's `DesktopPane` over the map's
 * left edge, beside the list, with P2's `PlacePane` as its body. Up and down
 * step through the list; expand opens the place's own page. It replaces the
 * phone's drawer from `md` up.
 */
export function MapPlacePane({
  place,
  open,
  onClose,
  onPrevious,
  onNext,
  onExpand,
}: {
  place: PlaceResult;
  open: boolean;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onExpand: () => void;
}) {
  return (
    <div
      data-slot="map-place-pane"
      className="absolute inset-y-0 left-0 z-[14] flex"
    >
      <DesktopPane
        open={open}
        onClose={onClose}
        title={place.name}
        photo={<PlacePlate place={place} />}
        onPrevious={onPrevious}
        onNext={onNext}
        onExpand={onExpand}
      >
        <PlacePane key={place.id} placeId={place.id} />
      </DesktopPane>
    </div>
  );
}
