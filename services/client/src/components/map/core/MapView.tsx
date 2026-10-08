"use client";

import dynamic from "next/dynamic";
import type { CachedLocation } from "@/lib/geo-cookie/parse";
import { MapMachineProvider } from "../state/MapMachineProvider";
import { MapShell } from "./MapShell";

interface MapViewProps {
  userId: string;
  cachedLocation?: CachedLocation | null;
}

const MapLibreRenderer = dynamic(
  () =>
    import("../maplibre/MapLibreRenderer").then((mod) => mod.MapLibreRenderer),
  {
    ssr: false,
    // The route's shell again (X24), not a spinner: the chunk arrives into
    // the frame the tap already showed.
    loading: () => <MapShell />,
  },
);

export function MapView({ userId, cachedLocation }: MapViewProps) {
  return (
    <MapMachineProvider userId={userId}>
      <MapLibreRenderer userId={userId} cachedLocation={cachedLocation} />
    </MapMachineProvider>
  );
}
