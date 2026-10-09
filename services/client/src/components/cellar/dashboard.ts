/**
 * The cellar dashboard's words and numbers (X04, D3), pure so they are tested
 * without a render and the server and the browser print the same thing.
 *
 * Months are `YYYY-MM` keys the API cut in the viewer's zone; their names
 * come from a fixed table here rather than `Intl`, so hydration never depends
 * on two ICU builds agreeing (`components/common/Timestamp.tsx` has the long
 * story).
 */
import { ITEM_TYPES_IN_ORDER, itemTypeTokens } from "@/components/app/TypeChip";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";

export const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** `2026-10` → its parts, or null for anything else. */
const parseMonth = (key: string): { year: number; month: number } | null => {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (match === null) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year: Number(match[1]), month };
};

/** `2026-10` → "Oct" / "October 2026". */
export const monthLabel = (key: string, style: "short" | "long"): string => {
  const parsed = parseMonth(key);
  if (parsed === null) return key;
  return style === "short"
    ? (MONTHS_SHORT[parsed.month - 1] ?? key)
    : `${MONTHS_LONG[parsed.month - 1] ?? key} ${parsed.year}`;
};

/** The `count` month keys ending at `current`, oldest first. */
export const monthKeysEndingAt = (current: string, count: number): string[] => {
  const parsed = parseMonth(current);
  if (parsed === null) return [];
  const out: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const index = parsed.year * 12 + (parsed.month - 1) - back;
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    out.push(`${year}-${String(month).padStart(2, "0")}`);
  }
  return out;
};

export type DashboardData = {
  bottleCount: number;
  openCount: number;
  almostEmptyCount: number;
  almostEmptyAt: number;
  finishedThisMonth: number;
  finishedCount: number;
  addedRecently: number;
  recentDays: number;
  logsByMonth: readonly number[];
  currentMonth: string;
  timeZone: string;
};

export type TypeCounts = Partial<Record<ApiItemType, number>>;

/**
 * "8 wine · 3 spirit · 1 sake" — the bottles still in the cellar by type, in
 * the canonical order, the three biggest named and the rest folded in.
 * Words, never colour alone: the six type hues fail as a categorical palette
 * (the dataviz validator: adjacent oak and amber are ΔE 4.4 apart), so the
 * dashboard names types rather than painting them.
 */
export const byTypeLine = (counts: TypeCounts): string | null => {
  const present = ITEM_TYPES_IN_ORDER.flatMap((type) => {
    const count = counts[type] ?? 0;
    return count > 0 ? [{ type, count }] : [];
  });
  if (present.length === 0) return null;
  const top = [...present]
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((entry) => entry.type);
  const named = present.filter((entry) => top.includes(entry.type));
  const rest = present
    .filter((entry) => !top.includes(entry.type))
    .reduce((sum, entry) => sum + entry.count, 0);
  const words = named.map(
    (entry) =>
      `${entry.count} ${itemTypeTokens[entry.type].label.toLowerCase()}`,
  );
  if (rest > 0) words.push(`${rest} more`);
  return words.join(" · ");
};

export type StatTile = {
  key: "in-cellar" | "open" | "almost-empty" | "finished";
  label: string;
  value: number;
  detail: string | null;
  /** Where a tap goes: the collection, sorted or segmented to match. */
  href: string;
};

/**
 * The four tiles: what is in the cellar (by type), what is open (and how
 * much is still sealed), what is almost gone, what you finished this month.
 * Each one opens the collection below with the matching sort or segment, at
 * the collection.
 */
export const dashboardTiles = (
  cellarId: string,
  data: DashboardData,
  counts: TypeCounts,
): StatTile[] => {
  const base = `/cellars/${cellarId}/items`;
  return [
    {
      key: "in-cellar",
      label: "In the cellar",
      value: data.bottleCount,
      detail: byTypeLine(counts),
      href: `${base}#collection`,
    },
    {
      key: "open",
      label: "Open",
      value: data.openCount,
      // What is *not* open, so the tile says something about opening. (It
      // used to carry "N added in 30 days", which under "Open" read as N
      // opened; the Recently added shelf says that, with its own window.)
      detail:
        data.bottleCount > data.openCount
          ? `${data.bottleCount - data.openCount} sealed`
          : null,
      href: `${base}?sort=open#collection`,
    },
    {
      key: "almost-empty",
      label: "Almost empty",
      value: data.almostEmptyCount,
      detail: `${data.almostEmptyAt}% left or less`,
      href: `${base}?sort=almost-empty#collection`,
    },
    {
      key: "finished",
      label: "Finished this month",
      value: data.finishedThisMonth,
      detail:
        data.finishedCount > 0 ? `${data.finishedCount} in the diary` : null,
      href: `${base}?status=finished#collection`,
    },
  ];
};

export type TrendMonth = {
  key: string;
  short: string;
  long: string;
  count: number;
};

export type Trend = {
  months: TrendMonth[];
  total: number;
  thisMonth: number;
  /** The busiest month, latest on a tie; null when nothing was logged. */
  peak: TrendMonth | null;
  /** One sentence a screen reader hears for the whole chart. */
  spoken: string;
};

const pours = (n: number): string => `${n} ${n === 1 ? "pour" : "pours"}`;

/** Logs per month → what the trend card prints and says. */
export const pourTrend = (data: {
  logsByMonth: readonly number[];
  currentMonth: string;
}): Trend => {
  const keys = monthKeysEndingAt(data.currentMonth, data.logsByMonth.length);
  const months = keys.map((key, index) => ({
    key,
    short: monthLabel(key, "short"),
    long: monthLabel(key, "long"),
    count: data.logsByMonth[index] ?? 0,
  }));
  const total = months.reduce((sum, month) => sum + month.count, 0);
  const thisMonth = months.at(-1)?.count ?? 0;
  const peak =
    total === 0
      ? null
      : months.reduce(
          (best, month) => (month.count >= best.count ? month : best),
          months[0] as TrendMonth,
        );
  const spoken =
    total === 0
      ? `No pours logged from this cellar in the last ${months.length} months.`
      : `${pours(total)} in the last ${months.length} months, ${pours(thisMonth)} this month` +
        (peak === null ? "." : `; the most in ${peak.long} (${peak.count}).`);
  return { months, total, thisMonth, peak, spoken };
};

export type SparkBar = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Bar geometry for the trend: one bar per month across `width`, `gap` apart,
 * scaled to the busiest month. A month with any pours gets at least
 * `minHeight` so a single log is visible; an empty month has no bar (the
 * baseline shows it). Bars rise from the bottom, so their data end is the top.
 */
export const sparkBars = (
  counts: readonly number[],
  box: { width: number; height: number; gap: number; minHeight?: number },
): SparkBar[] => {
  const n = counts.length;
  if (n === 0) return [];
  const barWidth = Math.max(1, (box.width - box.gap * (n - 1)) / n);
  const max = Math.max(...counts, 0);
  const minHeight = box.minHeight ?? 3;
  return counts.map((count, index) => {
    const height =
      count <= 0 || max === 0
        ? 0
        : Math.max(minHeight, (count / max) * box.height);
    return {
      x: index * (barWidth + box.gap),
      y: box.height - height,
      width: barWidth,
      height,
    };
  });
};

/** Whether the dashboard has anything to show above the collection. */
export const dashboardHasContent = (data: DashboardData): boolean =>
  data.bottleCount > 0 || data.finishedCount > 0;
