"use client";

import { Box, Button, IconButton, Sheet, Stack, Typography } from "@mui/joy";
import { MdClose } from "react-icons/md";

const MOBILE_NAV_CLEARANCE = "80px";

interface CenterPinOverlayProps {
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Uber-style center pin overlay for placing a new location.
 * The pin is CSS-positioned at the map center — the user pans/zooms
 * the map underneath it to select a location.
 */
export function CenterPinOverlay({
  onConfirm,
  onCancel,
}: CenterPinOverlayProps) {
  return (
    <>
      {/* Pin at visual center of map */}
      <Box
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -100%)",
          zIndex: 1100,
          pointerEvents: "none",
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))",
        }}
      >
        <svg
          width="40"
          height="52"
          viewBox="0 0 40 52"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <title>Location pin for placing a new place on the map</title>
          {/* Pin body */}
          <path
            d="M20 0C8.954 0 0 8.954 0 20c0 14 20 32 20 32s20-18 20-32C40 8.954 31.046 0 20 0z"
            fill="var(--joy-palette-primary-500, #1976d2)"
          />
          {/* Inner circle */}
          <circle cx="20" cy="20" r="8" fill="white" />
        </svg>
      </Box>

      {/* Shadow dot at pin base for depth */}
      <Box
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: "rgba(0,0,0,0.2)",
          zIndex: 1099,
          pointerEvents: "none",
        }}
      />

      {/* Bottom action bar */}
      <Box
        sx={{
          position: "absolute",
          bottom: {
            xs: `calc(${MOBILE_NAV_CLEARANCE} + env(safe-area-inset-bottom, 0px))`,
            md: 24,
          },
          left: { xs: 16, md: "50%" },
          right: { xs: 16, md: "auto" },
          transform: { xs: "none", md: "translateX(-50%)" },
          zIndex: 1250,
          width: { xs: "auto", md: "auto" },
          maxWidth: 400,
        }}
      >
        <Sheet
          sx={{
            p: 2,
            borderRadius: "lg",
            boxShadow: "lg",
            backgroundColor: "background.surface",
          }}
        >
          <Stack spacing={1.5} alignItems="center">
            <Typography level="body-sm" textAlign="center">
              Move the map to position the pin on the place
            </Typography>
            <Stack direction="row" spacing={1} sx={{ width: "100%" }}>
              <Button
                size="sm"
                color="primary"
                onClick={onConfirm}
                sx={{ flex: 1 }}
              >
                Confirm Location
              </Button>
              <IconButton
                size="sm"
                variant="outlined"
                color="neutral"
                onClick={onCancel}
              >
                <MdClose />
              </IconButton>
            </Stack>
          </Stack>
        </Sheet>
      </Box>
    </>
  );
}
