import type * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "t-body flex field-sizing-content min-h-16 w-full rounded-md border border-edge-2 bg-card px-3 py-2.5 text-ink transition-[border-color] outline-none placeholder:text-ink-3 focus-visible:border-act-ink disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
