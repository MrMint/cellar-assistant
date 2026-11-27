"use client";

import { Link, type LinkProps } from "@/components/app/Link";
import { feedback } from "@/lib/feedback";

/**
 * An `app/Link` that presses like every other control (MC-feedback): `press`
 * down on pointer down and up on release, as the kit's Button does.
 */
export function PressLink(props: LinkProps) {
  return (
    <Link
      {...props}
      onPointerDown={(event) => {
        feedback("press", { phase: "down" });
        props.onPointerDown?.(event);
      }}
      onPointerUp={(event) => {
        feedback("press", { phase: "up" });
        props.onPointerUp?.(event);
      }}
    />
  );
}
