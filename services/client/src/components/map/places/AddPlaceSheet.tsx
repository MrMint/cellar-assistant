"use client";

import { useEffect, useState } from "react";
import { IconButton } from "@/components/app/IconButton";
import { Close } from "@/components/app/icons";
import { useOverlayLayer } from "@/components/app/overlays/layers";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { CreatePlaceForm } from "./CreatePlaceForm";

interface AddPlaceSheetProps {
  /** The map's centre, where the pin stands (settled after each drag). */
  latitude: number;
  longitude: number;
  /** N22: the searched name "Add it here" carried in. */
  initialName: string;
  /** From md: a panel at the map's left edge; below md, over its foot. */
  desktop: boolean;
  onCancel: () => void;
  /** A created place, or the existing one the duplicate check offered. */
  onOpenPlace: (placeId: string) => void;
  /** The sheet's size along the map's axis it covers, for the map's padding. */
  onSize?: (px: number) => void;
}

/**
 * FS-1 / H-140 (Map board 24–26): Add a place as a sheet over the live map.
 * The person drags the map under the centre pin; the sheet holds the name,
 * the kind chips and "Add here" — B24B's `CreatePlaceForm`, with its
 * duplicate check and create path, hosted rather than on a page of its own.
 */
export function AddPlaceSheet({
  latitude,
  longitude,
  initialName,
  desktop,
  onCancel,
  onOpenPlace,
  onSize,
}: AddPlaceSheetProps) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  // KIT § 4: Esc and Back close what is on top — this sheet, while it is up.
  useOverlayLayer(true, onCancel, { escape: true });

  useEffect(() => {
    if (!element || !onSize) return;
    const report = () =>
      onSize(desktop ? element.offsetWidth + 12 : element.offsetHeight);
    report();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, onSize, desktop]);

  return (
    <section
      ref={setElement}
      data-slot="add-place-sheet"
      aria-labelledby="add-place-sheet-title"
      className={cn(
        "absolute z-[13] flex flex-col bg-surface-1",
        desktop
          ? "top-3 left-3 max-h-[calc(100%-24px)] w-[380px] rounded-lg border border-edge shadow-dock"
          : "inset-x-0 bottom-0 max-h-[62%] rounded-t-lg border-edge border-t shadow-dock",
      )}
    >
      {!desktop && (
        <div className="flex h-6 shrink-0 items-end justify-center">
          <span aria-hidden className="h-1 w-9 rounded-grabber bg-edge-2" />
        </div>
      )}
      <div className="flex shrink-0 flex-col gap-1 px-4 pt-3 pb-3">
        <div className="flex items-center gap-2">
          <h2
            id="add-place-sheet-title"
            className="t-title m-0 min-w-0 flex-1 text-ink"
          >
            Add a place
          </h2>
          <IconButton
            aria-label="Cancel"
            onClick={() => {
              feedback("tick");
              onCancel();
            }}
          >
            <Close />
          </IconButton>
        </div>
        <p className="t-cap m-0 text-ink-2">Drag the map to set the spot</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        <CreatePlaceForm
          latitude={latitude}
          longitude={longitude}
          initialName={initialName}
          sheet={{ onCancel, onOpenPlace }}
        />
      </div>
    </section>
  );
}
