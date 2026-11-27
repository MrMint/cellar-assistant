"use client";

import { useState } from "react";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";

export type ChartPoint = {
  /** The axis label under it ("4½", "Mar"); empty for none. */
  label: string;
  value: number;
  /** What a tap reads out ("12 bottles at 4½"). */
  readout: string;
};

/** Bar heights as shares of the tallest; all zeros stay zero. */
export function barShares(values: readonly number[]): number[] {
  const max = Math.max(0, ...values);
  return values.map((v) => (max > 0 ? Math.max(0, v) / max : 0));
}

function ChartFrame({
  title,
  readout,
  className,
  children,
}: {
  title: string;
  readout: string | undefined;
  className?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <figure
      data-slot="chart"
      className={cn("m-0 flex flex-col gap-2", className)}
    >
      <figcaption className="flex items-baseline gap-2">
        <span className="t-head min-w-0 flex-1 truncate text-ink">{title}</span>
        <span aria-live="polite" className="t-cap tabular text-ink-2">
          {readout ?? ""}
        </span>
      </figcaption>
      {children}
    </figure>
  );
}

/**
 * KIT § 3 "Chart": the owner's histogram in one hue (act), 4 px rounded bar
 * ends, gaps of 2, value labels in ink-2, one axis, no legend. A tap on a bar
 * reads it out (and turns it act-ink); a second tap clears. Ticks.
 */
export function Histogram({
  title,
  points,
  className,
}: {
  title: string;
  points: readonly ChartPoint[];
  className?: string;
}) {
  const [on, setOn] = useState<number | null>(null);
  const shares = barShares(points.map((p) => p.value));
  return (
    <ChartFrame
      title={title}
      readout={on === null ? undefined : points[on]?.readout}
      className={className}
    >
      <div className="flex h-[132px] items-end gap-0.5 border-edge border-b">
        {points.map((point, i) => (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: bars are positional.
            key={i}
            type="button"
            aria-pressed={on === i}
            aria-label={point.readout}
            onClick={() => {
              feedback("tick");
              setOn(on === i ? null : i);
            }}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 outline-none focus-visible:outline-2 focus-visible:outline-act-ink"
          >
            {point.value > 0 && (
              <span aria-hidden className="t-micro tabular text-ink-2">
                {point.value}
              </span>
            )}
            <span
              aria-hidden
              className={cn(
                "block w-full rounded-t-xs",
                on === i ? "bg-act-ink" : "bg-act",
              )}
              style={{ height: `${(shares[i] ?? 0) * 100}px` }}
            />
          </button>
        ))}
      </div>
      <div aria-hidden className="flex gap-0.5">
        {points.map((point, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: labels are positional.
            key={i}
            className="t-micro tabular min-w-0 flex-1 text-center text-ink-3"
          >
            {point.label}
          </span>
        ))}
      </div>
    </ChartFrame>
  );
}

const PLOT_H = 120;

/**
 * KIT § 3 "Chart": one trend line, 2 px, in act, over one axis. A tap on a
 * column puts the crosshair there and reads the point out; a second tap
 * clears. Ticks. Each column is a button, so the points are reachable by
 * keyboard and named.
 */
export function TrendChart({
  title,
  points,
  className,
}: {
  title: string;
  points: readonly ChartPoint[];
  className?: string;
}) {
  const [on, setOn] = useState<number | null>(null);
  const shares = barShares(points.map((p) => p.value));
  const n = points.length;
  const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const y = (i: number) => PLOT_H - (shares[i] ?? 0) * (PLOT_H - 8) - 4;
  const line = points.map((_, i) => `${x(i)},${y(i)}`).join(" ");
  return (
    <ChartFrame
      title={title}
      readout={on === null ? undefined : points[on]?.readout}
      className={className}
    >
      <div className="relative h-[120px] border-edge border-b">
        <svg
          aria-hidden
          viewBox={`0 0 100 ${PLOT_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
        >
          {on !== null && (
            <line
              x1={x(on)}
              x2={x(on)}
              y1={0}
              y2={PLOT_H}
              vectorEffect="non-scaling-stroke"
              className="stroke-rule"
              strokeWidth={1}
            />
          )}
          <polyline
            points={line}
            fill="none"
            vectorEffect="non-scaling-stroke"
            className="stroke-act"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
        {on !== null && (
          <span
            aria-hidden
            className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-act-ink bg-background"
            style={{ left: `${x(on)}%`, top: `${y(on)}px` }}
          />
        )}
        <div className="absolute inset-0 flex">
          {points.map((point, i) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional.
              key={i}
              type="button"
              aria-pressed={on === i}
              aria-label={point.readout}
              onClick={() => {
                feedback("tick");
                setOn(on === i ? null : i);
              }}
              className="h-full min-w-0 flex-1 outline-none focus-visible:outline-2 focus-visible:outline-act-ink"
            />
          ))}
        </div>
      </div>
      <div aria-hidden className="flex">
        {points.map((point, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: labels are positional.
            key={i}
            className="t-micro tabular min-w-0 flex-1 text-center text-ink-3"
          >
            {point.label}
          </span>
        ))}
      </div>
    </ChartFrame>
  );
}
