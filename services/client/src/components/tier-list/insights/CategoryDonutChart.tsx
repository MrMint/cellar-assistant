"use client";

/**
 * Place categories as a donut with a printed legend. The design has no
 * categorical chart palette (Material's default hues are banned, §3.1), so
 * the slices borrow the token hues that read on dark: brass, then the
 * beverage types' text-safe tints, then ink. Teal stays out (it means AI),
 * and the legend always names each slice, so no colour carries meaning
 * alone. The grow-in runs the long motion token, none under reduced motion.
 */

import { useReducedMotion } from "motion/react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { dur } from "@/lib/motion";
import { formatPlaceCategory } from "@/utilities/formatters";
import type { CategoryDistribution } from "./computeInsightsStats";

const CATEGORY_COLORS = [
  "var(--ca-accent)",
  "var(--ca-type-sake-text)",
  "var(--ca-type-tea-text)",
  "var(--ca-type-wine-text)",
  "var(--ca-type-beer-text)",
  "var(--ca-type-coffee-text)",
  "var(--ca-ink-2)",
  "var(--ca-type-spirit-text)",
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
    <div className="surface-glass rounded-md px-2.5 py-1.5 text-ink-1 type-footnote">
      <strong>{formatPlaceCategory(d.category)}</strong>: {d.count} (
      {d.percentage}%)
    </div>
  );
}

export function CategoryDonutChart({ distribution }: CategoryDonutChartProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const total = distribution.reduce((sum, d) => sum + d.count, 0);

  if (distribution.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-ink-1 type-headline">Category Breakdown</h4>
      <div className="flex min-h-40 flex-row items-center gap-4">
        {/* Donut */}
        <div className="size-[140px] shrink-0">
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
                isAnimationActive={!reduceMotion}
                animationDuration={dur.long * 1000}
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
        </div>

        {/* Legend */}
        <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
          {distribution.map((d, i) => (
            <li key={d.category} className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                }}
              />
              <span className="min-w-0 flex-1 truncate text-ink-2 type-footnote">
                {formatPlaceCategory(d.category)}
              </span>
              <span className="tabular shrink-0 type-footnote">{d.count}</span>
            </li>
          ))}
          <li className="tabular pt-1 type-footnote">{total} total</li>
        </ul>
      </div>
    </div>
  );
}
