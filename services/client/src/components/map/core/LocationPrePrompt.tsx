"use client";

import { Button, Sheet, Stack, Typography } from "@mui/joy";
import { MdMyLocation } from "react-icons/md";

/** D14's one line: why we are about to ask, before the browser asks. */
export const LOCATION_PRE_PROMPT_COPY =
  "Use your location to show places near you on the map.";

interface LocationPrePromptProps {
  /** Raises the browser's own location prompt. */
  onContinue: () => void;
  onDismiss: () => void;
}

/**
 * D14: shown when the map opens and the browser has not been asked yet
 * (`locationPrePromptVisible`). "Continue" is what raises the OS prompt.
 */
export function LocationPrePrompt({
  onContinue,
  onDismiss,
}: LocationPrePromptProps) {
  return (
    <Sheet
      role="dialog"
      aria-label="Location"
      variant="outlined"
      sx={{
        borderRadius: "md",
        boxShadow: "md",
        px: 2,
        py: 1.5,
      }}
    >
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} alignItems="center">
          <MdMyLocation aria-hidden />
          <Typography level="body-sm">{LOCATION_PRE_PROMPT_COPY}</Typography>
        </Stack>
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button size="sm" variant="plain" color="neutral" onClick={onDismiss}>
            Not now
          </Button>
          <Button size="sm" variant="solid" onClick={onContinue}>
            Continue
          </Button>
        </Stack>
      </Stack>
    </Sheet>
  );
}
