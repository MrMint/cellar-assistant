"use client";

import { Box, CircularProgress } from "@mui/joy";
import dynamic from "next/dynamic";
import { MapMachineProvider } from "../state/MapMachineProvider";

interface MapViewProps {
  userId: string;
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

export function MapView({ userId }: MapViewProps) {
  return (
    <MapMachineProvider userId={userId}>
      <MapLibreRenderer userId={userId} />
    </MapMachineProvider>
  );
}
