"use client";

/**
 * A place list's kinds (Social-Placing 22 "Kinds"): F2b's `Histogram` in the
 * kit's act hue, most first, the top six and the rest as "Other". The name
 * is kept for its one caller; the donut and its six type hues are gone (a
 * hue per kind said nothing the words did not, and broke in light).
 */

import { Histogram } from "@/components/app/parts/Chart";
import { formatPlaceCategory } from "@/utilities/formatters";
import type { CategoryDistribution } from "./computeInsightsStats";

const SHOWN = 6;

export function CategoryDonutChart({
  distribution,
}: {
  distribution: CategoryDistribution[];
}) {
  if (distribution.length === 0) return null;
  const sorted = [...distribution].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, SHOWN);
  const rest = sorted.slice(SHOWN).reduce((n, d) => n + d.count, 0);
  const points = top.map((d) => {
    const name = formatPlaceCategory(d.category) ?? d.category;
    return { label: name, value: d.count, readout: `${d.count} ${name}` };
  });
  if (rest > 0) {
    points.push({ label: "Other", value: rest, readout: `${rest} other` });
  }
  return <Histogram title="Kinds" points={points} />;
}
