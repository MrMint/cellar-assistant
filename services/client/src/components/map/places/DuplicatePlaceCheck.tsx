"use client";

import { ChevronRight } from "@/components/app/icons";
import { Button } from "@/components/ui/button";
import { feedback } from "@/lib/feedback";
import type { DuplicatePlace } from "../actions";
import { categoryWords, distanceWords } from "../core/map-places";
import { placeGlyph } from "../core/PlaceFilters";

interface DuplicatePlaceCheckProps {
  duplicates: DuplicatePlace[];
  onSelectExisting: (placeId: string) => void;
  onConfirmNew: () => void;
}

/** "Cocktail bar · 130 m from the pin", or "Here" when it is on the pin. */
export function duplicateLine(dup: DuplicatePlace): string {
  const distance = distanceWords(dup.distance_m);
  return [
    categoryWords(dup.primary_category ?? undefined),
    distance === "Here" ? "At the pin" : `${distance} from the pin`,
  ].join(" · ");
}

/**
 * F-200 (Places-Place 26, "create found"): "Already on the map?" — each
 * likely match is one row (kind glyph, name, kind and distance from the pin,
 * a chevron) that opens it, and "It’s a new place" says it is not one of
 * them. Every button is `type="button"`: this renders inside
 * CreatePlaceForm's <form>, where a bare <button> would submit it.
 */
export function DuplicatePlaceCheck({
  duplicates,
  onSelectExisting,
  onConfirmNew,
}: DuplicatePlaceCheckProps) {
  if (duplicates.length === 0) return null;

  return (
    <section
      aria-labelledby="duplicate-place-check"
      className="flex flex-col gap-3 rounded-lg border border-edge-2 bg-card p-3"
    >
      <h2 id="duplicate-place-check" className="t-head m-0 text-ink">
        Already on the map?
      </h2>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {duplicates.map((dup) => {
          const Glyph = placeGlyph({
            primary_category: dup.primary_category ?? "",
            categories: [],
          });
          return (
            <li key={dup.id}>
              <button
                type="button"
                onClick={() => {
                  feedback("press");
                  onSelectExisting(dup.id);
                }}
                className="flex min-h-14 w-full items-center gap-3 rounded-md text-left outline-none transition-transform active:scale-97 focus-visible:outline-2 focus-visible:outline-act-ink motion-reduce:active:scale-100"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-raised">
                  <Glyph aria-hidden className="size-6 text-glyph" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="t-head truncate text-ink">{dup.name}</span>
                  <span className="t-cap truncate text-ink-2">
                    {duplicateLine(dup)}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-5 text-ink-2" />
              </button>
            </li>
          );
        })}
      </ul>
      <Button type="button" variant="outline" size="lg" onClick={onConfirmNew}>
        It’s a new place
      </Button>
    </section>
  );
}
