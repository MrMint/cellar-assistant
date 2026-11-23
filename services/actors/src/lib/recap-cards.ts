/**
 * L04 — the recap deck and breadth stamps, as pure functions over the rows
 * `recap-sql.ts` reads. No I/O, so every threshold is tested at its edge.
 *
 * Rules (contracts `recap.ts` has the numbers):
 *
 * - **Distinct things only.** Every count is a count of distinct items,
 *   styles, regions, types or recipes. Logging the same bottle ten times is
 *   one thing. Nothing counts logs, frequency or volume.
 * - **Item breadth counts item logs; recipe logs count only toward recipes
 *   made.** A recipe log has no item type, style or region, and is never "new
 *   to you".
 * - **Skipped, never padded.** A card below its threshold is left out; there
 *   is no filler card and no zero.
 */
import type {
  BreadthStampDto,
  BreadthStampKind,
  ItemType,
  RecapCardDto,
  RecapLogRow,
} from "@cellar-assistant/contracts";
import {
  BREADTH_STAMP_KINDS,
  BREADTH_STAMP_TIERS,
  RECAP_CARD_CHIP_LIMIT,
  RECAP_CARD_THRESHOLDS,
} from "@cellar-assistant/contracts";

const TYPE_LABELS: Readonly<Record<ItemType, string>> = {
  WINE: "Wine",
  BEER: "Beer",
  SPIRIT: "Spirit",
  COFFEE: "Coffee",
  SAKE: "Sake",
  TEA: "Tea",
};

const titleWords = (words: readonly string[]): string =>
  words
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

/**
 * A stored style or region as a chip, cased the way the item page prints it
 * (the client's `formatEnum`, W-17): `UNITED_STATES` → `United States`,
 * `INDIA_PALE_ALE` → `India Pale Ale`, a lower-case value such as `oolong` →
 * `Oolong`. Free text that already carries capitals ("Saint-Julien") is left
 * as written.
 */
export const displayValue = (raw: string): string => {
  const trimmed = raw.trim();
  if (/^[A-Z0-9_]+$/.test(trimmed)) {
    return titleWords(trimmed.toLowerCase().split("_"));
  }
  if (trimmed === trimmed.toLowerCase()) {
    return titleWords(trimmed.split(/\s+/));
  }
  return trimmed;
};

const norm = (value: string): string => value.trim().toLowerCase();

