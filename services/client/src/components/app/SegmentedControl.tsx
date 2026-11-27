"use client";

import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";

export type SegmentedOption<V extends string> = {
  value: V;
  /** Always shown: a segment is never a bare glyph. */
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  /**
   * A count after the label, in the recessive ink ("Finished 12"). Part of
   * the segment's name, so it is heard as well as seen. Absent: none.
   */
  count?: number;
};

export type SegmentedControlProps<V extends string> = {
  options: readonly SegmentedOption<V>[];
  value: V;
  onValueChange: (value: V) => void;
  /** The group's accessible name ("Sort by", "Show"). */
  "aria-label": string;
  size?: "default" | "sm";
  /** The cue on a change: `tick` (default) or `detent` (Appearance, sort). */
  cue?: "tick" | "detent";
  className?: string;
};

/**
 * One choice out of a few, always visible (KIT § 2-3: 44 segments, r7, in a
 * 46 strip, r8, card, edge; the current one sel and ink, the rest ink-3; a
 * tick on change). Radix's single toggle group: the segments are
 * `role="radio"` with `aria-checked` inside a `radiogroup`, arrows move between
 * them, and — unlike a raw toggle group — the current segment cannot be
 * tapped off into "nothing selected".
 */
export function SegmentedControl<V extends string>({
  options,
  value,
  onValueChange,
  "aria-label": ariaLabel,
  size = "default",
  cue = "tick",
  className,
}: SegmentedControlProps<V>) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next === "") return;
        feedback(cue);
        onValueChange(next as V);
      }}
      aria-label={ariaLabel}
      data-slot="segmented-control"
      className={cn(
        "inline-flex w-full items-stretch rounded-md border border-edge bg-card",
        size === "default" ? "h-[46px]" : "h-9",
        className,
      )}
    >
      {options.map((option) => (
        <ToggleGroupPrimitive.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          data-slot="segment"
          className={cn(
            "flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-segment px-3 text-ink-3 outline-none transition-colors duration-(--ca-dur-micro) ease-standard focus-visible:outline-2 focus-visible:outline-act-ink focus-visible:-outline-offset-2 disabled:opacity-40 data-[state=on]:bg-sel data-[state=on]:text-ink [&_svg:not([class*='size-'])]:size-5 [&_svg]:shrink-0",
            // Default: 44 segments in the 46 strip. `sm` for dense desktop rows.
            size === "default" ? "t-head h-11" : "t-cap h-[34px] font-semibold",
          )}
        >
          {option.icon}
          <span className="truncate">{option.label}</span>
          {option.count !== undefined && (
            <>
              {/* A space for the accessible name ("Finished 12", not
                  "Finished12"); between flex items it draws nothing. */}{" "}
              <span data-slot="segment-count" className="tabular font-normal">
                {option.count}
              </span>
            </>
          )}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}
