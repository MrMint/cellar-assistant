"use client";

/**
 * The list's band spread (Social-Placing 21 "Bands"): F2b's `Histogram`, one
 * bar per band in the kit's act hue (CROSS-LOT "Chart bars"), best band
 * first, a tap reading the band out. Unrated shows only when something sits
 * in it.
 */

import { Histogram } from "@/components/app/parts/Chart";
import type { BandDistribution } from "./computeInsightsStats";

const SHORT: Record<number, string> = {
  5: "Outst.",
  4: "V. good",
  3: "Good",
  2: "Medi.",
  1: "Bad",
  0: "Unrated",
};

export function BandDistributionChart({
  distribution,
  noun = "entries",
}: {
  distribution: BandDistribution[];
  /** "places", "wines": what the readout counts. */
  noun?: string;
}) {
  const total = distribution.reduce((n, d) => n + d.count, 0);
  const shown = distribution.filter((d) => d.band !== 0 || d.count > 0);
  return (
    <Histogram
      title={`Bands · ${total} ${noun}`}
      points={shown.map((d) => ({
        label: SHORT[d.band] ?? d.label,
        value: d.count,
        readout: `${d.count} in ${d.label}`,
      }))}
    />
  );
}