/** Insertion-ordered distinct set: key → first display label seen. */
class Distinct {
  readonly #labels = new Map<string, string | null>();
  add(key: string, label: string | null): void {
    const existing = this.#labels.get(key);
    if (existing === undefined) this.#labels.set(key, label);
    else if (existing === null && label !== null) this.#labels.set(key, label);
  }
  has(key: string): boolean {
    return this.#labels.has(key);
  }
  get size(): number {
    return this.#labels.size;
  }
  keys(): string[] {
    return [...this.#labels.keys()];
  }
  label(key: string): string | null {
    return this.#labels.get(key) ?? null;
  }
}

type Breadth = {
  readonly items: Distinct;
  readonly types: Distinct;
  readonly styles: Distinct;
  readonly regions: Distinct;
  readonly recipes: Distinct;
};

const breadthOf = (rows: readonly RecapLogRow[]): Breadth => {
  const breadth: Breadth = {
    items: new Distinct(),
    types: new Distinct(),
    styles: new Distinct(),
    regions: new Distinct(),
    recipes: new Distinct(),
  };
  for (const row of rows) {
    if (row.itemType !== null && row.itemId !== null) {
      breadth.items.add(`${row.itemType}:${row.itemId}`, row.name);
      breadth.types.add(row.itemType, TYPE_LABELS[row.itemType]);
      if (row.style !== null && row.style.trim() !== "") {
        breadth.styles.add(
          `${row.itemType}:${norm(row.style)}`,
          displayValue(row.style),
        );
      }
      if (row.region !== null && row.region.trim() !== "") {
        breadth.regions.add(norm(row.region), displayValue(row.region));
      }
    } else if (row.recipeId !== null) {
      breadth.recipes.add(row.recipeId, row.name);
    }
    // Neither: a log whose bottle or recipe was deleted. Counted by nothing.
  }
  return breadth;
};

const chipsOf = (set: Distinct, keys: readonly string[]): string[] => {
  const chips: string[] = [];
  for (const key of keys) {
    const label = set.label(key);
    if (label === null) continue;
    chips.push(label);
    if (chips.length === RECAP_CARD_CHIP_LIMIT) break;
  }
  return chips;
};

/** The highest tier `count` reaches for `kind`, or `null` below the first. */
export const stampTier = (
  kind: BreadthStampKind,
  count: number,
): number | null => {
  let tier: number | null = null;
  for (const threshold of BREADTH_STAMP_TIERS[kind]) {
    if (count >= threshold) tier = threshold;
  }
  return tier;
};

const stampCounts = (
  breadth: Breadth,
): Readonly<Record<BreadthStampKind, number>> => ({
  STYLES: breadth.styles.size,
  REGIONS: breadth.regions.size,
  TYPES: breadth.types.size,
  RECIPES: breadth.recipes.size,
});

/** Breadth stamps over every row given (in-period or not). */
export const computeStamps = (
  rows: readonly RecapLogRow[],
): BreadthStampDto[] => {
  const counts = stampCounts(breadthOf(rows));
  const stamps: BreadthStampDto[] = [];
  for (const kind of BREADTH_STAMP_KINDS) {
    const tier = stampTier(kind, counts[kind]);
    if (tier !== null) stamps.push({ kind, count: counts[kind], tier });
  }
  return stamps;
};

const card = (
  kind: RecapCardDto["kind"],
  count: number,
  fields: Partial<Omit<RecapCardDto, "kind" | "count">> = {},
): RecapCardDto => ({
  kind,
  count,
  newCount: fields.newCount ?? null,
  chips: fields.chips ?? [],
  itemTypes: fields.itemTypes ?? [],
  stamp: fields.stamp ?? null,
});

/**
 * The deck for one period: `rows` is the viewer's history up to the period's
 * end, each flagged `inPeriod`.
 */
export const selectRecapCards = (
  rows: readonly RecapLogRow[],
): RecapCardDto[] => {
  const before = breadthOf(rows.filter((row) => !row.inPeriod));
  const periodRows = rows.filter((row) => row.inPeriod);
  const during = breadthOf(periodRows);
  const cards: RecapCardDto[] = [];

  const newItems = during.items.keys().filter((key) => !before.items.has(key));
  if (newItems.length >= RECAP_CARD_THRESHOLDS.NEW_TO_YOU) {
    cards.push(
      card("NEW_TO_YOU", newItems.length, {
        chips: chipsOf(during.items, newItems),
      }),
    );
  }

  const newOf = (set: Distinct, prior: Distinct) =>
    set.keys().filter((key) => !prior.has(key));

  if (during.types.size >= RECAP_CARD_THRESHOLDS.TYPES) {
    cards.push(
      card("TYPES", during.types.size, {
        newCount: newOf(during.types, before.types).length,
        chips: chipsOf(during.types, during.types.keys()),
        itemTypes: during.types.keys() as ItemType[],
      }),
    );
  }
  if (during.styles.size >= RECAP_CARD_THRESHOLDS.STYLES) {
    cards.push(
      card("STYLES", during.styles.size, {
        newCount: newOf(during.styles, before.styles).length,
        chips: chipsOf(during.styles, during.styles.keys()),
      }),
    );
  }
  if (during.regions.size >= RECAP_CARD_THRESHOLDS.REGIONS) {
    cards.push(
      card("REGIONS", during.regions.size, {
        newCount: newOf(during.regions, before.regions).length,
        chips: chipsOf(during.regions, during.regions.keys()),
      }),
    );
  }
  if (during.recipes.size >= RECAP_CARD_THRESHOLDS.RECIPES) {
    cards.push(
      card("RECIPES", during.recipes.size, {
        chips: chipsOf(during.recipes, during.recipes.keys()),
      }),
    );
  }

  // Top rated: distinct items scored this period, best first.
  const best = new Map<string, { name: string | null; score: number }>();
  for (const row of periodRows) {
    if (row.itemType === null || row.itemId === null || row.score === null) {
      continue;
    }
    const key = `${row.itemType}:${row.itemId}`;
    const prior = best.get(key);
    if (prior === undefined || row.score > prior.score) {
      best.set(key, { name: row.name, score: row.score });
    }
  }
  if (best.size >= RECAP_CARD_THRESHOLDS.TOP_RATED) {
    const ranked = [...best.values()].sort((a, b) => b.score - a.score);
    cards.push(
      card("TOP_RATED", best.size, {
        chips: ranked
          .flatMap((entry) => (entry.name === null ? [] : [entry.name]))
          .slice(0, RECAP_CARD_CHIP_LIMIT),
      }),
    );
  }

  // A stamp card for each tier crossed inside the period.
  const priorCounts = stampCounts(before);
  const endCounts = stampCounts(breadthOf(rows));
  for (const kind of BREADTH_STAMP_KINDS) {
    const endTier = stampTier(kind, endCounts[kind]);
    if (endTier === null) continue;
    if (endTier === stampTier(kind, priorCounts[kind])) continue;
    cards.push(
      card("STAMP", endCounts[kind], {
        stamp: { kind, count: endCounts[kind], tier: endTier },
      }),
    );
  }
  return cards;
};
