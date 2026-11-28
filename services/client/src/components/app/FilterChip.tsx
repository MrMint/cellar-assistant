"use client";

import type { ComponentProps, ReactNode } from "react";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";

export type FilterChipProps = Omit<ComponentProps<"button">, "children"> & {
  selected: boolean;
  children: ReactNode;
  /** A leading glyph; the label is always there too. */
  icon?: ReactNode;
  /** Shown after the label, hidden when zero (design §3.7). */
  count?: number;
  /**
   * The label's guess, not yet the person's choice: a dashed boundary (the
   * kit's kind picker in a read-from-the-label form).
   */
  guess?: boolean;
};

/**
 * KIT § 2 "Chips": a toggle button (`aria-pressed`), 44 tall, r8, edge, the
 * label in t-head and its count in t-cap; on is a sel fill with edge-2 and
 * ink (a filter is state, not action: never act, never gold). Press .97 and
 * the press sound, down and up.
 */
export function FilterChip({
  selected,
  icon,
  count,
  guess = false,
  className,
  children,
  type = "button",
  onPointerDown,
  onPointerUp,
  ...props
}: FilterChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      data-slot="filter-chip"
      data-selected={selected ? "" : undefined}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        feedback("press", { phase: "down" });
      }}
      onPointerUp={(event) => {
        onPointerUp?.(event);
        feedback("press", { phase: "up" });
      }}
      className={cn(
        "relative inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-3.5 outline-none transition-[color,background-color,border-color,transform] duration-(--ca-dur-micro) ease-standard focus-visible:outline-2 focus-visible:outline-act-ink focus-visible:outline-offset-2 active:scale-97 disabled:opacity-40 motion-reduce:active:scale-100 [&_svg:not([class*='size-'])]:size-4",
        selected
          ? "border-edge-2 bg-sel text-ink"
          : "border-edge text-ink-2 active:bg-raised [@media(hover:hover)]:hover:bg-raised",
        guess && "border-dash border-dashed",
        className,
      )}
      {...props}
    >
      {icon}
      <span className="t-head">{children}</span>
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "t-cap tabular",
            selected ? "text-ink-2" : "text-ink-3",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
