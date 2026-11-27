"use client";

import type { ReactNode } from "react";
import { Check, ICON_STROKE } from "@/components/app/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { ScanPhase } from "./scan-progress";

const STEPS = [
  { key: "uploading", label: "Upload" },
  { key: "reading", label: "Read" },
  { key: "matching", label: "Match" },
] as const;

const ORDER: Readonly<Record<ScanPhase, number>> = {
  uploading: 0,
  reading: 1,
  matching: 2,
  done: 3,
};

const TITLE: Readonly<Record<ScanPhase, string>> = {
  uploading: "Sending the photo",
  reading: "Reading the menu",
  matching: "Matching the lines",
  done: "Menu read",
};

/**
 * The one progress card a menu scan shows (Places-Menus 01, Places-Place 08):
 * a title, an optional quiet action at its end, and the three steps — done
 * ones ticked, the current one spinning, the rest a dot. `slow` adds the
 * board's one calm line; it never turns the card into an error.
 */
export function ScanSteps({
  phase,
  action,
  slow = false,
  className,
}: {
  phase: ScanPhase;
  action?: ReactNode;
  slow?: boolean;
  className?: string;
}) {
  const at = ORDER[phase];
  return (
    <section
      data-slot="scan-steps"
      data-phase={phase}
      aria-live="polite"
      className={cn(
        "flex flex-col gap-4 rounded-lg bg-surface-1 px-4 py-4",
        className,
      )}
    >
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h2 className="t-head text-ink">{TITLE[phase]}</h2>
        {action}
      </div>
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map((step, index) => {
          const state =
            index < at ? "done" : index === at ? "current" : "waiting";
          return (
            <li
              key={step.key}
              data-state={state}
              aria-current={state === "current" ? "step" : undefined}
              className={cn(
                "t-body flex items-center gap-2",
                state === "current" ? "text-ink" : "text-ink-2",
              )}
            >
              <span className="flex size-5 shrink-0 items-center justify-center">
                {state === "done" ? (
                  <Check
                    aria-hidden
                    strokeWidth={ICON_STROKE}
                    className="size-4 text-glyph"
                  />
                ) : state === "current" ? (
                  <Spinner aria-hidden className="size-4 text-ink" />
                ) : (
                  <span aria-hidden className="size-1 rounded-full bg-glyph" />
                )}
              </span>
              {step.label}
            </li>
          );
        })}
      </ol>
      {slow && (
        <p className="t-cap text-ink-2">
          This one is taking a while. It keeps going if you leave.
        </p>
      )}
    </section>
  );
}

/** The lines still to come, as rows of the menu's own shape (Places-Menus 01). */
export function MenuLineSkeleton({ rows = 6 }: { rows?: number }) {
  const widths = ["w-1/2", "w-2/5", "w-3/5", "w-[45%]", "w-[55%]", "w-1/3"];
  return (
    <div aria-hidden data-slot="menu-line-skeleton" className="flex flex-col">
      <Skeleton className="mb-3 h-3 w-14" />
      {Array.from({ length: rows }, (_, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholders
          key={index}
          className="flex flex-col gap-2 border-rule border-t py-3"
        >
          <div className="flex justify-between gap-3">
            <Skeleton className={cn("h-4", widths[index % widths.length])} />
            <Skeleton className="h-4 w-7" />
          </div>
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}
