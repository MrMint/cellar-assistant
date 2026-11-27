import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * KIT § 3 "Stat tile": one number in t-score, its label in t-cap, and an
 * optional change in words ("3 more than October"). Each number opens the
 * list it counts: wrap the tile in an `app/Link` (it shows raised while the
 * link is pressed); the tile itself is static.
 */
export function StatTile({
  value,
  label,
  delta,
  className,
}: {
  value: ReactNode;
  label: string;
  delta?: string;
  className?: string;
}) {
  return (
    <div
      data-slot="stat-tile"
      className={cn(
        "flex min-h-[88px] flex-col justify-center gap-0.5 rounded-md border border-edge bg-card px-3.5 py-3 [a:active>&]:bg-raised",
        className,
      )}
    >
      <span className="t-score tabular text-ink">{value}</span>
      <span className="t-cap text-ink-2">{label}</span>
      {delta !== undefined && <span className="t-cap text-ink-3">{delta}</span>}
    </div>
  );
}

/** Two tiles a row, 12 apart. */
export function StatGrid({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-slot="stat-grid"
      className={cn("grid grid-cols-2 gap-3", className)}
    >
      {children}
    </div>
  );
}
