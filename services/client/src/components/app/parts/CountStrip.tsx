"use client";

import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";

/**
 * KIT § 2 "Count strip": a 44 strip, r8, edge, saying how many and in what
 * order ("240 bottles · A–Z"), and how many match while filtered
 * ("240 bottles · A–Z · 12 match"). A polite live region, so a filter's
 * result is heard.
 */
export function CountStrip({
  total,
  noun,
  order,
  matching,
  className,
}: {
  total: number;
  /** Plural noun ("bottles"); the singular is the caller's at 1. */
  noun: string;
  /** The order in words ("A–Z", "Newest"). */
  order?: string;
  /** While filtered: how many match. */
  matching?: number;
  className?: string;
}) {
  const parts = [`${total.toLocaleString("en-US")} ${noun}`];
  if (order !== undefined) parts.push(order);
  if (matching !== undefined) parts.push(`${matching} match`);
  return (
    <p
      role="status"
      data-slot="count-strip"
      className={cn(
        "t-cap tabular flex min-h-11 items-center rounded-md border border-edge px-3 text-ink-2",
        className,
      )}
    >
      {parts.join(" · ")}
    </p>
  );
}

export type CountCell<K extends string> = {
  value: K;
  /** The word under the number ("Beer", "Open"). */
  label: string;
  count: number;
};

/**
 * The kit board's count filters: an optional lead chip ("20 Open") and a
 * strip of kind counts in one 46 frame (44 cells). Each cell filters; a tap
 * on the one that is on clears it. Cells with a zero count are hidden
 * (amendments: "kinds with none hidden"). Ticks on every change.
 */
export function CountFilters<K extends string>({
  lead,
  cells,
  value,
  onValueChange,
  "aria-label": ariaLabel,
  className,
}: {
  lead?: CountCell<K>;
  cells: readonly CountCell<K>[];
  value: K | null;
  onValueChange: (next: K | null) => void;
  "aria-label": string;
  className?: string;
}) {
  const shown = cells.filter((cell) => cell.count > 0);
  const press = (cell: CountCell<K>) => () => {
    feedback("tick");
    onValueChange(value === cell.value ? null : cell.value);
  };
  const cellBody = (cell: CountCell<K>) => (
    <>
      <span className="t-head tabular">{cell.count}</span>
      <span className="t-micro">{cell.label}</span>
    </>
  );
  return (
    // biome-ignore lint/a11y/useSemanticElements: a group of toggle buttons, not a form fieldset.
    <div
      role="group"
      aria-label={ariaLabel}
      data-slot="count-filters"
      className={cn("flex gap-2", className)}
    >
      {lead !== undefined && lead.count > 0 && (
        <button
          type="button"
          aria-pressed={value === lead.value}
          onClick={press(lead)}
          className={cn(
            "flex h-[46px] w-15 shrink-0 flex-col items-center justify-center rounded-md border outline-none transition-[background-color,transform] duration-(--ca-dur-micro) ease-standard focus-visible:outline-2 focus-visible:outline-act-ink focus-visible:outline-offset-2 active:scale-97 motion-reduce:active:scale-100",
            value === lead.value
              ? "border-edge-2 bg-sel text-ink"
              : "border-edge bg-card text-ink-3",
          )}
        >
          {cellBody(lead)}
        </button>
      )}
      {shown.length > 0 && (
        <div className="flex h-[46px] min-w-0 flex-1 rounded-md border border-edge bg-card">
          {shown.map((cell) => (
            <button
              key={cell.value}
              type="button"
              aria-pressed={value === cell.value}
              onClick={press(cell)}
              className={cn(
                "flex h-11 min-w-0 flex-1 flex-col items-center justify-center rounded-segment outline-none transition-colors duration-(--ca-dur-micro) ease-standard focus-visible:outline-2 focus-visible:outline-act-ink focus-visible:-outline-offset-2",
                value === cell.value ? "bg-sel text-ink" : "text-ink-3",
              )}
            >
              {cellBody(cell)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
