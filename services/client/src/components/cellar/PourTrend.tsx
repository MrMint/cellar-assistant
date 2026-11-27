"use client";

import { type PointerEvent, useId, useState } from "react";
import { cn } from "@/lib/utils";
import { pourTrend, sparkBars } from "./dashboard";

/** The chart's own coordinate box; it scales to the card's width. */
const BOX = { width: 288, height: 48, gap: 4 } as const;

/** A rounded data end (the top), square at the baseline. */
const barPath = (
  x: number,
  y: number,
  width: number,
  height: number,
): string => {
  const r = Math.min(2, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
};

/**
 * Pours per month (X04, D3): a twelve-bar sparkline of the logs poured from
 * this cellar, the current month last and drawn in full ink, the rest in the
 * recessive ink — one series, so no legend; the title names it.
 *
 * The readout above it says one month at a time ("Aug 2026 · 4 pours"): the
 * current month at rest, and whichever bar a finger or pointer is over, or
 * the arrow keys have reached once the chart has focus. Hit targets are the
 * full column, not the bar. Screen readers get the whole series as a table
 * and a one-sentence summary; the drawn bars are hidden from them.
 */
export function PourTrend({
  logsByMonth,
  currentMonth,
}: {
  logsByMonth: readonly number[];
  currentMonth: string;
}) {
  const trend = pourTrend({ logsByMonth, currentMonth });
  const last = trend.months.length - 1;
  const [selected, setSelected] = useState(last);
  const headingId = useId();
  const tableId = useId();
  const bars = sparkBars(
    trend.months.map((month) => month.count),
    BOX,
  );
  const shown = trend.months[selected] ?? trend.months[last];
  const columnWidth = BOX.width / Math.max(1, trend.months.length);

  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const x = ((event.clientX - rect.left) / rect.width) * BOX.width;
    setSelected(Math.min(last, Math.max(0, Math.floor(x / columnWidth))));
  };
  if (trend.months.length === 0) return null;

  return (
    <section
      aria-labelledby={headingId}
      data-slot="cellar-pour-trend"
      className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="t-head">
          Pours
        </h2>
        <p className="t-cap">
          {trend.total} in {trend.months.length} months
        </p>
      </div>

      {/*
        Not a live region: scrubbing would read out every month a finger
        crosses, and the range below already speaks its month on each step.
      */}
      <p data-slot="pour-trend-readout" className="flex items-baseline gap-2">
        <span className="font-semibold text-[1.75rem] leading-none tracking-tight">
          {shown?.count ?? 0}
        </span>
        <span className="t-body text-ink-2">
          {shown === undefined
            ? ""
            : `${shown.count === 1 ? "pour" : "pours"} in ${
                selected === last ? "this month" : shown.long
              }`}
        </span>
      </p>

      {/*
        The keyboard and assistive-tech half is a native range over the
        months — arrows, Home and End for free, and its value spoken as
        "August 2026: 9 pours" — visually hidden; the bars are the pointer
        half. The ring shows on the chart when the range has focus.
      */}
      <div className="relative rounded-sm has-[input:focus-visible]:ring-[3px] has-[input:focus-visible]:ring-ring/50">
        <input
          type="range"
          min={0}
          max={last}
          step={1}
          value={selected}
          onChange={(event) =>
            setSelected(
              Math.min(last, Math.max(0, Number(event.currentTarget.value))),
            )
          }
          aria-label="Pours per month"
          aria-valuetext={
            shown === undefined
              ? undefined
              : `${shown.long}: ${shown.count} ${shown.count === 1 ? "pour" : "pours"}`
          }
          aria-describedby={tableId}
          data-slot="pour-trend-month"
          className="sr-only"
        />
        <svg
          aria-hidden
          viewBox={`0 0 ${BOX.width} ${BOX.height + 1}`}
          preserveAspectRatio="none"
          className="block h-14 w-full touch-pan-y"
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={(event) => {
            // A mouse leaving the chart puts it back to this month. A finger
            // lifting is also a "leave", and there the month it chose should
            // stay readable after the finger is gone.
            if (event.pointerType === "mouse") setSelected(last);
          }}
        >
          <line
            x1={0}
            x2={BOX.width}
            y1={BOX.height + 0.5}
            y2={BOX.height + 0.5}
            className="stroke-line"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          {bars.map((bar, index) =>
            bar.height === 0 ? null : (
              <path
                // biome-ignore lint/suspicious/noArrayIndexKey: one bar per month, fixed order.
                key={index}
                d={barPath(bar.x, bar.y, bar.width, bar.height)}
                className={cn(
                  "transition-colors duration-(--ca-dur-micro)",
                  index === selected
                    ? "fill-ink-1"
                    : index === last
                      ? "fill-ink-2"
                      : "fill-ink-3/60",
                )}
              />
            ),
          )}
        </svg>
        <div aria-hidden className="t-cap mt-1 flex justify-between">
          <span>{trend.months[0]?.short}</span>
          <span>{trend.months[last]?.short}</span>
        </div>
      </div>

      {/*
        `sr-only` goes on a wrapper, not the table: a table ignores the 1px
        width and lays out at its content's width, which widened the whole
        document past a phone's screen (390 → 632) and let the page scroll
        sideways. The wrapper's 1px box and overflow clip it.
      */}
      <div className="sr-only">
        <table id={tableId}>
          <caption>{trend.spoken}</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Pours</th>
            </tr>
          </thead>
          <tbody>
            {trend.months.map((month) => (
              <tr key={month.key}>
                <th scope="row">{month.long}</th>
                <td>{month.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
