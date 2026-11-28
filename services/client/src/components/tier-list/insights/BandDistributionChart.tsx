"use client";

/**
 * The list's band spread (Social-Placing 21 "Bands"): F2b's `Histogram`, one
 * bar per band in the kit's act hue (CROSS-LOT "Chart bars"), best band
 * first, a tap reading the band out. Unrated shows only when something sits
 * in it.
 */

import { useState } from "react";
import { BAND_FILL, type Band } from "@/components/app/parts/Rank";
import { feedback } from "@/lib/feedback";
import { cn } from "@/lib/utils";
import type { BandDistribution } from "./computeInsightsStats";

const SHORT: Record<number, string> = {
  5: "Outst.",
  4: "V. good",
  3: "Good",
  2: "Medi.",
  1: "Bad",
  0: "Unrated",
};

/**
 * F-16: bars wear their band's colour (the board's "Bands" chart), where
 * `Histogram` is one hue; the same frame, readout and tap otherwise.
 */
export function BandDistributionChart({
  distribution,
  noun = "entries",
}: {
  distribution: BandDistribution[];
  /** "places", "wines": what the readout counts. */
  noun?: string;
}) {
  const [on, setOn] = useState<number | null>(null);
  const total = distribution.reduce((n, d) => n + d.count, 0);
  const shown = distribution.filter((d) => d.band !== 0 || d.count > 0);
  const max = Math.max(0, ...shown.map((d) => d.count));
  const readout = (d: BandDistribution) => `${d.count} in ${d.label}`;
  const picked = on === null ? undefined : shown[on];
  return (
    <figure data-slot="chart" className="m-0 flex flex-col gap-2">
      <figcaption className="flex items-baseline gap-2">
        <span className="t-head min-w-0 flex-1 truncate text-ink">
          {`Bands · ${total} ${noun}`}
        </span>
        <span aria-live="polite" className="t-cap tabular text-ink-2">
          {picked ? readout(picked) : ""}
        </span>
      </figcaption>
      <div className="flex h-[132px] items-end gap-0.5 border-edge border-b">
        {shown.map((d, i) => (
          <button
            key={d.band}
            type="button"
            aria-pressed={on === i}
            aria-label={readout(d)}
            onClick={() => {
              feedback("tick");
              setOn(on === i ? null : i);
            }}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 outline-none focus-visible:outline-2 focus-visible:outline-act-ink"
          >
            {d.count > 0 && (
              <span aria-hidden className="t-micro tabular text-ink-2">
                {d.count}
              </span>
            )}
            <span
              aria-hidden
              data-band={d.band}
              className={cn(
                "block w-full rounded-t-xs",
                d.band === 0 ? "bg-edge-2" : BAND_FILL[d.band as Band],
                on !== null && on !== i && "opacity-60",
              )}
              style={{ height: `${max > 0 ? (d.count / max) * 100 : 0}px` }}
            />
          </button>
        ))}
      </div>
      <div aria-hidden className="flex gap-0.5">
        {shown.map((d) => (
          <span
            key={d.band}
            className="t-micro tabular min-w-0 flex-1 text-center text-ink-3"
          >
            {SHORT[d.band] ?? d.label}
          </span>
        ))}
      </div>
    </figure>
  );
}
