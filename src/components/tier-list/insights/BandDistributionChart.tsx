"use client";

import { Stack, Typography, useTheme } from "@mui/joy";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
    <div
      style={{
        backgroundColor: "var(--joy-palette-background-surface)",
        border: "1px solid var(--joy-palette-divider)",
        borderRadius: 8,
        padding: "6px 10px",
        fontSize: 13,
      }}
    >
      <strong>{d.label}</strong>: {d.count} item{d.count !== 1 ? "s" : ""} (
      {d.percentage}%)
    </div>
  );
}

export function BandDistributionChart({
  distribution,
}: BandDistributionChartProps) {
  const theme = useTheme();
  const textColor =
    theme.palette.mode === "dark"
      ? "rgba(255,255,255,0.6)"
      : "rgba(0,0,0,0.55)";

  // Filter to only bands with items for a cleaner chart, but keep all if <=3 bands have items
  const filledBands = distribution.filter((d) => d.count > 0);
  const chartData =
    filledBands.length <= 2 ? distribution : filledBands;

  return (
    <Stack spacing={1.5}>
      <Typography level="title-md">Band Distribution</Typography>
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
            tick={{ fill: textColor, fontSize: 12 }}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: "var(--joy-palette-background-level1)" }}
          />
          <Bar dataKey="count" radius={[0, 6, 6, 0]} animationDuration={600}>
            {chartData.map((d) => (
              <Cell key={d.band} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Stack>
  );
}
