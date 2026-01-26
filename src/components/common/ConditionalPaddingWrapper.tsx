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

  // Remove padding for the map page
  const isMapPage = pathname === "/map";

  return (
    <Box
      sx={{
        flexGrow: 1,
        padding: isMapPage ? 0 : "1rem",
        overflowY: isMapPage ? "hidden" : "auto",
        overflowX: "hidden",
      }}
    >
      {children}
    </Box>
  );
}
