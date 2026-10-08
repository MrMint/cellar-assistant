"use client";

import { Alert, IconButton } from "@mui/joy";
import { MdClose } from "react-icons/md";

interface MapErrorBannerProps {
  message: string;
  /** Omitted for an error the map clears by itself (a places fetch). */
  onDismiss?: () => void;
}

/**
 * The map's one error card — "Location is off for this site…", a failed
 * places fetch. Placed by `MapBottomStack`, first of the map's bottom cards:
 * it used to sit at `top: 80`, under the search/filter panel, so on a phone
 * only its last line showed and the message could not be read.
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
        boxShadow: "md",
        alignItems: "flex-start",
      }}
    >
      {message}
    </Alert>
  );
}
