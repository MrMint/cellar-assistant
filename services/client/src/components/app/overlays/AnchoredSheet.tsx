"use client";

import { Slot } from "radix-ui";
import type { ReactElement, ReactNode } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { breakpointUp, useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { BottomSheet } from "../BottomSheet";
import { KeyTooltip } from "./Kbd";
import { useOverlayLayer } from "./layers";

export type AnchoredSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The sheet's heading, and the popover's accessible name. */
  title: string;
  /** The control that opens it: a button with its own name. */
  trigger: ReactElement;
  /** Where the popover sits against its control on desktop. */
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** Desktop only: the control's tooltip with its key (the rail's More). */
  tooltip?: { label: string; keys?: string };
  className?: string;
  children: ReactNode;
};

/**
 * A short choice that belongs to one control (KIT § 4 "Sheet or page"): a
 * bottom sheet on a phone and, from `md`, a 280 popover at the control
 * ("a sheet becomes a popover at its control"). Esc, a tap outside, and
 * choosing close it; focus goes back to the control.
 */
export function AnchoredSheet({
  open,
  onOpenChange,
  title,
  trigger,
  side = "bottom",
  align = "start",
  tooltip,
  className,
  children,
}: AnchoredSheetProps) {
  const desktop = useMediaQuery(breakpointUp("md"));
  // Back closes the popover (the sheet below md registers itself).
  useOverlayLayer(open && desktop, () => onOpenChange(false));

  if (!desktop) {
    return (
      <>
        <Slot.Root
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        >
          {trigger}
        </Slot.Root>
        <BottomSheet
          open={open}
          onOpenChange={onOpenChange}
          title={title}
          className={className}
        >
          {children}
        </BottomSheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {tooltip === undefined ? (
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      ) : (
        <KeyTooltip label={tooltip.label} keys={tooltip.keys}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        </KeyTooltip>
      )}
      <PopoverContent
        data-slot="anchored-popover"
        aria-label={title}
        side={side}
        align={align}
        sideOffset={8}
        className={cn("flex flex-col", className)}
      >
        <p className="t-cap px-2 pt-1 pb-2 text-ink-2">{title}</p>
        {children}
      </PopoverContent>
    </Popover>
  );
}
