"use client";

import { Box } from "@mui/joy";
import { usePathname } from "next/navigation";

interface ConditionalPaddingWrapperProps {
  children: React.ReactNode;
}

export function ConditionalPaddingWrapper({
  children,
}: ConditionalPaddingWrapperProps) {
  const pathname = usePathname();

  // All /map/* routes handle their own padding
  const isMapRoute = pathname.startsWith("/map");
  // Only the map canvas itself needs hidden overflow
  const isMapCanvas = pathname === "/map";

  return (
    <Box
      sx={{
        flexGrow: 1,
        minHeight: 0,
        padding: isMapRoute ? 0 : "1rem",
        overflowY: isMapCanvas ? "hidden" : "auto",
        overflowX: "hidden",
        // N22: the map canvas fills exactly this box, so it ends above the
        // bottom nav and MapLibre's attribution stays visible.
        ...(isMapCanvas && { display: "flex", flexDirection: "column" }),
      }}
    >
      {children}
    </Box>
  );
}
