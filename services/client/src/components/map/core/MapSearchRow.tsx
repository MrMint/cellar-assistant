"use client";

import { ICON_STROKE, Public } from "@/components/app/icons";
import { SearchField } from "@/components/shell/SearchField";
import { Button } from "@/components/ui/button";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import type { MapTheme } from "../maplibre/palette";
import { MapOptions } from "./MapOptions";

/** Typing pauses this long before a search runs (it embeds the query). */
export const MAP_SEARCH_DEBOUNCE_MS = 600;

/**
 * The map's search row (Map board; desktop/Places): the kit's search field
 * and Map options (⋯). Desktop adds "Everywhere", whether a search looks
 * past the map's view. `resetKey` remounts the field when something outside
 * it empties the search (the field is uncontrolled).
 */
export function MapSearchRow({
  search,
  resetKey,
  searching,
  onSearch,
  globalSearch,
  onGlobalSearchChange,
  theme,
  onThemeChange,
  onAddPlace,
  variant = "phone",
  className,
}: {
  search: string;
  resetKey: number;
  searching: boolean;
  onSearch: (value: string) => void;
  globalSearch: boolean;
  onGlobalSearchChange: (global: boolean) => void;
  theme: MapTheme;
  onThemeChange: (theme: MapTheme) => void;
  onAddPlace: () => void;
  variant?: "phone" | "desktop";
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <SearchField
        key={resetKey}
        className="min-w-0 flex-1"
        aria-label="Search places"
        placeholder="Search places"
        defaultValue={search}
        debounceTimeout={MAP_SEARCH_DEBOUNCE_MS}
        searching={searching}
        onDebounced={onSearch}
      />
      {variant === "desktop" && (
        <Button
          variant="outline"
          aria-pressed={globalSearch}
          className={cn("border-edge-2", globalSearch && "bg-sel")}
          onClick={() => {
            feedback("toggle");
            onGlobalSearchChange(!globalSearch);
          }}
        >
          <Public aria-hidden strokeWidth={ICON_STROKE} />
          Everywhere
        </Button>
      )}
      <MapOptions
        theme={theme}
        onThemeChange={onThemeChange}
        onAddPlace={onAddPlace}
      />
    </div>
  );
}
