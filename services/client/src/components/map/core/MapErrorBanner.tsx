"use client";

import { Alert, IconButton } from "@mui/joy";
import { MdClose } from "react-icons/md";

/**
 * Above the location pre-prompt and the "Not on the map yet" card (10–11),
 * and far below the search/filter panel (1000+), which it no longer shares
 * an edge with.
 */
export const MAP_ERROR_Z_INDEX = 12;

interface MapErrorBannerProps {
  message: string;
  /** Omitted for an error the map clears by itself (a places fetch). */
  onDismiss?: () => void;
}

/**
 * The map's one error card — "Location is off for this site…", a failed
 * places fetch. Bottom-anchored like the map's other cards: it used to sit
 * at `top: 80`, under the search/filter panel, so on a phone only its last
 * line showed and the message could not be read.
 */
export function MapErrorBanner({ message, onDismiss }: MapErrorBannerProps) {
  return (
    <Alert
      role="alert"
      color="danger"
      variant="soft"
      endDecorator={
        onDismiss ? (
          <IconButton
            size="sm"
            variant="plain"
            color="danger"
            aria-label="Dismiss"
            onClick={onDismiss}
          >
            <MdClose />
          </IconButton>
        ) : undefined
      }
      sx={{
        position: "absolute",
        left: "50%",
        bottom: 40,
        transform: "translateX(-50%)",
        zIndex: MAP_ERROR_Z_INDEX,
        width: "min(420px, calc(100% - 32px))",
        boxShadow: "md",
        alignItems: "flex-start",
      }}
    >
      {message}
    </Alert>
  );
}
