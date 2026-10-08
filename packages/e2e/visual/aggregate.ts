import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir, VISUAL } from "./env.ts";

type Impact = "critical" | "serious" | "moderate" | "minor";
type RouteRecord = {
  stem: string;
  slice: string;
  viewport: string;
  status: number | null;
  layout: { overflowX: boolean; under44: number; under24: number };
  axe: {
    counts: Record<Impact, number>;
    violations: { id: string; impact: Impact; nodes: number }[];
  };
  states: { name: string; error?: string }[];
  errors: string[];
  tree: string;
};

/**
 * Global teardown: folds the per-route `data/*.json` into `summary.json` —
 * the run's tree label (and every tree the records carry), base URL, every
 * route record, and totals per slice and per axe rule. Records already in
 * the directory from an earlier run into the same `VISUAL_OUT` are kept, so a
 * re-run of one slice updates its rows.
 */
export default function aggregate(): void {
  const dir = dataDir();
  if (!existsSync(dir)) return;
  const records = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as RouteRecord);

  const zero = (): Record<Impact, number> => ({
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
  });
  const bySlice: Record<
    string,
    { routes: number; axe: Record<Impact, number>; overflowX: number }
  > = {};
  const byRule: Record<
    string,
    { impact: Impact; routes: number; nodes: number }
  > = {};
  const axe = zero();
  for (const r of records) {
    const slice = (bySlice[r.slice] ??= {
      routes: 0,
      axe: zero(),
      overflowX: 0,
    });
    slice.routes += 1;
    if (r.layout.overflowX) slice.overflowX += 1;
    for (const k of Object.keys(axe) as Impact[]) {
      axe[k] += r.axe.counts[k];
      slice.axe[k] += r.axe.counts[k];
    }
    for (const v of r.axe.violations) {
      const rule = (byRule[v.id] ??= { impact: v.impact, routes: 0, nodes: 0 });
      rule.routes += 1;
      rule.nodes += v.nodes;
    }
  }

  // Records from an earlier run into the same VISUAL_OUT are kept, so name
  // every tree the summary actually covers: one label is a claim about all.
  const trees = [...new Set(records.map((r) => r.tree))].sort();
  if (trees.length > 1) {
    console.warn(
      `visual: ${dir} mixes captures from trees ${trees.join(", ")} — summary.json lists each`,
    );
  }
  const summary = {
    tree: VISUAL.tree,
    trees,
    baseURL: VISUAL.baseURL,
    writtenAt: new Date().toISOString(),
    totals: {
      captures: records.length,
      httpErrors: records
        .filter((r) => (r.status ?? 0) >= 400)
        .map((r) => r.stem),
      overflowX: records.filter((r) => r.layout.overflowX).map((r) => r.stem),
      withConsoleErrors: records.filter((r) => r.errors.length > 0).length,
      stateFailures: records.flatMap((r) =>
        r.states
          .filter((s) => s.error !== undefined)
          .map((s) => `${r.stem}__${s.name}`),
      ),
      axe,
      axeByRule: Object.fromEntries(
        Object.entries(byRule).sort(([, a], [, b]) => b.nodes - a.nodes),
      ),
      bySlice,
    },
    routes: records,
  };
  writeFileSync(
    join(VISUAL.out, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
}
