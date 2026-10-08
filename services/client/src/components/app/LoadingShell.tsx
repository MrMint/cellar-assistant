import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * A route's loading shell (X24, design §4.7): the page's own frame, drawn the
 * moment a tap commits, while the server renders the real thing.
 *
 * Two layers, on purpose:
 *
 * - **Chrome** — what the page will certainly show and the shell already
 *   knows (a tab root's title, the map's search pill): rendered as-is, from
 *   the first frame, in the place the page will draw it. It is the first
 *   thing a tap changes, so it is the tap's acknowledgement.
 * - **Blocks** (`ShellBlocks`) — grey placeholders where the data will land,
 *   shaped like it. They wait `--ca-skeleton-delay` (120 ms) and then fade
 *   in, so a route that answers quickly never flashes them.
 *
 * Screen readers get one status line, "Loading <what>…", the chrome as
 * ordinary content, and nothing of the placeholders. `data-loading-shell` marks the shell for tests and for the
 * route-timing script (what is inside it is not the page's content yet).
 *
 * No `"use client"`: `loading.tsx` files and Suspense fallbacks render it on
 * the server.
 */
export function LoadingShell({
  label,
  className,
  children,
  ...props
}: ComponentProps<"div"> & {
  /** What is loading, for the status line: "cellars", "the map". */
  label: string;
}) {
  return (
    <div
      data-loading-shell=""
      aria-busy="true"
      className={cn("touch-none-select", className)}
      {...props}
    >
      <p role="status" className="sr-only">
        Loading {label}…
      </p>
      {children}
    </div>
  );
}

/**
 * The placeholder half of a `LoadingShell`: hidden for the first 120 ms, then
 * a 160 ms fade (`skeleton-reveal`). Everything inside is decoration.
 */
export function ShellBlocks({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      data-slot="shell-blocks"
      className={cn("skeleton-reveal", className)}
      {...props}
    />
  );
}
