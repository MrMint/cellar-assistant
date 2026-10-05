import type { TierListInsightsItem } from "../types";

export interface BadgeProgress {
  current: number;
  target: number;
}

export interface PalatePassportBadge {
  id: string;
  label: string;
  description: string;
  icon: string;
  earned: boolean;
  progress: BadgeProgress | null;
}

interface BadgeDefinition {
  id: string;
  label: string;
  description: string;
  icon: string;
  check: (items: TierListInsightsItem[]) => boolean;
  progress?: (items: TierListInsightsItem[]) => BadgeProgress;
}

const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: "globe-trotter",
    label: "Globe Trotter",
    description: "Ranked places from 5+ countries",
    icon: "globe",
    check: (items) => countUnique(items, "countryCode") >= 5,
    progress: (items) => ({
      current: countUnique(items, "countryCode"),
      target: 5,
    }),
  },
  {
    id: "category-connoisseur",
    label: "Category Connoisseur",
    description: "Explored 4+ place categories",
    icon: "category",
    check: (items) => countUnique(items, "primaryCategory") >= 4,
    progress: (items) => ({
      current: countUnique(items, "primaryCategory"),
      target: 4,
    }),
  },
  {
    id: "decisive-critic",
    label: "Decisive Critic",
    description: "3+ items rated Outstanding",
    icon: "star",
    check: (items) => items.filter((i) => i.band === 5).length >= 3,
    progress: (items) => ({
      current: items.filter((i) => i.band === 5).length,
      target: 3,
    }),
  },
  {
    id: "well-rounded",
    label: "Well-Rounded",
    description: "Items across 4+ different bands",
    icon: "layers",
    check: (items) => countUnique(items, "band") >= 4,
    progress: (items) => ({
      current: countUnique(items, "band"),
      target: 4,
    }),
  },
  {
    id: "local-expert",
    label: "Local Expert",
    description: "10+ places from the same country",
    icon: "pin",
    check: (items) => {
      const counts = new Map<string, number>();
      for (const item of items) {
        if (item.countryCode) {
          counts.set(item.countryCode, (counts.get(item.countryCode) ?? 0) + 1);
        }
      }
      return Array.from(counts.values()).some((c) => c >= 10);
    },
    progress: (items) => {
      const counts = new Map<string, number>();
      for (const item of items) {
        if (item.countryCode) {
          counts.set(item.countryCode, (counts.get(item.countryCode) ?? 0) + 1);
        }
      }
      const max = Math.max(0, ...Array.from(counts.values()));
      return { current: max, target: 10 };
    },
  },
  {
    id: "tough-crowd",
    label: "Tough Crowd",
    description: "More items in Bad/Mediocre than Outstanding/Very Good",
    icon: "thumbs-down",
    check: (items) => {
      const low = items.filter((i) => i.band <= 2 && i.band > 0).length;
      const high = items.filter((i) => i.band >= 4).length;
      return low > high && low > 0;
    },
    // No progress — the target is dynamic (depends on high-rated count)
  },
];

function countUnique(
  items: TierListInsightsItem[],
  key: keyof TierListInsightsItem,
): number {
  const values = new Set(
    items.map((i) => i[key]).filter((v) => v != null && v !== ""),
  );
  return values.size;
}

export function evaluateBadges(
  items: TierListInsightsItem[],
): PalatePassportBadge[] {
  return BADGE_DEFINITIONS.map((def) => ({
    id: def.id,
    label: def.label,
    description: def.description,
    icon: def.icon,
    earned: def.check(items),
    progress: def.progress?.(items) ?? null,
  }));
}
