import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * The id every frame gives its `<main>` (X21): `AppShell`'s scroller, the
 * sign-in and sign-up `AuthPage`, the public `ShareFrame`. `SkipLink` jumps
 * here, so a frame without it would leave the skip link pointing nowhere.
 */
export const MAIN_CONTENT_ID = "main-content";

/**
 * Spread on the `<main>` that carries `MAIN_CONTENT_ID`: the id, and
 * `tabIndex={-1}` so following the skip link moves focus into it (an element
 * with no tab index is only scrolled to, and the next Tab would start from the
 * top again). Give that `<main>` `outline-none` too: it is a container taking
 * programmatic focus, not a control, so it draws no ring.
 */
export const mainContentProps = {
  id: MAIN_CONTENT_ID,
  tabIndex: -1,
} as const;

/**
 * "Skip to content" (X21): the first thing a keyboard reaches on every page,
 * invisible until it has focus, then a brass pill over the top-left corner
 * (clear of the notch). Following it lands focus on the page's `<main>`, past
 * the side rail. Rendered once, by the root layout.
 *
 * A plain `<a href="#…">`, not `app/Link`: an in-page fragment needs no
 * client navigation, prefetch or View Transition.
 */
export function SkipLink({ className, ...props }: ComponentProps<"a">) {
  return (
    <a
      data-slot="skip-link"
      href={`#${MAIN_CONTENT_ID}`}
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
