"use client";

/**
 * The band histogram. On the tokens (D20): each bar is its band's
 * `--ca-band-*` colour (`BAND_COLORS`) beside the band word on the axis, the
 * axis ink and the hover wash are `--ca-*` roles, and the grow-in runs the
 * long motion token — none at all under reduced motion.
 */

import { useReducedMotion } from "motion/react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { dur } from "@/lib/motion";
import type { BandDistribution } from "./computeInsightsStats";

interface BandDistributionChartProps {
  distribution: BandDistribution[];
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: BandDistribution }>;
}) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="surface-glass rounded-md px-2.5 py-1.5 text-ink-1 type-footnote">
      <strong>{d.label}</strong>: {d.count} item{d.count !== 1 ? "s" : ""} (
      {d.percentage}%)
    </div>
  );
}

export function BandDistributionChart({
  distribution,
}: BandDistributionChartProps) {
  const reduceMotion = useReducedMotion() ?? false;

  // Filter to only bands with items for a cleaner chart, but keep all if <=3 bands have items
  const filledBands = distribution.filter((d) => d.count > 0);
  const chartData = filledBands.length <= 2 ? distribution : filledBands;

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-ink-1 type-headline">Band Distribution</h4>
      <ResponsiveContainer width="100%" height={chartData.length * 40 + 16}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 48, bottom: 0, left: 0 }}
          barCategoryGap="20%"
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            axisLine={false}
            tickLine={false}
            width={90}
            tick={{ fill: "var(--ca-ink-2)", fontSize: 12 }}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: "var(--ca-surface-2)" }}
          />
          <Bar
            dataKey="count"
            radius={[0, 6, 6, 0]}
            isAnimationActive={!reduceMotion}
            animationDuration={dur.long * 1000}
          >
            {chartData.map((d) => (
              <Cell key={d.band} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
