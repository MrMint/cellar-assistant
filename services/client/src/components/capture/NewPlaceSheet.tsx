"use client";

import { useEffect, useId, useState } from "react";
import {
  Back,
  Cocktail,
  ErrorIcon,
  More,
  Place,
  Store,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import {
  BeerGlyph,
  CoffeeGlyph,
  FoodGlyph,
  WineGlyph,
} from "@/components/app/parts/glyphs";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { usePlaceActions } from "@/components/map/actions";
import { categoryWords } from "@/components/map/core/map-places";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { KnownPlace } from "@/lib/capture/menu-place";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import {
  categoryFromTypes,
  kindLabel,
  likelyDuplicate,
  type NamePrefill,
  NEW_PLACE_CATEGORIES,
  NEW_PLACE_KINDS,
  NEW_PLACE_WITHIN_METERS,
  namePrefill,
  newPlaceInput,
  pinnedLine,
  pinnedShort,
} from "./new-place";
import { distanceFromYou } from "./place/place-words";

/** Each of the six kinds' glyph (Capture-Place 04). */
/** The six kinds' glyphs (Capture-Place 04; the map's create form too). */
export const KIND_ICON = {
  Coffee: CoffeeGlyph,
  Food: FoodGlyph,
  Bar: Cocktail,
  Beer: BeerGlyph,
  Wine: WineGlyph,
  Shop: Store,
} as const;

export type CreatedPlace = {
  id: string;
  name: string;
  category: string;
};

/**
 * L10 · "Add a place" (Capture-Place 04 to 07): no place the app knows is
 * within 50 m, so the place is added here, inline, before the scan goes
 * (L24) — and the held photo is not lost to a page change. Six kinds and
 * "More kinds" (K2 ruling); a name a nearby place already has asks "On the
 * map?" first; "Full form" is the map's create page.
 *
 * Prefilled from the nearest listing (one budgeted Google nearby read; "Details
 * pending" when D16's budget says no) and pinned at the person's fix. Nothing
 * is created until "Add place", and what is created is Under review (D28).
 * The `placeId` is minted once per open sheet, so a retry after a dropped
 * response returns the place it already made (N09).
 */
export function NewPlaceSheet({
  open,
  onOpenChange,
  location,
  hasPhoto,
  onCreated,
  onPickInstead,
  nearby = [],
  onChooseExisting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The person's fix. `accuracy` (metres, the Geolocation API's
   * `coords.accuracy`) is optional: the board's "about 12 m accurate" shows
   * when the caller has it (W-16).
   */
  location: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
  } | null;
  /** A photo is held: the confirm also sends it. */
  hasPhoto: boolean;
  onCreated: (place: CreatedPlace) => void;
  /** Back to the place picker (the sheet's back control). */
  onPickInstead: () => void;
  /**
   * Places the app knows near by. With `onChooseExisting`, a name typed that
   * one of them already has asks "On the map?" (Capture-Place 07) before a
   * second copy is made.
   */
  nearby?: readonly KnownPlace[];
  onChooseExisting?: (place: Pick<KnownPlace, "id" | "name">) => void;
}) {
  const { createUserPlaceAction, googleNearbySearchAction } = usePlaceActions();
  const nameId = useId();
  const hintId = useId();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [moreKinds, setMoreKinds] = useState(false);
  const [prefill, setPrefill] = useState<NamePrefill | "loading">("loading");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placeId, setPlaceId] = useState(() => crypto.randomUUID());
  // The fix the sheet opened on (CR-4). `useGeolocation` keeps watching and
  // indoor drift passes its 11 m filter routinely; following it would mint a
  // new `placeId` (breaking the N09 retry) and spend another budgeted Google
  // read (D16) on every move. So the sheet takes the first fix it sees per
  // opening, and the pin, the listing and the id all belong to that one.
  const [pinned, setPinned] = useState<{
    latitude: number;
    longitude: number;
    accuracy?: number | null;
  } | null>(null);
  if (!open && pinned !== null) setPinned(null);
  if (open && pinned === null && location !== null) setPinned(location);

  // A fresh id per opening: a sheet closed and reopened is a new place, not a
  // retry of the last one.
  useEffect(() => {
    if (!open) return;
    setPlaceId(crypto.randomUUID());
    setError(null);
    setMoreKinds(false);
  }, [open]);

  const lat = pinned?.latitude ?? null;
  const lng = pinned?.longitude ?? null;
  // One nearby read per opening: `pinned` is set once per opening.
  useEffect(() => {
    if (!open) return;
    if (lat === null || lng === null) {
      setPrefill({ kind: "none" });
      return;
    }
    let cancelled = false;
    setPrefill("loading");
    googleNearbySearchAction(lat, lng)
      .then((read) => {
        if (cancelled) return;
        const here = { latitude: lat, longitude: lng };
        const result = namePrefill(here, read);
        setPrefill(result);
        if (result.kind === "listing") {
          setName((typed) => (typed.trim() === "" ? result.name : typed));
          const listing = read.places.find(
            (p) => p.name.trim() === result.name,
          );
          const guessed = categoryFromTypes(listing?.types ?? []);
          if (guessed !== null) setCategory((picked) => picked ?? guessed);
        }
      })
      .catch(() => {
        if (!cancelled) setPrefill({ kind: "none" });
      });
    return () => {
      cancelled = true;
    };
  }, [open, lat, lng, googleNearbySearchAction]);

  const submit = async () => {
    const built = newPlaceInput({
      name,
      category,
      location:
        pinned === null
          ? null
          : { latitude: pinned.latitude, longitude: pinned.longitude },
      placeId,
    });
    if (!built.ok) {
      feedback("refuse");
      setError(built.error);
      return;
    }
    feedback("primary");
    setSaving(true);
    setError(null);
    const result = await createUserPlaceAction(built.input);
    setSaving(false);
    if (!result.success || result.placeId === undefined) {
      feedback("refuse");
      setError(result.error ?? "The place could not be added.");
      return;
    }
    feedback("success");
    onCreated({
      id: result.placeId,
      name: built.input.name,
      category: built.input.categories[0] ?? "",
    });
  };

  const hint =
    prefill === "loading"
      ? "Looking for the nearest listing\u2026"
      : prefill.kind === "listing" && name.trim() === prefill.name
        ? "Suggested from the nearest listing"
        : prefill.kind === "pending"
          ? "Details pending. Type the name as it\u2019s signed."
          : "Type the name as it\u2019s signed.";
  const duplicate =
    onChooseExisting === undefined ? null : likelyDuplicate(name, nearby);
  const pick = (slug: string) => {
    feedback("toggle");
    setCategory(slug);
  };
  // A category from the rest of the list keeps the list open, so the pick shows.
  const showMore =
    moreKinds || (category !== null && kindLabel(category) === null);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={saving ? () => {} : onOpenChange}
      title="Add a place"
      hideTitle
      description={`No saved place within ${NEW_PLACE_WITHIN_METERS} m of you.`}
      footer={
        <div className="flex w-full items-center gap-3">
          <Button variant="quiet" asChild>
            <Link
              href="/map/create-place"
              underline="none"
              onClick={() => feedback("press")}
            >
              Full form
            </Link>
          </Button>
          <Button
            className="flex-1"
            onClick={() => void submit()}
            disabled={saving || pinned === null}
          >
            {saving ? <Spinner aria-hidden className="size-4" /> : null}
            {hasPhoto ? "Add place and scan" : "Add place"}
          </Button>
        </div>
      }
    >
      <div data-slot="new-place" className="flex flex-col gap-5 pb-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to places near you"
            onClick={() => {
              feedback("press");
              onPickInstead();
            }}
            disabled={saving}
          >
            <Back aria-hidden className="text-ink" />
          </Button>
          <div className="flex min-w-0 flex-col">
            <h2 className="t-title m-0 text-ink">Add a place</h2>
            <span
              className="t-cap flex items-center gap-1 text-ink-2"
              title={pinned === null ? undefined : pinnedLine(pinned.accuracy)}
            >
              <Place aria-hidden className="size-3.5 shrink-0 text-glyph" />
              {pinned === null
                ? "Your location is needed to pin the place."
                : pinnedShort(pinned.accuracy)}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={nameId} className="t-cap text-ink-2">
            Name
          </label>
          <Input
            id={nameId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-describedby={hintId}
            autoComplete="off"
            maxLength={200}
            className="h-12 text-base"
          />
          <span id={hintId} className="t-cap text-ink-3">
            {hint}
          </span>
        </div>

        {duplicate !== null && (
          <div
            data-slot="new-place-duplicate"
            className="flex items-center gap-3 rounded-md bg-raised p-3"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="t-head text-ink">On the map?</span>
              <span className="t-cap truncate text-ink-2">
                {[duplicate.name, distanceFromYou(duplicate.distanceMeters)]
                  .filter((part) => part !== "")
                  .join(" \u00b7 ")}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                feedback("detent");
                onChooseExisting?.({ id: duplicate.id, name: duplicate.name });
              }}
            >
              Use it
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span id={`${nameId}-kind`} className="t-cap text-ink-2">
            Kind
          </span>
          <div
            role="radiogroup"
            aria-labelledby={`${nameId}-kind`}
            className="grid grid-cols-3 gap-2"
          >
            {NEW_PLACE_KINDS.map((kind) => {
              const on = category === kind.category;
              const Glyph = KIND_ICON[kind.label];
              return (
                // biome-ignore lint/a11y/useSemanticElements: a tile grid, as the board draws it
                <button
                  key={kind.category}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => pick(kind.category)}
                  className={cn(
                    "t-cap flex h-16 flex-col items-center justify-center gap-1 rounded-md transition-[color,background-color,transform] active:scale-97 motion-reduce:active:scale-100",
                    on ? "bg-sel text-ink" : "bg-raised text-ink-2",
                  )}
                >
                  <Glyph
                    aria-hidden
                    className={cn("size-6", on ? "text-ink" : "text-glyph")}
                  />
                  {kind.label}
                </button>
              );
            })}
          </div>
          {showMore ? (
            <div
              role="radiogroup"
              aria-label="More kinds"
              className="flex flex-wrap gap-2"
            >
              {NEW_PLACE_CATEGORIES.filter(
                (slug) => kindLabel(slug) === null,
              ).map((slug) => {
                const on = category === slug;
                return (
                  // biome-ignore lint/a11y/useSemanticElements: a chip row, as the board draws it
                  <button
                    key={slug}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => pick(slug)}
                    className={cn(
                      "t-cap h-9 rounded-full px-3 transition-colors",
                      on ? "bg-sel text-ink" : "bg-raised text-ink-2",
                    )}
                  >
                    {categoryWords(slug)}
                  </button>
                );
              })}
            </div>
          ) : (
            <Button
              variant="quiet-muted"
              className="self-start"
              onClick={() => {
                feedback("press");
                setMoreKinds(true);
              }}
            >
              <More aria-hidden />
              More kinds
            </Button>
          )}
        </div>

        <p className="t-cap m-0 text-ink-2">
          Saved for you now, marked{" "}
          <span className="text-ink">Under review</span>. Friends see it after
          review.
        </p>

        {error !== null && (
          <Alert variant="destructive">
            <ErrorIcon aria-hidden />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </ResponsiveDialog>
  );
}
