/**
 * `Cellar.itemCounts` → the old `CellarItemsFilter` `counts` prop.
 *
 * The old filter took `{ beers, wines, … }` straight from six Hasura
 * `items_aggregate(where: { empty_at: { _is_null: true }, type })` aliases.
 * API wave A's `Cellar.itemCounts: ItemTypeCounts` (G1) counts the same thing
 * — non-empty bottles per type, decision 4 — under singular keys. A caller
 * that has not selected it passes nothing, and the filter renders icons
 * without numbers, which is the old filter's own behaviour for a missing count.
 */

export type CellarItemsFilterCounts = {
  beers?: number;
  wines?: number;
  spirits?: number;
  coffees?: number;
  sakes?: number;
  teas?: number;
};

/** The `ItemTypeCounts` fields the filter shows; `total` is not one of them. */
export type ItemTypeCountsSource = {
  beer?: number | null;
  wine?: number | null;
  spirit?: number | null;
  coffee?: number | null;
  sake?: number | null;
  tea?: number | null;
};

const KEYS = [
  ["beer", "beers"],
  ["wine", "wines"],
  ["spirit", "spirits"],
  ["coffee", "coffees"],
  ["sake", "sakes"],
  ["tea", "teas"],
] as const satisfies readonly (readonly [
  keyof ItemTypeCountsSource,
  keyof CellarItemsFilterCounts,
])[];

/**
 * Singular API keys → the old plural ones. A count that is absent or null is
 * left absent (no number shown) rather than turned into a `0`: only the API
 * saying "none" is worth a zero.
 */
export const filterCountsFromItemCounts = (
  itemCounts: ItemTypeCountsSource | null | undefined,
): CellarItemsFilterCounts => {
  const counts: CellarItemsFilterCounts = {};
  if (itemCounts === null || itemCounts === undefined) return counts;
  for (const [from, to] of KEYS) {
    const value = itemCounts[from];
    if (typeof value === "number") counts[to] = value;
  }
  return counts;
};
