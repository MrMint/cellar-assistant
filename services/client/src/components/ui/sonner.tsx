"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type * as React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * shadcn's Sonner wrapper, drawn as the kit's toast (KIT § 2): 48 minimum,
 * r8, the toast fill with its edge, one line with an ellipsis, and the action
 * (Undo) in the toast's act ink at the right. Colours come from the theme
 * tokens, so both themes follow; sonner's own `theme` only picks its
 * built-in icon tints. Mount it through `app/Toaster`, which places it.
 */
const Toaster = ({ style, toastOptions, ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        ...toastOptions,
        classNames: {
          toast:
            "t-body !min-h-12 !rounded-md !border !border-toast-edge !bg-toast !py-3 !text-toast-ink !shadow-pop",
          title: "truncate",
          description: "t-cap !text-ink-2",
          actionButton:
            "t-head !h-11 !min-w-11 !bg-transparent !px-2 !text-toast-act",
          ...toastOptions?.classNames,
        },
      }}
      style={
        {
          "--normal-bg": "var(--ca-toast)",
          "--normal-text": "var(--ca-toast-ink)",
          "--normal-border": "var(--ca-toast-edge)",
          "--border-radius": "var(--radius-md)",
          ...style,
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
