"use client";

import dynamic from "next/dynamic";
import { Spinner } from "@/components/ui/spinner";
import type { CachedLocation } from "@/lib/geo-cookie/parse";
import { MapMachineProvider } from "../state/MapMachineProvider";

interface MapViewProps {
  userId: string;
  cachedLocation?: CachedLocation | null;
}

const MapLibreRenderer = dynamic(
  () =>
    import("../maplibre/MapLibreRenderer").then((mod) => mod.MapLibreRenderer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-surface-1">
        <Spinner className="size-8 text-ink-2" />
      </div>
    ),
  },
);

export function MapView({ userId, cachedLocation }: MapViewProps) {
  return (
    <MapMachineProvider userId={userId}>
      <MapLibreRenderer userId={userId} cachedLocation={cachedLocation} />
    </MapMachineProvider>
  );
}
