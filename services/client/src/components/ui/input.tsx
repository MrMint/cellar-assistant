import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * KIT § 3 "Form": a text field is 44 tall, r8, on card, with the edge-2
 * boundary (LIGHT ruling 1: 3:1 in both themes); focus turns the boundary
 * act-ink, an error turns it danger and the value stays.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "t-body h-11 w-full min-w-0 rounded-md border border-edge-2 bg-card px-3 text-ink transition-[border-color] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-ink-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40",
        "focus-visible:border-act-ink",
        "aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
