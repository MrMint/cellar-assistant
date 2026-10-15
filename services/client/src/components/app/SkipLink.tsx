"use client";

import type { ComponentProps, MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { MAIN_CONTENT_ID } from "./main-content";

/**
 * Following the skip link by script: focus `<main>` without the fragment
 * navigation the bare `href` would make. That navigation pushes a history
 * entry for the page already showing (`/cellars#main-content`), so the next
 * Back (AppBar's, or the system's in the standalone PWA) would land on the
 * same page and appear to do nothing. The `href` serves before hydration.
 */
function skipToMain(event: MouseEvent<HTMLAnchorElement>) {
  const main = document.getElementById(MAIN_CONTENT_ID);
  if (main === null) return;
  event.preventDefault();
  main.focus();
}

/**
 * "Skip to content" (X21): the first thing a keyboard reaches on every page,
 * invisible until it has focus, then a brass pill over the top-left corner
 * (clear of the notch). Following it lands focus on the page's `<main>`
 * (`main-content.tsx`), past the side rail. Rendered once, by the root
 * layout.
 *
 * A plain `<a href="#…">`, not `app/Link`: an in-page jump needs no client
 * navigation, prefetch or View Transition.
 */
export function SkipLink({
  className,
  onClick,
  ...props
}: ComponentProps<"a">) {
  return (
    <a
      data-slot="skip-link"
      href={`#${MAIN_CONTENT_ID}`}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) skipToMain(event);
      }}
      className={cn(
        "sr-only focus-visible:not-sr-only",
        "focus-visible:fixed focus-visible:top-[calc(env(safe-area-inset-top)+0.5rem)] focus-visible:left-[calc(env(safe-area-inset-left)+1rem)] focus-visible:z-[100]",
        "type-callout rounded-full bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    >
      Skip to content
    </a>
  );
}
