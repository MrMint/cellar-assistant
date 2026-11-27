/**
 * `82450ad1:src/components/tier-list/constants.ts`, restored. The band tables
 * it re-exported from `@cellar-assistant/shared/constants/bands` (a package
 * that no longer exists) are inlined; the colours are the design tokens now
 * (design-direction.md §3.1: one claret → brass → ash ramp, Unrated on
 * surface-3, the band word always printed beside the hue).
 */
export const BANDS = [5, 4, 3, 2, 1, 0] as const;
export type Band = (typeof BANDS)[number];

export const BAND_LABELS: Record<number, string> = {
  5: "Outstanding",
  4: "Very Good",
  3: "Good",
  2: "Mediocre",
  1: "Bad",
  0: "Unrated",
};

/**
 * Each band's token as a CSS colour, for what takes a colour value rather
 * than a class: a chart's SVG `fill`, an inline swatch. MapLibre paint cannot
 * read a variable; it reads `bandColor` from `lib/tokens.ts` instead.
 *
 * Unrated is a mark here, not a surface: `surface-3` on a `surface-1`
 * section is about 1.2:1, so its bar all but vanished from the histogram.
 * Half-strength ink-3 stays the quietest bar and still reads as one.
 */
export const BAND_COLORS: Record<number, string> = {
  5: "var(--ca-band-5)",
  4: "var(--ca-band-4)",
  3: "var(--ca-band-3)",
  2: "var(--ca-band-2)",
  1: "var(--ca-band-1)",
  0: "color-mix(in oklab, var(--ca-ink-3) 50%, transparent)",
};

/**
 * Each band's token as Tailwind classes, spelled out whole so Tailwind sees
 * them: `rule` (a 3 px edge), `tint` (a wash behind the band word), `swatch`
 * (a solid chip), `divider` (the line under a band on the board).
 */
export const BAND_TONES: Record<
  number,
  { rule: string; tint: string; swatch: string; divider: string }
> = {
  5: {
    rule: "border-band-5",
    tint: "bg-band-5/20",
    swatch: "bg-band-5",
    divider: "border-band-5/40",
  },
  4: {
    rule: "border-band-4",
    tint: "bg-band-4/20",
    swatch: "bg-band-4",
    divider: "border-band-4/40",
  },
  3: {
    rule: "border-band-3",
    tint: "bg-band-3/20",
    swatch: "bg-band-3",
    divider: "border-band-3/40",
  },
  2: {
    rule: "border-band-2",
    tint: "bg-band-2/20",
    swatch: "bg-band-2",
    divider: "border-band-2/40",
  },
  1: {
    rule: "border-band-1",
    tint: "bg-band-1/20",
    swatch: "bg-band-1",
    divider: "border-band-1/40",
  },
  0: {
    rule: "border-surface-3",
    tint: "bg-surface-3/60",
    swatch: "bg-surface-3",
    divider: "border-line",
  },
};

/** Entity types that can be added to a tier list (matches tier_lists.list_type). */
export type TierListEntityType =
  | "place"
  | "wine"
  | "beer"
  | "spirit"
  | "coffee"
  | "sake"
  | "tea";

export const TIER_LIST_ENTITY_TYPES: readonly TierListEntityType[] = [
  "place",
  "wine",
  "beer",
  "spirit",
  "coffee",
  "sake",
  "tea",
];

const ENTRY_NOUNS: Record<TierListEntityType, readonly [string, string]> = {
  place: ["place", "places"],
  wine: ["wine", "wines"],
  beer: ["beer", "beers"],
  spirit: ["spirit", "spirits"],
  coffee: ["coffee", "coffees"],
  sake: ["sake", "sakes"],
  tea: ["tea", "teas"],
};

/**
 * What a list's entries are called, by its type and how many: "1 place",
 * "113 places", "2 wines" (the board's header and band counts). An unknown
 * type reads "entry".
 */
export function entryNoun(listType: string, count: number): string {
  const nouns = ENTRY_NOUNS[listType as TierListEntityType] ?? [
    "entry",
    "entries",
  ];
  return count === 1 ? nouns[0] : nouns[1];
}
