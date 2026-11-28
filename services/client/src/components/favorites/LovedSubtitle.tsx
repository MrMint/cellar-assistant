import { type LovedCounts, lovedSubtitle } from "./loved-counts";

/**
 * F-135: the line under Loved's title, "25 drinks · 2 recipes" (Shell-Me,
 * Loved). Nothing loved, or counts that could not be read, draws no line.
 */
export function LovedSubtitle({ counts }: { counts: LovedCounts | null }) {
  const line = lovedSubtitle(counts);
  if (line === null) return null;
  return <p className="t-cap num -mt-3 text-ink-2">{line}</p>;
}
