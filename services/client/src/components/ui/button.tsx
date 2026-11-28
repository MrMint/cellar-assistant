"use client";

import type { VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button-variants";

/**
 * KIT § 2 "Buttons". Every press is heard (MC-feedback): the primary plays
 * `primary`, the rest `press`, down on pointer down and up on release.
 * `silent` skips it for a button whose own handler fires a stronger cue
 * (a heart's success, a sheet row's detent).
 */
function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  silent = false,
  onPointerDown,
  onPointerUp,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    silent?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";
  const cue = variant === "default" ? "primary" : "press";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      onPointerDown={(event: React.PointerEvent<HTMLButtonElement>) => {
        onPointerDown?.(event);
        if (!silent && !props.disabled) feedback(cue, { phase: "down" });
      }}
      onPointerUp={(event: React.PointerEvent<HTMLButtonElement>) => {
        onPointerUp?.(event);
        if (!silent && !props.disabled) feedback(cue, { phase: "up" });
      }}
      {...props}
    />
  );
}

export { Button };
