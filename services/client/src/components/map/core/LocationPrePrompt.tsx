"use client";

import { ICON_STROKE, MyLocation } from "@/components/app/icons";
import { Button } from "@/components/ui/button";

/** D14's one line: why we are about to ask, before the browser asks. */
export const LOCATION_PRE_PROMPT_COPY =
  "Use your location to show places near you on the map.";

interface LocationPrePromptProps {
  /** Raises the browser's own location prompt. */
  onContinue: () => void;
  onDismiss: () => void;
  /**
   * L10: the one line, for a surface other than the map (the menu scanner's
   * "find the place this menu is from"). One sentence, as D14 asks.
   */
  copy?: string;
  continueLabel?: string;
  dismissLabel?: string;
  disabled?: boolean;
}

/**
 * D14: shown when the map opens and the browser has not been asked yet
 * (`locationPrePromptVisible`). "Continue" is what raises the OS prompt.
 */
export function LocationPrePrompt({
  onContinue,
  onDismiss,
  copy = LOCATION_PRE_PROMPT_COPY,
  continueLabel = "Continue",
  dismissLabel = "Not now",
  disabled = false,
}: LocationPrePromptProps) {
  return (
    <div
      role="dialog"
      aria-label="Location"
      className="surface-glass flex flex-col gap-2.5 rounded-md px-4 py-3"
    >
      <div className="flex items-center gap-2">
        <MyLocation
          aria-hidden
          strokeWidth={ICON_STROKE}
          className="size-4 shrink-0 text-ink-2"
        />
        <p className="t-cap">{copy}</p>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDismiss} disabled={disabled}>
          {dismissLabel}
        </Button>
        <Button onClick={onContinue} disabled={disabled}>
          {continueLabel}
        </Button>
      </div>
    </div>
  );
}
