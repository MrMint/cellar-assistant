"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "urql";
import {
  AddPlace,
  ChevronRight,
  MapIcon,
  Place,
  Search,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { formatCategoryName } from "@/components/map/places/place-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { unwrapResult } from "@/lib/api/result";
import { formatDistance, type KnownPlace } from "@/lib/capture/menu-place";
import { cn } from "@/lib/utils";
import { CapturePlaceSearchQuery } from "../queries";

/** Where a menu is filed: a place the person picked or confirmed. */
export type Chosen = Pick<KnownPlace, "id" | "name">;

/**
 * The place picker sheet (Capture-Place): the guess, the rest nearby, a
 * name search, and "add it". Moved verbatim out of `MenuCapture` by the
 * lead so K2 owns it; `MenuCapture` (K1) mounts it with these props.
 */

/** One place to tap in the picker. */
function PlaceChoice({
  place,
  detail,
  emphasis = false,
  onChoose,
}: {
  place: Chosen;
  detail?: string;
  emphasis?: boolean;
  onChoose: (place: Chosen) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onChoose(place)}
        className={cn(
          "flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left outline-none active:bg-surface-3 focus-visible:bg-surface-3",
        )}
      >
        <Place
          aria-hidden
          className="size-5 shrink-0 text-ink-2"
          strokeWidth={1.75}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className={cn(
              "truncate text-ink-1",
              emphasis ? "type-headline" : "type-body",
            )}
          >
            {place.name}
          </span>
          {detail !== undefined && detail !== "" && (
            <span className="type-footnote truncate">{detail}</span>
          )}
        </span>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-3" />
      </button>
    </li>
  );
}

const detailOf = (place: KnownPlace): string =>
  [
    place.category ? formatCategoryName(place.category) : null,
    formatDistance(place.distanceMeters),
  ]
    .filter(Boolean)
    .join(" · ");

/** The picker: the guess, the rest nearby, a name search, and "add it". */
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
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const [{ data, fetching }] = useQuery({
    query: CapturePlaceSearchQuery,
    variables: { query: debounced, first: 8 },
    pause: !open || debounced.length < 2,
  });
  const found = useMemo(() => {
    const result = unwrapResult(data?.placeSearch, "PlaceSearchConnection");
    return result.ok ? result.data.edges.map(({ node }) => node) : [];
  }, [data]);
  const searchingByName = debounced.length >= 2;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Where's this menu from?"
      footer={
        onAdd === undefined ? (
          <Button variant="ghost" asChild>
            <Link href="/map/create-place" underline="none">
              <MapIcon aria-hidden />
              Not listed? Add the place
            </Link>
          </Button>
        ) : (
          <Button variant="ghost" onClick={onAdd}>
            <AddPlace aria-hidden />
            Not listed? Add the place
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-3 pb-2">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search places by name"
            aria-label="Search places by name"
            className="pl-9"
          />
        </div>
        {searchingByName ? (
          fetching && found.length === 0 ? (
            <p
              role="status"
              className="type-callout flex items-center gap-2 px-1 text-ink-2"
            >
              <Spinner aria-hidden className="size-4" />
              Searching…
            </p>
          ) : found.length === 0 ? (
            <p className="type-callout px-1 text-ink-2">
              No place by that name yet.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg bg-surface-1">
              {found.map((place) => (
                <PlaceChoice
                  key={place.id}
                  place={place}
                  detail={[
                    place.primaryCategory
                      ? formatCategoryName(place.primaryCategory)
                      : null,
                    place.locality,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  onChoose={onChoose}
                />
              ))}
            </ul>
          )
        ) : guess === null && nearby.length === 0 ? (
          <p className="type-callout px-1 text-ink-2">
            Search for the bar, shop or restaurant by name.
          </p>
        ) : (
          <ul
            aria-label="Places near you"
            className="flex flex-col divide-y divide-line overflow-hidden rounded-lg bg-surface-1"
          >
            {guess !== null && (
              <PlaceChoice
                place={guess}
                detail={`Nearest · ${formatDistance(guess.distanceMeters)}`}
                emphasis
                onChoose={onChoose}
              />
            )}
            {nearby.map((place) => (
              <PlaceChoice
                key={place.id}
                place={place}
                detail={detailOf(place)}
                onChoose={onChoose}
              />
            ))}
          </ul>
        )}
      </div>
    </ResponsiveDialog>
  );
}
