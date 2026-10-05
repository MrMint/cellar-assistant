import { BAND_COLORS, BAND_LABELS, BANDS } from "../constants";
import type { TierListInsightsItem } from "../types";
import { evaluateBadges, type PalatePassportBadge } from "./badges";

export interface BandDistribution {
  band: number;
  label: string;
  count: number;
  color: string;
  percentage: number;
}

export function computeBandDistribution(
  items: TierListInsightsItem[],
): BandDistribution[] {
  const total = items.length;
  if (total === 0) return [];

  const counts = new Map<number, number>();
  for (const item of items) {
    counts.set(item.band, (counts.get(item.band) ?? 0) + 1);
  }

  return BANDS.map((band) => {
    const count = counts.get(band) ?? 0;
    return {
      band,
      label: BAND_LABELS[band] ?? `Band ${band}`,
      count,
      color: BAND_COLORS[band] ?? "#757575",
      percentage: Math.round((count / total) * 100),
    };
  });
}

export interface PalatePassportStats {
  uniqueCountries: number;
  uniqueRegions: number;
  uniqueCategories: number;
  topCountry: string | null;
  topCategory: string | null;
  badges: PalatePassportBadge[];
}

function topByFrequency(
  items: TierListInsightsItem[],
  key: "countryCode" | "primaryCategory",
): string | null {
  const counts = new Map<string, number>();
  for (const item of items) {
    const val = item[key];
    if (val) counts.set(val, (counts.get(val) ?? 0) + 1);
  }
  let top: string | null = null;
  let max = 0;
  for (const [val, count] of Array.from(counts.entries())) {
    if (count > max) {
      max = count;
      top = val;
    }
  }
  return top;
}

export interface CategoryDistribution {
  category: string;
  count: number;
  percentage: number;
}

export function computeCategoryDistribution(
  items: TierListInsightsItem[],
): CategoryDistribution[] {
  const total = items.length;
  if (total === 0) return [];

  const counts = new Map<string, number>();
  for (const item of items) {
    const cat = item.primaryCategory ?? "Unknown";
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([category, count]) => ({
      category,
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

export interface CountryHeatmapEntry {
  countryCode: string;
  avgBand: number;
  count: number;
}

export function computeCountryHeatmap(
  items: TierListInsightsItem[],
): CountryHeatmapEntry[] {
  const countryData = new Map<string, { totalBand: number; count: number }>();

  for (const item of items) {
    if (!item.countryCode) continue;
    const existing = countryData.get(item.countryCode);
    if (existing) {
      existing.totalBand += item.band;
      existing.count += 1;
    } else {
      countryData.set(item.countryCode, {
        totalBand: item.band,
        count: 1,
      });
    }
  }

  return Array.from(countryData.entries()).map(([countryCode, data]) => ({
    countryCode,
    avgBand: data.totalBand / data.count,
    count: data.count,
  }));
}

export function computePalatePassport(
  items: TierListInsightsItem[],
): PalatePassportStats {
  const countries = new Set(items.map((i) => i.countryCode).filter(Boolean));
  const regions = new Set(items.map((i) => i.region).filter(Boolean));
  const categories = new Set(
    items.map((i) => i.primaryCategory).filter(Boolean),
  );

  return {
    uniqueCountries: countries.size,
    uniqueRegions: regions.size,
    uniqueCategories: categories.size,
    topCountry: topByFrequency(items, "countryCode"),
    topCategory: topByFrequency(items, "primaryCategory"),
    badges: evaluateBadges(items),
  };
}
