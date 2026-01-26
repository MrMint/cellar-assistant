"use client";

import { Box, CircularProgress } from "@mui/joy";
import dynamic from "next/dynamic";
import { useClient } from "urql";
import { MapMachineProvider } from "../state/MapMachineProvider";

interface MapViewProps {
  userId: string;
}

// Dynamic import to prevent SSR issues with Leaflet
const MapRenderer = dynamic(
  () => import("./MapRenderer").then((mod) => mod.MapRenderer),
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
  const urqlClient = useClient();

  return (
    <MapMachineProvider userId={userId} urqlClient={urqlClient}>
      <MapRenderer userId={userId} />
    </MapMachineProvider>
  );
}
