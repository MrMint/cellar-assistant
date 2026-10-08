import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type FilterChipProps = Omit<ComponentProps<"button">, "children"> & {
  selected: boolean;
  children: ReactNode;
  /** A leading glyph; the label is always there too. */
  icon?: ReactNode;
  /** Shown after the label, hidden when zero (design §3.7). */
  count?: number;
};

/**
 * A pill that filters a list (replaces clickable Joy `Chip`s). A toggle
 * button — `aria-pressed` — 36 px tall inside a 44 px target. Selected is
 * an inked surface, not brass: a filter is state, not an action.
 */
export function FilterChip({
  selected,
  icon,
  count,
  className,
  children,
  type = "button",
  ...props
}: FilterChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      data-slot="filter-chip"
      data-selected={selected ? "" : undefined}
      className={cn(
        "relative inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 font-medium text-sm outline-none transition-[color,background-color,transform] duration-(--ca-dur-micro) ease-standard after:absolute after:-inset-y-1 after:inset-x-0 after:content-[''] focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-97 disabled:opacity-50 motion-reduce:active:scale-100 [&_svg:not([class*='size-'])]:size-4",
        selected
          ? "bg-ink-1 text-background"
          : "bg-surface-2 text-ink-2 hover:bg-surface-3",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
      {count !== undefined && count > 0 && (
        <span className="tabular text-xs opacity-70">{count}</span>
      )}
    </button>
  );
}
