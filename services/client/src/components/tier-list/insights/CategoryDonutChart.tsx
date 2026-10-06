"use client";

import { Box, Stack, Typography } from "@mui/joy";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCategoryName } from "../utils";
import type { CategoryDistribution } from "./computeInsightsStats";

// Distinct palette that works on both light and dark backgrounds
const CATEGORY_COLORS = [
  "#5c6bc0", // indigo
  "#26a69a", // teal
  "#ef5350", // red
  "#ffa726", // orange
  "#66bb6a", // green
  "#ab47bc", // purple
  "#42a5f5", // blue
  "#ec407a", // pink
];

interface CategoryDonutChartProps {
  distribution: CategoryDistribution[];
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: CategoryDistribution & { fill: string } }>;
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
      <strong>{formatCategoryName(d.category)}</strong>: {d.count} (
      {d.percentage}%)
    </div>
  );
}

export function CategoryDonutChart({ distribution }: CategoryDonutChartProps) {
  const total = distribution.reduce((sum, d) => sum + d.count, 0);

  if (distribution.length === 0) return null;

  return (
    <Stack spacing={1.5}>
      <Typography level="title-md">Category Breakdown</Typography>
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        sx={{ minHeight: 160 }}
      >
        {/* Donut */}
        <Box sx={{ width: 140, height: 140, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={distribution}
                dataKey="count"
                nameKey="category"
                cx="50%"
                cy="50%"
                innerRadius="55%"
                outerRadius="90%"
                paddingAngle={distribution.length > 1 ? 3 : 0}
                animationDuration={600}
                stroke="none"
              >
                {distribution.map((d, i) => (
                  <Cell
                    key={d.category}
                    fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </Box>

        {/* Legend */}
        <Stack spacing={0.75} sx={{ flex: 1, minWidth: 0 }}>
          {distribution.map((d, i) => (
            <Stack
              key={d.category}
              direction="row"
              spacing={1}
              alignItems="center"
            >
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                  flexShrink: 0,
                }}
              />
              <Typography
                level="body-xs"
                sx={{
                  color: "text.secondary",
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {formatCategoryName(d.category)}
              </Typography>
              <Typography
                level="body-xs"
                sx={{
                  color: "text.tertiary",
                  flexShrink: 0,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {d.count}
              </Typography>
            </Stack>
          ))}
          <Typography level="body-xs" sx={{ color: "text.tertiary", pt: 0.5 }}>
            {total} total
          </Typography>
        </Stack>
      </Stack>
    </Stack>
  );
}
