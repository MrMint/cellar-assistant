import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/*
 * No "use client" here, on purpose: server components (`ShareFrame`,
 * `AuthPage`, the not-found pages) spread `mainContentProps`, and a plain
 * object imported from a client module reaches a server component as a
 * client reference, not as the object, so the spread would add nothing.
 */

/**
 * The id every frame gives its `<main>` (X21): `AppShell`'s scroller, the
 * sign-in and sign-up `AuthPage`, the public `ShareFrame`, and the messages
 * drawn outside any of those (`MainContent`). `SkipLink` jumps here, so a
 * frame without it would leave the skip link pointing nowhere.
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
 * A frame's `<main>` when the frame is nothing but its content: a not-found
 * or error message outside the app shell, the offline page. The same props
 * as the shell's own, so the skip link lands somewhere on every page.
 */
export function MainContent({ className, ...props }: ComponentProps<"main">) {
  return (
    <main
      {...mainContentProps}
      className={cn("outline-none", className)}
      {...props}
    />
  );
}
