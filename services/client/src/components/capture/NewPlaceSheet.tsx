"use client";

import { useEffect, useId, useState } from "react";
import { ErrorIcon, Place } from "@/components/app/icons";
import { ResponsiveDialog } from "@/components/app/ResponsiveDialog";
import { usePlaceActions } from "@/components/map/actions";
import { formatCategoryLabel } from "@/components/map/places/userPlaceCategories";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  categoryFromTypes,
  type NamePrefill,
  NEW_PLACE_CATEGORIES,
  NEW_PLACE_WITHIN_METERS,
  namePrefill,
  newPlaceInput,
} from "./new-place";

export type CreatedPlace = {
  id: string;
  name: string;
  category: string;
};

/**
 * L10 · "Where's this menu?" (board ScanNewPlace): no place the app knows is
 * within 50 m, so the place is added here, inline, before the scan goes
 * (L24) — and the held photo is not lost to a page change.
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location: { latitude: number; longitude: number } | null;
  /** A photo is held: the confirm also sends it. */
  hasPhoto: boolean;
  onCreated: (place: CreatedPlace) => void;
  onPickInstead: () => void;
}) {
  const { createUserPlaceAction, googleNearbySearchAction } = usePlaceActions();
  const nameId = useId();
  const hintId = useId();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<NamePrefill | "loading">("loading");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placeId, setPlaceId] = useState(() => crypto.randomUUID());

  const lat = location?.latitude ?? null;
  const lng = location?.longitude ?? null;
  // One nearby read per opening. A fresh id per opening, too: a sheet closed
  // and reopened is a new place, not a retry of the last one.
  useEffect(() => {
    if (!open) return;
    setPlaceId(crypto.randomUUID());
    setError(null);
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
    const built = newPlaceInput({ name, category, location, placeId });
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setSaving(true);
    setError(null);
    const result = await createUserPlaceAction(built.input);
    setSaving(false);
    if (!result.success || result.placeId === undefined) {
      setError(result.error ?? "The place could not be added.");
      return;
    }
    onCreated({
      id: result.placeId,
      name: built.input.name,
      category: built.input.categories[0] ?? "",
    });
  };

  const hint =
    prefill === "loading"
      ? "Looking for the nearest listing…"
      : prefill.kind === "listing" && name.trim() === prefill.name
        ? "Suggested from the nearest listing"
        : prefill.kind === "pending"
          ? "Details pending. Type the name as it's signed."
          : "Type the name as it's signed.";

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={saving ? () => {} : onOpenChange}
      title="Where's this menu?"
      description={`No saved place within ${NEW_PLACE_WITHIN_METERS} m of you. Add it, then scan.`}
      footer={
        <div className="flex w-full flex-col gap-1">
          <Button
            size="lg"
            className="w-full"
            onClick={() => void submit()}
            disabled={saving || location === null}
          >
            {saving ? <Spinner aria-hidden className="size-4" /> : null}
            {hasPhoto ? "Add place and scan" : "Add place"}
          </Button>
          <Button
            variant="ghost"
            className="w-full text-ink-2"
            onClick={onPickInstead}
            disabled={saving}
          >
            Pick a place nearby instead
          </Button>
        </div>
      }
    >
      <div data-slot="new-place" className="flex flex-col gap-4 pb-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={nameId} className="type-footnote text-ink-2">
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
          <span id={hintId} className="type-footnote text-ink-3">
            {hint}
          </span>
        </div>

        <div
          role="radiogroup"
          aria-label="Category"
          className="flex flex-wrap gap-2"
        >
          {NEW_PLACE_CATEGORIES.map((slug) => {
            const on = category === slug;
            return (
              // biome-ignore lint/a11y/useSemanticElements: a chip row, as the board draws it
              <button
                key={slug}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setCategory(slug)}
                className={cn(
                  "type-callout h-11 rounded-full px-3.5 font-medium transition-colors",
                  on
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-3 text-ink-1",
                )}
              >
                {formatCategoryLabel(slug)}
              </button>
            );
          })}
        </div>

        <p className="type-footnote flex items-center gap-2.5 text-ink-2">
          <Place aria-hidden className="size-[18px] shrink-0 text-brand" />
          {location === null
            ? "Your location is needed to pin the place."
            : "Pinned at your location"}
        </p>

        <p className="type-footnote rounded-lg bg-surface-3 px-3.5 py-3 text-ink-2">
          Saved for you now and marked{" "}
          <span className="text-ink-1">Under review</span>. Friends see it once
          it&rsquo;s approved. Hours and photos: details pending.
        </p>

        {error !== null && (
          <Alert variant="destructive" className="border-destructive/60">
            <ErrorIcon aria-hidden />
            <AlertDescription className="text-destructive/90">
              {error}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </ResponsiveDialog>
  );
}
