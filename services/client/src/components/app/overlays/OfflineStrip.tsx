"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { reduced, toastMs, tween } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Check, Offline } from "../icons";

const subscribe = (onChange: () => void): (() => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

/** Whether the browser says it is online; online on the server. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

/** The strip's words (CROSS-LOT "Offline wording and behaviour"). */
export const OFFLINE_WORDS = {
  offline: "Offline · changes wait",
  back: "Back online",
} as const;

export type OfflineState = "online" | "offline" | "back";

/**
 * The strip itself, drawn for a state (the kit gallery draws each). A raised
 * r8 row with its glyph: the cloud-off glyph offline, a check when back.
 */
export function OfflineStripView({
  state,
  className,
}: {
  state: Exclude<OfflineState, "online">;
  className?: string;
}) {
  const Icon = state === "offline" ? Offline : Check;
  return (
    <div
      data-slot="offline-strip"
      data-state={state}
      className={cn(
        "t-body flex min-h-11 items-center gap-3 rounded-md bg-raised px-4 py-2 text-ink",
        className,
      )}
    >
      <Icon aria-hidden className="size-5 shrink-0 text-glyph" />
      <span className="truncate">{OFFLINE_WORDS[state]}</span>
    </div>
  );
}

/**
 * The offline strip (KIT kit-18; CROSS-LOT): while the connection is gone it
 * says "Offline · changes wait" (actions queue and nothing is lost); when it
 * comes back it says "Back online" for a toast's time, then goes. A polite
 * live region, so the change is heard once. Sits at the top of the content,
 * under the page's own bar.
 */
export function OfflineStrip({ className }: { className?: string }) {
  const online = useOnline();
  const reducedMotion = useReducedMotion() ?? false;
  const [state, setState] = useState<OfflineState>("online");

  useEffect(() => {
    if (!online) {
      setState("offline");
      return;
    }
    setState((was) => (was === "offline" ? "back" : was));
  }, [online]);

  useEffect(() => {
    if (state !== "back") return;
    const timer = window.setTimeout(() => setState("online"), toastMs);
    return () => window.clearTimeout(timer);
  }, [state]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("empty:hidden", className)}
    >
      <AnimatePresence initial={false}>
        {state !== "online" && (
          <motion.div
            key="strip"
            initial={
              reducedMotion ? reduced.initial : { opacity: 0, height: 0 }
            }
            animate={
              reducedMotion ? reduced.animate : { opacity: 1, height: "auto" }
            }
            exit={reducedMotion ? reduced.exit : { opacity: 0, height: 0 }}
            transition={reducedMotion ? reduced.transition : tween("short")}
            style={{ overflow: "hidden" }}
          >
            <OfflineStripView state={state} className="mb-3" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
