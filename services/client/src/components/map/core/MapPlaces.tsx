"use client";

import type { ReactNode } from "react";
import type { MapList } from "../hooks/useMapList";
import type { MapTheme } from "../maplibre/palette";
import type { UserLocation } from "../types";
import type { DockDetent } from "./dock";
import { MapDock } from "./MapDock";
import { MapSearchRow } from "./MapSearchRow";
import { PlaceFilters } from "./PlaceFilters";
import { PlaceList } from "./PlaceList";

type MapPlacesProps = {
  list: MapList;
  origin: UserLocation | null;
  theme: MapTheme;
  onThemeChange: (theme: MapTheme) => void;
  onOpen: (index: number) => void;
  onAddPlace: () => void;
  selectedId?: string | null;
};

function Filters({
  list,
  variant,
}: MapPlacesProps & { variant: "phone" | "desktop" }) {
  return (
    <PlaceFilters
      variant={variant}
      kinds={list.kinds}
      counts={list.counts}
      total={list.total}
      mine={list.mine}
      mineAvailable={list.mineAvailable}
      onKindsChange={list.setKinds}
      onMineChange={list.setMine}
      className={variant === "phone" ? "-mx-4 px-4 pb-3" : "-mx-6 px-6 pb-4"}
    />
  );
}

function Rows({
  list,
  origin,
  onOpen,
  onAddPlace,
  selectedId,
}: MapPlacesProps) {
  return (
    <PlaceList
      places={list.places}
      origin={list.query === "" ? origin : null}
      title={list.title}
      loading={list.loading}
      query={list.query}
      globalSearch={list.globalSearch}
      selectedId={selectedId}
      onOpen={onOpen}
      onAddPlace={onAddPlace}
      onSearchEverywhere={() => list.setGlobalSearch(true)}
    />
  );
}

function SearchRow({
  list,
  theme,
  onThemeChange,
  onAddPlace,
  variant,
}: MapPlacesProps & { variant: "phone" | "desktop" }) {
  return (
    <MapSearchRow
      variant={variant}
      search={list.search}
      resetKey={list.resetKey}
      searching={list.loading && list.query !== ""}
      onSearch={list.setSearch}
      globalSearch={list.globalSearch}
      onGlobalSearchChange={list.setGlobalSearch}
      theme={theme}
      onThemeChange={onThemeChange}
      onAddPlace={onAddPlace}
    />
  );
}

/** The phone's dock over the map (Map board). */
export function MapPlacesDock({
  mapHeight,
  detent,
  onDetentChange,
  hidden,
  above,
  ...props
}: MapPlacesProps & {
  mapHeight: number;
  detent: DockDetent;
  onDetentChange: (detent: DockDetent) => void;
  hidden: boolean;
  above?: ReactNode;
}) {
  return (
    <MapDock
      mapHeight={mapHeight}
      detent={detent}
      onDetentChange={onDetentChange}
      hidden={hidden}
      above={above}
      head={<SearchRow {...props} variant="phone" />}
    >
      <Filters {...props} variant="phone" />
      <Rows {...props} />
    </MapDock>
  );
}

/**
 * Desktop places' list column (desktop/Places 13): "Near you" with the
 * count in view, the search with Everywhere and Map options, the chips led
 * by All, then the rows; the map fills the rest of the width.
 */
export function MapPlacesColumn(props: MapPlacesProps) {
  const { list, origin } = props;
  return (
    <aside
      data-slot="map-column"
      aria-label="Places"
      className="flex h-full w-[min(45%,800px)] min-w-[400px] shrink-0 flex-col border-edge border-r bg-bg"
    >
      <div className="flex flex-col gap-4 border-hair border-b px-6 pt-5 pb-0">
        <div className="flex items-baseline gap-3">
          <h2 className="t-title text-ink">
            {origin !== null ? "Near you" : "Places"}
          </h2>
          <span className="t-cap tabular text-ink-2">
            {list.query !== "" ? "Results" : "In view"} {list.total}
          </span>
        </div>
        <SearchRow {...props} variant="desktop" />
        <Filters {...props} variant="desktop" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-6">
        <Rows {...props} />
      </div>
    </aside>
  );
}
