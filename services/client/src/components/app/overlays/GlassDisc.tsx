import type { ComponentProps } from "react";
import { HapticOverlay } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import { IconButton, type IconButtonProps } from "../IconButton";
import { PRESS_CLASS } from "./press";

/**
 * A 44 glass disc over a photo (KIT § 2 "Top bar and discs": back, menu; the
 * desktop pane's close, up, down, expand, more): the glass fill with its ink,
 * always an `aria-label`. On a plain surface use `IconButton` instead.
 */
export function GlassDisc({
  className,
  children,
  ...props
}: Omit<IconButtonProps, "variant" | "size"> & ComponentProps<"button">) {
  return (
    <IconButton
      {...props}
      data-slot="glass-disc"
      className={cn(
        "relative size-11 rounded-disc bg-glass text-on-glass backdrop-blur-md hover:bg-glass-hover hover:text-on-glass disabled:opacity-40",
        PRESS_CLASS,
        className,
      )}
    >
      {children}
      <HapticOverlay />
    </IconButton>
  );
}
