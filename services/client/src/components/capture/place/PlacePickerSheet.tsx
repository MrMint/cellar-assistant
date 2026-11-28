"use client";

import { useMemo, useState } from "react";
import { useQuery } from "urql";
import { Add, ChevronRight, MapIcon, NoResults } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { KIND_GLYPH } from "@/components/map/core/PlaceFilters";
import { SearchField } from "@/components/shell/SearchField";
import { Button } from "@/components/ui/button";
import { unwrapResult } from "@/lib/api/result";
import type { KnownPlace } from "@/lib/capture/menu-place";
import { feedback } from "@/lib/feedback";
import { CapturePlaceSearchQuery } from "../queries";
import { foundLine, kindOf, nearbyLine, noMatchLine } from "./place-words";

/** Where a menu is filed: a place the person picked or confirmed. */
export type Chosen = Pick<KnownPlace, "id" | "name">;

/**
 * One place to tap (KIT § 2 "Place row"): 56 minimum, the kind glyph flat on
 * the raised well (54), the name in t-head, "kind · distance" in t-cap.
 */
function PlaceChoice({
  place,
  category,
  line,
  onChoose,
}: {
  place: Chosen;
  category: string | null | undefined;
  line: string;
  onChoose: (place: Chosen) => void;
}) {
  const Glyph = KIND_GLYPH[kindOf(category)];
  return (
    <li>
      <button
        type="button"
        data-slot="place-choice"
        onClick={() => {
          feedback("detent");
          onChoose({ id: place.id, name: place.name });
        }}
        className="flex min-h-14 w-full items-center gap-3 py-1.5 text-left outline-none transition-transform focus-visible:bg-raised active:scale-97 motion-reduce:active:scale-100"
      >
        <span className="flex size-[54px] shrink-0 items-center justify-center rounded-md bg-raised">
          <Glyph aria-hidden strokeWidth={1.25} className="size-6 text-glyph" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="t-head truncate text-ink">{place.name}</span>
          {line !== "" && (
            <span className="t-cap truncate text-ink-2">{line}</span>
          )}
        </span>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-3" />
      </button>
    </li>
  );
}

/**
 * FR-15 (F-229): the same quiet line the place page carries
 * (`GoogleAttribution`), under the picker's results — kit caption, ink-3.
 */
function GoogleLine() {
  return (
    <p className="t-cap m-0 text-ink-3" data-testid="google-attribution">
      Place details from Google
    </p>
  );
}

/**
 * The place picker sheet (Capture-Place 01 to 03): "Where's this menu
 * from?", a search, the places near you nearest first (the guess leads while
 * it is a candidate), and "Add a place". Distances say "from you" (ruling
 * 1). `MenuCapture` (K1) mounts it with these props; they do not change.
 */
export function PlacePickerSheet({
  open,
  onOpenChange,
  guess,
  nearby,
  onChoose,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guess: KnownPlace | null;
  nearby: readonly KnownPlace[];
  onChoose: (place: Chosen) => void;
  /** L10: add it inline (the photo stays); without a fix, the full form. */
  onAdd?: () => void;
}) {
  const [query, setQuery] = useState("");
  const searchingByName = query.length >= 2;
  const [{ data, fetching }] = useQuery({
    query: CapturePlaceSearchQuery,
    variables: { query, first: 8 },
    pause: !open || !searchingByName,
  });
  const found = useMemo(() => {
    const result = unwrapResult(data?.placeSearch, "PlaceSearchConnection");
    return result.ok ? result.data.edges.map(({ node }) => node) : [];
  }, [data]);
  const near = useMemo(
    () =>
      [...(guess === null ? [] : [guess]), ...nearby]
        .filter(
          (place, index, all) =>
            all.findIndex((other) => other.id === place.id) === index,
        )
        .sort((a, b) => a.distanceMeters - b.distanceMeters),
    [guess, nearby],
  );

  const addButton =
    onAdd === undefined ? (
      <Button variant="outline" className="w-full" asChild>
        <Link href="/map/create-place" underline="none">
          <MapIcon aria-hidden />
          Add a place
        </Link>
      </Button>
    ) : (
      <Button variant="outline" className="w-full" onClick={onAdd}>
        <Add aria-hidden />
        Add a place
      </Button>
    );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Where’s this menu from?"
      footer={addButton}
    >
      <div data-slot="place-picker" className="flex flex-col gap-4 pb-2">
        <SearchField
          onDebounced={(value) => setQuery(value.trim())}
          debounceTimeout={300}
          placeholder="Search places"
          searching={searchingByName && fetching}
        />
        {searchingByName ? (
          !fetching && found.length === 0 ? (
            <div
              role="status"
              className="flex flex-col items-center gap-3 py-6 text-center"
            >
              <NoResults aria-hidden className="size-7 text-glyph" />
              <p className="t-head m-0 text-ink">{noMatchLine(query)}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <ul
                aria-label="Places found"
                className="m-0 flex list-none flex-col p-0"
              >
                {found.map((place) => (
                  <PlaceChoice
                    key={place.id}
                    place={place}
                    category={place.primaryCategory}
                    line={foundLine(place.primaryCategory, place.locality)}
                    onChoose={onChoose}
                  />
                ))}
              </ul>
              {found.length > 0 && <GoogleLine />}
            </div>
          )
        ) : near.length === 0 ? (
          <p className="t-cap m-0 text-ink-2">
            Search for the bar, shop or restaurant by name.
          </p>
        ) : (
          <section aria-label="Near you" className="flex flex-col gap-1">
            <h3 className="t-cap m-0 text-ink-2">Near you</h3>
            <ul className="m-0 flex list-none flex-col p-0">
              {near.map((place) => (
                <PlaceChoice
                  key={place.id}
                  place={place}
                  category={place.category}
                  line={nearbyLine(place.category, place.distanceMeters)}
                  onChoose={onChoose}
                />
              ))}
            </ul>
            <GoogleLine />
          </section>
        )}
      </div>
    </ResponsiveDialog>
  );
}
