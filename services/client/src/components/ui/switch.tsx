"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import type * as React from "react";
import { feedback, HapticOverlay } from "@/lib/feedback";
import { cn } from "@/lib/utils";

/**
 * KIT § 3 "Settings list": 52 × 32, r16; off is sel with an edge-2 ring and
 * an ink-2 knob, on is act with a white knob 20 px over. A flip plays the
 * toggle sound and ticks (an iPhone feels it through the overlay). `sm` is
 * the dense desktop size and keeps shadcn's proportions.
 */
function Switch({
  className,
  size = "default",
  onCheckedChange,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      onCheckedChange={(checked) => {
        feedback("toggle");
        onCheckedChange?.(checked);
      }}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-lg border outline-none transition-colors duration-(--ca-dur-short) ease-linear focus-visible:outline-2 focus-visible:outline-act-ink focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40",
        "data-[size=default]:h-8 data-[size=default]:w-13 data-[size=sm]:h-5 data-[size=sm]:w-9",
        "data-[state=checked]:border-act data-[state=checked]:bg-act data-[state=unchecked]:border-edge-2 data-[state=unchecked]:bg-sel",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full transition-transform duration-(--ca-dur-short) ease-standard motion-reduce:transition-none",
          "group-data-[size=default]/switch:size-6 group-data-[size=sm]/switch:size-3.5",
          "translate-x-[3px] data-[state=checked]:bg-white data-[state=unchecked]:bg-ink-2",
          "group-data-[size=default]/switch:data-[state=checked]:translate-x-[23px] group-data-[size=sm]/switch:data-[state=checked]:translate-x-[17px]",
        )}
      />
      <HapticOverlay />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
