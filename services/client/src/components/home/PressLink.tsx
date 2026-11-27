"use client";

import { Link, type LinkProps } from "@/components/app/Link";
import { feedback } from "@/lib/feedback";

/**
 * An `app/Link` that plays the press cue as it is tapped (KIT § 2: every
 * control is heard), for the server-rendered parts of Home. Underline off.
 */
export function PressLink({ onClick, ...props }: LinkProps) {
  return (
    <Link
      underline="none"
      {...props}
      onClick={(event) => {
        feedback("press");
        onClick?.(event);
      }}
    />
  );
}
