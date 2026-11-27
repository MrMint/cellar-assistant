"use client";

import type { CaptureMode } from "@/lib/capture/capture-prefs";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";

const MODES: readonly { value: CaptureMode; label: string }[] = [
  { value: "bottle", label: "Bottle" },
  { value: "menu", label: "Menu" },
  { value: "recipe", label: "Recipe" },
];

/**
 * Capture-Camera 01: Bottle · Menu · Recipe under the picture, as words.
 * The current one is ink and weight; the rest ink-2. A tick on change.
 * `modes` narrows it (typed entry shows none of this row at all).
 */
export function ModeRow({
  value,
  onValueChange,
  modes = ["bottle", "menu", "recipe"],
}: {
  value: CaptureMode;
  onValueChange: (mode: CaptureMode) => void;
  modes?: readonly CaptureMode[];
}) {
  return (
    <div
      role="radiogroup"
      aria-label="What are you capturing?"
      data-slot="mode-row"
      className="flex items-center justify-center gap-1"
    >
      {MODES.filter((mode) => modes.includes(mode.value)).map((mode) => {
        const current = mode.value === value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: a word-button row (Capture-Camera 01), with radio semantics for the mode it shows.
          <button
            key={mode.value}
            type="button"
            role="radio"
            aria-checked={current}
            onClick={() => {
              if (current) return;
              feedback("tick");
              onValueChange(mode.value);
            }}
            className={cn(
              "h-11 min-w-16 rounded-lg px-3 outline-none transition-transform duration-(--ca-dur-micro) focus-visible:outline-2 focus-visible:outline-act-ink active:scale-97 motion-reduce:active:scale-100",
              current ? "t-head text-ink" : "t-body text-ink-2",
            )}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
