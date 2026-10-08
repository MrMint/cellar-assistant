"use client";

import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SegmentedOption<V extends string> = {
  value: V;
  /** Always shown: a segment is never a bare glyph. */
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
};

export type SegmentedControlProps<V extends string> = {
  options: readonly SegmentedOption<V>[];
  value: V;
  onValueChange: (value: V) => void;
  /** The group's accessible name ("Sort by", "Show"). */
  "aria-label": string;
  size?: "default" | "sm";
  className?: string;
};

/**
 * One choice out of a few, always visible (replaces Joy's
 * `ToggleButtonGroup`). Radix's single toggle group: the segments are
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
  className,
}: SegmentedControlProps<V>) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next !== "") onValueChange(next as V);
      }}
      aria-label={ariaLabel}
      data-slot="segmented-control"
      className={cn(
        "inline-flex w-full items-stretch gap-0.5 rounded-md bg-surface-2 p-0.5",
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
            "flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[10px] px-3 font-medium text-ink-2 outline-none transition-colors duration-(--ca-dur-micro) ease-standard focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 data-[state=on]:bg-surface-3 data-[state=on]:text-ink-1 data-[state=on]:shadow-sm [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
            size === "default" ? "min-h-10 text-sm" : "min-h-8 text-xs",
          )}
        >
          {option.icon}
          <span className="truncate">{option.label}</span>
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}
