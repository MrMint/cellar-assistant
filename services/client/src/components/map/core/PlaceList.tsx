"use client";

import { EmptyState } from "@/components/app/EmptyState";
import { NoResults, Place as PlaceGlyph } from "@/components/app/icons";
import { pressFeedback } from "@/components/app/overlays/press";
import { PlaceRow } from "@/components/app/parts/PlaceRow";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { PlaceResult, UserLocation } from "../types";
import { placeWhere } from "./map-places";
import { placeGlyph } from "./PlaceFilters";

/**
 * The map's list (Map board "In view"; desktop/Places): a heading with its
 * count and the distance origin ("from you", CROSS-LOT), then the kit's
 * `PlaceRow`s, nearest first. Tapping a row opens it (`onOpen`: the quick
 * look on a phone, the pane on desktop). A search that finds nothing says
 * so in the kit's words with Add a place and, while the search is bound to
 * the view, Search everywhere.
 */
export function PlaceList({
  places,
  origin,
  title,
  loading,
  query,
  globalSearch,
  selectedId,
  onOpen,
  onAddPlace,
  onSearchEverywhere,
  className,
}: {
  places: readonly PlaceResult[];
  origin: UserLocation | null;
  /** "In view", or "Results" while searching. */
  title: string;
  loading: boolean;
  /** The search as typed, trimmed; "" when not searching. */
  query: string;
  globalSearch: boolean;
  /** Desktop: the row whose pane is open. */
  selectedId?: string | null;
  onOpen: (index: number) => void;
  onAddPlace: () => void;
  onSearchEverywhere: () => void;
  className?: string;
}) {
  if (places.length === 0) {
    if (loading) {
      return (
        <div
          data-slot="map-list"
          aria-busy="true"
          className={cn("flex flex-col gap-2", className)}
        >
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} className="h-14 rounded-md" />
          ))}
        </div>
      );
    }
    return (
      <div data-slot="map-list" className={className}>
        {query !== "" ? (
          <EmptyState
            illustration={<NoResults aria-hidden />}
            title={`No place matches “${query}”`}
            action={
              <div className="flex flex-col items-center gap-2">
                <Button variant="outline" onClick={onAddPlace}>
                  Add a place
                </Button>
                {!globalSearch && (
                  <Button variant="quiet" onClick={onSearchEverywhere}>
                    Search everywhere
                  </Button>
                )}
              </div>
            }
          />
        ) : (
          <EmptyState
            illustration={<PlaceGlyph aria-hidden />}
            title="No places in view"
            action={
              <Button variant="outline" onClick={onAddPlace}>
                Add a place
              </Button>
            }
          />
        )}
      </div>
    );
  }

  return (
    <section
      data-slot="map-list"
      aria-label={title}
      className={cn("flex flex-col gap-2", className)}
    >
      <div className="flex min-h-8 items-baseline gap-2">
        <h2 className="t-head text-ink">{title}</h2>
        <span className="t-cap tabular text-ink-2">{places.length}</span>
        {origin !== null && (
          <span className="t-cap ml-auto text-ink-2">from you</span>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {places.map((place, index) => {
          const Glyph = placeGlyph(place);
          const selected = place.id === selectedId;
          return (
            <li key={place.id}>
              <PlaceRow
                className={cn(
                  "active:scale-97 motion-reduce:active:scale-100",
                  selected && "border-edge-2 bg-sel",
                )}
                glyph={Glyph}
                where={placeWhere(place, origin)}
                rating={place.rating ?? null}
                name={
                  <button
                    type="button"
                    data-slot="map-list-open"
                    aria-current={selected ? "true" : undefined}
                    onClick={() => onOpen(index)}
                    {...pressFeedback()}
                    className="text-left outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:outline-2 focus-visible:after:outline-act-ink focus-visible:after:-outline-offset-2"
                  >
                    {place.name}
                  </button>
                }
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
