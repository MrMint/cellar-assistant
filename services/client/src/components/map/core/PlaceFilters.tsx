"use client";

import { FilterChip } from "@/components/app/FilterChip";
import { Cocktail, Lists } from "@/components/app/icons";
import {
  BeerGlyph,
  CoffeeGlyph,
  FoodGlyph,
  SpiritGlyph,
  WineGlyph,
} from "@/components/app/parts/glyphs";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { categoryToIcon } from "../maplibre/utils/geoJsonTransform";
import type { PlaceResult } from "../types";
import {
  FILTER_KINDS,
  type FilterKind,
  type PlaceKind,
  placeKind,
} from "./map-places";

/** Each kind's glyph, shared with the rows (Map board). */
export const KIND_GLYPH = {
  coffee: CoffeeGlyph,
  food: FoodGlyph,
  bar: Cocktail,
  other: FoodGlyph,
} as const;

/** The pin's category icon (`categoryToIcon`) as the kit's row glyph. */
const PIN_ICON_GLYPH: Record<string, (typeof KIND_GLYPH)[PlaceKind]> = {
  "poi-wine": WineGlyph,
  "poi-beer": BeerGlyph,
  "poi-cocktail": Cocktail,
  "poi-spirit": SpiritGlyph,
  "poi-coffee": CoffeeGlyph,
  "poi-restaurant": FoodGlyph,
  "poi-default": FoodGlyph,
};

/**
 * A place's row glyph: the same picture its pin draws (F-192), so a beer
 * bar's row shows the beer glyph its pin shows, not the bar kind's glass.
 * A pin icon the kit draws no glyph for (grocery, hotel) falls back to the
 * kind's.
 */
export function placeGlyph(
  place: Pick<PlaceResult, "primary_category" | "categories">,
): (typeof KIND_GLYPH)[PlaceKind] {
  return (
    PIN_ICON_GLYPH[categoryToIcon(place.primary_category)] ??
    KIND_GLYPH[placeKind(place)]
  );
}

const KIND_WORDS: Record<FilterKind, { phone: string; desktop: string }> = {
  coffee: { phone: "Coffee", desktop: "Coffee" },
  food: { phone: "Food", desktop: "Food" },
  bar: { phone: "Bar", desktop: "Drinks" },
};

/**
 * The map's filter row (Map board; desktop/Places): "Mine" (the owner's own
 * place lists, the list glyph), then the kinds with their live counts. One
 * sideways row of 44 chips; a kind with none in view is still offered, its
 * count hidden. Desktop words "Drinks" for the bar chip and leads with All.
 */
export function PlaceFilters({
  kinds,
  counts,
  total,
  mine,
  mineAvailable,
  onKindsChange,
  onMineChange,
  listName = null,
  variant = "phone",
  className,
}: {
  kinds: readonly FilterKind[];
  counts: Readonly<Record<PlaceKind, number>>;
  /** Every place in view, for desktop's All chip. */
  total: number;
  mine: boolean;
  /** The owner has a place list to filter by. */
  mineAvailable: boolean;
  onKindsChange: (kinds: FilterKind[]) => void;
  onMineChange: (on: boolean) => void;
  /**
   * F-191: a list's `/map?list=` link names its list here, lit, in place of
   * Mine (which a friend's list must not light, CC-6); a tap clears it.
   */
  listName?: string | null;
  variant?: "phone" | "desktop";
  className?: string;
}) {
  const toggle = (kind: FilterKind) => {
    feedback("tick");
    onKindsChange(
      kinds.includes(kind) ? kinds.filter((k) => k !== kind) : [...kinds, kind],
    );
  };

  return (
    <fieldset
      aria-label="Filter places"
      data-slot="map-filters"
      className={cn(
        "flex min-w-0 gap-2 overflow-x-auto [scrollbar-width:none]",
        className,
      )}
    >
      {variant === "desktop" && (
        <FilterChip
          selected={kinds.length === 0 && !mine}
          count={total}
          onClick={() => {
            feedback("tick");
            onKindsChange([]);
            if (mine) onMineChange(false);
          }}
        >
          All
        </FilterChip>
      )}
      {listName !== null ? (
        <FilterChip
          selected
          icon={<Lists aria-hidden />}
          onClick={() => {
            feedback("tick");
            onMineChange(false);
          }}
        >
          {listName}
        </FilterChip>
      ) : (
        mineAvailable && (
          <FilterChip
            selected={mine}
            icon={<Lists aria-hidden />}
            onClick={() => {
              feedback("tick");
              onMineChange(!mine);
            }}
          >
            Mine
          </FilterChip>
        )
      )}
      {FILTER_KINDS.map((kind) => {
        const Glyph = KIND_GLYPH[kind];
        return (
          <FilterChip
            key={kind}
            selected={kinds.includes(kind)}
            count={counts[kind]}
            icon={<Glyph aria-hidden />}
            onClick={() => toggle(kind)}
          >
            {KIND_WORDS[kind][variant]}
          </FilterChip>
        );
      })}
    </fieldset>
  );
}
