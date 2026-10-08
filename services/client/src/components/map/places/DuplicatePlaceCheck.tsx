"use client";

import { ICON_STROKE, Place } from "@/components/app/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DuplicatePlace } from "../actions";

interface DuplicatePlaceCheckProps {
  duplicates: DuplicatePlace[];
  onSelectExisting: (placeId: string) => void;
  onConfirmNew: () => void;
}

export function DuplicatePlaceCheck({
  duplicates,
  onSelectExisting,
  onConfirmNew,
}: DuplicatePlaceCheckProps) {
  if (duplicates.length === 0) return null;

  return (
    <div className="mb-4">
      <p className="type-callout mb-2 font-semibold text-ink-1">
        We found similar places nearby. Is yours one of these?
      </p>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg bg-surface-1">
        {duplicates.map((dup) => (
          <li
            key={dup.id}
            className="flex flex-row items-center justify-between gap-2 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-row items-center gap-2">
                <Place
                  aria-hidden
                  strokeWidth={ICON_STROKE}
                  className="size-5 shrink-0 text-ink-2"
                />
                <span className="type-callout truncate font-semibold text-ink-1">
                  {dup.name}
                </span>
              </div>
              <div className="mt-1 flex flex-row flex-wrap gap-1">
                {dup.primary_category && (
                  <Badge variant="secondary">
                    {dup.primary_category.replace(/_/g, " ")}
                  </Badge>
                )}
                <Badge variant="outline">
                  {Math.round(dup.distance_m)}m away
                </Badge>
                <Badge
                  variant="outline"
                  className={dup.similarity > 0.7 ? "text-ink-1" : "text-ink-3"}
                >
                  {Math.round(dup.similarity * 100)}% match
                </Badge>
              </div>
              {(dup.street_address || dup.locality) && (
                <p className="type-footnote mt-1 truncate">
                  {[dup.street_address, dup.locality]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
            </div>
            {/* type="button": this renders inside CreatePlaceForm's <form>,
                and a bare <button> there is a submit (Joy defaulted it). */}
            <Button
              type="button"
              variant="outline"
              onClick={() => onSelectExisting(dup.id)}
            >
              This is it
            </Button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="ghost"
        onClick={onConfirmNew}
        className="mt-2"
      >
        None of these — create new place
      </Button>
    </div>
  );
}
