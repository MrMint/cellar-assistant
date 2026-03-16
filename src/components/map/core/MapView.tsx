"use client";

import { Box, CircularProgress } from "@mui/joy";
import dynamic from "next/dynamic";
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
      <Box
        sx={{
          height: "100%",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "background.surface",
        }}
      >
        <CircularProgress />
      </Box>
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
