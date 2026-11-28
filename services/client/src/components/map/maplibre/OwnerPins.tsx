"use client";

import { Marker } from "react-map-gl/maplibre";
import { BAND_FILL } from "@/components/app/parts/Rank";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import type { PlaceResult } from "../types";
import type { OwnerPin } from "./owner-pins";

/**
 * F-196 (H-38): the owner's pins over the map — the place's photo in a ring
 * of its band's colour, the public rating under it. A 44 px target; a tap
 * opens the place the way a symbol pin does.
 */
export function OwnerPins({
  pins,
  selectedId,
  onOpen,
}: {
  pins: readonly OwnerPin[];
  selectedId: string | null;
  onOpen: (place: PlaceResult) => void;
}) {
  return (
    <>
      {pins.map((pin) => {
        const [lng, lat] = pin.place.location.coordinates;
        const selected = pin.place.id === selectedId;
        return (
          <Marker
            key={pin.place.id}
            longitude={lng}
            latitude={lat}
            anchor="center"
            style={{ zIndex: selected ? 2 : 1 }}
          >
            <button
              type="button"
              data-slot="owner-pin"
              aria-label={pin.label}
              aria-pressed={selected}
              onClick={(event) => {
                event.stopPropagation();
                feedback("tick");
                onOpen(pin.place);
              }}
              className="flex size-11 flex-col items-center justify-center outline-none focus-visible:outline-2 focus-visible:outline-act-ink focus-visible:outline-offset-2"
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full p-[3px] shadow-md",
                  BAND_FILL[pin.band],
                  selected && "scale-110",
                )}
              >
                {pin.photo !== null ? (
                  // biome-ignore lint/performance/noImgElement: a presigned photo inside a MapLibre marker, sized by CSS; next/image adds nothing here.
                  <img
                    src={pin.photo}
                    alt=""
                    className="size-full rounded-full bg-raised object-cover"
                  />
                ) : (
                  <span className="t-cap flex size-full items-center justify-center rounded-full bg-surface-1 text-ink">
                    {pin.place.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </span>
              {pin.rating !== null && (
                <span className="t-cap tabular -mt-1.5 rounded-full bg-surface-1 px-1.5 text-ink shadow-sm">
                  {pin.rating}
                </span>
              )}
            </button>
          </Marker>
        );
      })}
    </>
  );
}
