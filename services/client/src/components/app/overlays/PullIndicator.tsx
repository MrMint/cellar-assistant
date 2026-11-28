"use client";

import { Spinner } from "@/components/ui/spinner";
import { gesture } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Refresh } from "../icons";
import type { PullState } from "./gestures";

/**
 * The pull's glass disc (movement 15): it comes down with the pull, its
 * glass filling as it nears the 64 px arm, turns once armed, and holds
 * with a spinner while the refresh runs. Hidden at rest.
 */
export function PullIndicator({ state }: { state: PullState }) {
  const { pull, armed, refreshing } = state;
  if (pull <= 0 && !refreshing) return null;
  const fill = Math.min(1, pull / gesture.pullPx);
  return (
    <div
      data-slot="pull-indicator"
      data-armed={armed ? "" : undefined}
      role="status"
      aria-label={
        refreshing
          ? "Refreshing"
          : armed
            ? "Release to refresh"
            : "Pull to refresh"
      }
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
      style={{ transform: `translateY(${pull - 44}px)` }}
    >
      <span
        className="flex size-11 items-center justify-center rounded-disc bg-glass text-on-glass backdrop-blur-md"
        style={{ opacity: 0.4 + fill * 0.6 }}
      >
        {refreshing ? (
          <Spinner className="size-5" />
        ) : (
          <Refresh
            aria-hidden
            className={cn(
              "size-5 transition-transform duration-(--ca-dur-short)",
              armed && "rotate-180",
            )}
          />
        )}
      </span>
    </div>
  );
}
