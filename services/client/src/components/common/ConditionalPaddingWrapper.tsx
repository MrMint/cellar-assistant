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
      }}
    >
      {children}
    </Box>
  );
}
