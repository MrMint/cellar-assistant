import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * A detail screen's one primary action, floating 12 pt above the tab bar
 * (design §2): "Pour · Check in". Put one solid (act) `Button` in it (a second,
 * secondary one at most). It is `sticky` to the bottom of the shell's inner
 * scroller, so it rides above the content without covering the tab bar; give
 * the page `withActionBar` so the last row can scroll clear of it.
 */
export function ActionBar({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="action-bar"
      className={cn(
        "surface-glass sticky bottom-3 z-30 mx-auto flex w-full max-w-[720px] items-center gap-2 rounded-lg p-2 [&>[data-slot=button]]:flex-1",
        className,
      )}
      {...props}
    />
  );
}
