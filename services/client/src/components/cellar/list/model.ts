/**
 * The cellar list's model (C1; boards combined/Cellar-flow and
 * areas/Cellars-Shelves): what one tile shows, the arrangements of the
 * Arrange sheet, the kind and Open filters with their counts, the letters of
 * "Jump to a letter", and the shelves. Pure, so every rule here is tested
 * without a page.
 *
 * The list holds the whole cellar (the server page reads every page), so
 * every arrangement is a sort or a grouping of the same bottles: the API
 * sorts by none of maker, style or the owner's rating.
 */

import {
  type ApiItemType,
  ITEM_TYPES,
  itemTypeLabel,
} from "@/components/cellar-api/itemTypes";
import type { LabelPlateData } from "@/lib/items/label-plate";

/** One tile: a bottle group (identical bottles are one tile with ×N). */
export type ListBottle = {
  /** The lead bottle's id: the tile's key and its page. */
  key: string;
  itemId: string;
  type: ApiItemType;
  name: string;
  maker: string | null;
  style: string | null;
  photoUrl: string | null;
  plate: LabelPlateData | null;
  /** The owner's own rating, or null when not rated. */
  rating: number | null;
  publicScore: number | null;
  publicCount: number | null;
  favorite: boolean;
  /** The lead bottle is open (not sealed, not finished). */
  open: boolean;
  /** What is left of the lead bottle, 0 to 100. */
  percent: number;
  /** ×N: how many identical bottles the tile stands for. */
  count: number;
  /** How a search found it: by name, or by meaning ("Similar"). */
  match: "NAME" | "MEANING" | null;
  /** The owner's note, as words, for the wide tile. */
  note: string | null;
  noteDate: string | null;
  addedAt: string | null;
  href: string;
};

/* ------------------------------------------------------------------ */
/* Arrangements                                                        */
/* ------------------------------------------------------------------ */

export const ARRANGEMENTS = [
  { value: "a-z", label: "Name, A to Z", short: "A–Z", group: "order" },
  { value: "maker", label: "By maker", short: "Maker", group: "order" },
  { value: "style", label: "By style", short: "Style", group: "order" },
  { value: "shelves", label: "Shelves", short: "Shelves", group: "order" },
  { value: "newest", label: "Newest first", short: "Newest", group: "sort" },
  {
    value: "rating",
    label: "My rating, best first",
    short: "Top rated",
    group: "sort",
  },
  {
    value: "unrated",
    label: "Not rated yet first",
    short: "Unrated",
    group: "sort",
  },
  {
    value: "least-left",
    label: "Least left first",
    short: "Least left",
    group: "sort",
  },
] as const;

export type Arrangement = (typeof ARRANGEMENTS)[number]["value"];
export const DEFAULT_ARRANGEMENT: Arrangement = "a-z";

/**
 * A `?sort=` value → an arrangement. The old sort chip's values still land
 * somewhere sensible ("recent" was Recently added, "almost-empty" Almost
 * empty); "open" (Open first) becomes the default, with Open a filter now.
 */
export const parseArrangement = (
  value: string | null | undefined,
): Arrangement => {
  if (value === "recent") return "newest";
  if (value === "almost-empty") return "least-left";
  return (
    ARRANGEMENTS.find((entry) => entry.value === value)?.value ??
    DEFAULT_ARRANGEMENT
  );
};

export const arrangementOf = (value: Arrangement) =>
  ARRANGEMENTS.find((entry) => entry.value === value) ?? ARRANGEMENTS[0];

const collator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});

const byName = (a: ListBottle, b: ListBottle): number =>
  collator.compare(a.name, b.name) || a.key.localeCompare(b.key);

const time = (iso: string | null): number => {
  if (iso === null) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/** One run of tiles under an optional header (a maker, a style). */
export type ListSection = {
  key: string;
  /** The header; absent for a plain sorted list. */
  title?: string;
  count: number;
  /** The owner's average rating over the rated bottles in it. */
  average: number | null;
  bottles: readonly ListBottle[];
};

/** The owner's average over the rated ones, or null when none is rated. */
export const averageRating = (
  bottles: readonly ListBottle[],
): number | null => {
  const rated = bottles.filter((b) => b.rating !== null);
  if (rated.length === 0) return null;
  const sum = rated.reduce((total, b) => total + (b.rating ?? 0), 0);
  return Math.round((sum / rated.length) * 10) / 10;
};

/** The bottles in one sort order (the sort arrangements, and A–Z). */
export const sortBottles = (
  bottles: readonly ListBottle[],
  arrangement: Arrangement,
): ListBottle[] => {
  const list = [...bottles];
  switch (arrangement) {
    case "newest":
      return list.sort(
        (a, b) => time(b.addedAt) - time(a.addedAt) || byName(a, b),
      );
    case "rating":
      return list.sort(
        (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || byName(a, b),
      );
    case "unrated":
      return list.sort(
        (a, b) =>
          Number(a.rating !== null) - Number(b.rating !== null) || byName(a, b),
      );
    case "least-left":
      return list.sort((a, b) => a.percent - b.percent || byName(a, b));
    default:
      return list.sort(byName);
  }
};

/** The name "Others" collects groups of one (Shelves ruling 3). */
export const OTHERS = "Others";

/**
 * Groups by a key (maker or style): groups A to Z by their name, each sorted
 * by name; groups of one drink, and bottles with no key, join "Others" at
 * the end (Shelves ruling 3).
 */
const groupBy = (
  bottles: readonly ListBottle[],
  keyOf: (bottle: ListBottle) => string | null,
): ListSection[] => {
  const groups = new Map<string, ListBottle[]>();
  const others: ListBottle[] = [];
  for (const bottle of bottles) {
    const key = keyOf(bottle)?.trim() ?? "";
    if (key === "") {
      others.push(bottle);
      continue;
    }
    const found =
      Array.from(groups.keys()).find(
        (name) => collator.compare(name, key) === 0,
      ) ?? key;
    groups.set(found, [...(groups.get(found) ?? []), bottle]);
  }
  const sections: ListSection[] = [];
  for (const [title, members] of Array.from(groups.entries()).sort(([a], [b]) =>
    collator.compare(a, b),
  )) {
    if (members.length < 2) {
      others.push(...members);
      continue;
    }
    const sorted = members.sort(byName);
    sections.push({
      key: `g:${title}`,
      title,
      count: sorted.length,
      average: averageRating(sorted),
      bottles: sorted,
    });
  }
  if (others.length > 0) {
    const sorted = others.sort(byName);
    sections.push({
      key: "g:\0others",
      title: OTHERS,
      count: sorted.length,
      average: averageRating(sorted),
      bottles: sorted,
    });
  }
  return sections;
};

/**
 * The list as the arrangement draws it: one untitled section for a sort,
 * one section per maker or style for a grouping. Shelves are drawn by
 * `shelvesOf`; here they fall back to A–Z.
 */
export const arrange = (
  bottles: readonly ListBottle[],
  arrangement: Arrangement,
): ListSection[] => {
  if (arrangement === "maker") return groupBy(bottles, (b) => b.maker);
  if (arrangement === "style") return groupBy(bottles, (b) => b.style);
  if (bottles.length === 0) return [];
  const sorted = sortBottles(bottles, arrangement);
  return [
    {
      key: "all",
      count: sorted.length,
      average: averageRating(sorted),
      bottles: sorted,
    },
  ];
};

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

/** The count strip's value: a kind, Open, or nothing. */
export type ListFilter = ApiItemType | "OPEN" | null;

export const parseListFilter = (
  types: readonly string[],
  open: string | null | undefined,
): ListFilter => {
  if (open === "1") return "OPEN";
  const type = types.find((t): t is ApiItemType =>
    (ITEM_TYPES as readonly string[]).includes(t),
  );
  return type ?? null;
};

export const filterBottles = (
  bottles: readonly ListBottle[],
  filter: ListFilter,
): readonly ListBottle[] => {
  if (filter === null) return bottles;
  if (filter === "OPEN") return bottles.filter((b) => b.open);
  return bottles.filter((b) => b.type === filter);
};

/**
 * The kinds in the owner's order (amendments: Beer, Wine, Spirit, Coffee,
 * Tea, Sake); a kind with none is hidden by the strip.
 */
export const KIND_ORDER: readonly ApiItemType[] = [
  "BEER",
  "WINE",
  "SPIRIT",
  "COFFEE",
  "TEA",
  "SAKE",
];

/**
 * The strip's cells: Open, then each kind, counted over the bottles shown
 * (a search's matches, not the whole cellar: Shelves ruling 3). Bottles,
 * not tiles: a ×2 tile counts two.
 */
export const stripCounts = (
  bottles: readonly ListBottle[],
): {
  open: { value: "OPEN"; label: string; count: number };
  kinds: { value: ApiItemType; label: string; count: number }[];
} => ({
  open: {
    value: "OPEN",
    label: "Open",
    count: bottles.filter((b) => b.open).length,
  },
  kinds: KIND_ORDER.map((type) => ({
    value: type,
    label: itemTypeLabel(type),
    count: bottles
      .filter((b) => b.type === type)
      .reduce((total, b) => total + b.count, 0),
  })),
});

/** Bottles, not tiles: what "240 bottles" counts. */
export const bottleTotal = (bottles: readonly ListBottle[]): number =>
  bottles.reduce((total, b) => total + b.count, 0);

/* ------------------------------------------------------------------ */
/* Jump to a letter                                                    */
/* ------------------------------------------------------------------ */

/** A name's letter: A to Z without accents, "#" for anything else. */
export const letterOf = (name: string): string => {
  const first = name
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .charAt(0)
    .toUpperCase();
  return first >= "A" && first <= "Z" ? first : "#";
};

/** The letters present, in order, with how many tiles each holds. */
export const lettersOf = (
  bottles: readonly ListBottle[],
): { letter: string; count: number; firstKey: string }[] => {
  const found = new Map<string, { count: number; firstKey: string }>();
  for (const bottle of sortBottles(bottles, "a-z")) {
    const letter = letterOf(bottle.name);
    const entry = found.get(letter);
    if (entry === undefined) {
      found.set(letter, { count: 1, firstKey: bottle.key });
    } else {
      entry.count += 1;
    }
  }
  return Array.from(found.entries())
    .sort(([a], [b]) => (a === "#" ? -1 : b === "#" ? 1 : a.localeCompare(b)))
    .map(([letter, entry]) => ({ letter, ...entry }));
};

/* ------------------------------------------------------------------ */
/* Shelves                                                             */
/* ------------------------------------------------------------------ */

/** How many tiles a shelf shows before "See all". */
export const SHELF_SIZE = 12;

export type Shelf = {
  key: "open" | "best" | "unrated" | "newest";
  title: string;
  /** How many in all, not how many the shelf shows. */
  count: number;
  bottles: readonly ListBottle[];
  /** What "See all" turns on. */
  seeAll: { arrangement: Arrangement; filter: ListFilter };
};

/** The owner's best: rated 4 and up. */
export const BEST_FROM = 4;

/**
 * Shelves (combined-18): Open now, Your best, Not rated yet, Newest. An
 * empty shelf is left out.
 */
export const shelvesOf = (bottles: readonly ListBottle[]): Shelf[] => {
  const open = sortBottles(
    bottles.filter((b) => b.open),
    "least-left",
  );
  const best = sortBottles(
    bottles.filter((b) => (b.rating ?? 0) >= BEST_FROM),
    "rating",
  );
  const unrated = sortBottles(
    bottles.filter((b) => b.rating === null),
    "newest",
  );
  const newest = sortBottles(bottles, "newest");
  const shelves: Shelf[] = [
    {
      key: "open",
      title: "Open now",
      count: open.length,
      bottles: open.slice(0, SHELF_SIZE),
      seeAll: { arrangement: "least-left", filter: "OPEN" },
    },
    {
      key: "best",
      title: "Your best",
      count: best.length,
      bottles: best.slice(0, SHELF_SIZE),
      seeAll: { arrangement: "rating", filter: null },
    },
    {
      key: "unrated",
      title: "Not rated yet",
      count: unrated.length,
      bottles: unrated.slice(0, SHELF_SIZE),
      seeAll: { arrangement: "unrated", filter: null },
    },
    {
      key: "newest",
      title: "Newest",
      count: newest.length,
      bottles: newest.slice(0, SHELF_SIZE),
      seeAll: { arrangement: "newest", filter: null },
    },
  ];
  return shelves.filter((shelf) => shelf.count > 0);
};

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

const COUNT = new Intl.NumberFormat("en-US");

/**
 * "240 bottles", "1 bottle", "Empty" (lot-cellars-shelves shelf-empty), or
 * "2,000+ bottles" when the read was capped.
 */
export const bottlesLabel = (count: number, capped = false): string => {
  if (count === 0 && !capped) return "Empty";
  const noun = count === 1 && !capped ? "bottle" : "bottles";
  return `${COUNT.format(count)}${capped ? "+" : ""} ${noun}`;
};

/** The badge on an open bottle's photo: "Open · 16%". */
export const openBadge = (bottle: ListBottle): string | null =>
  bottle.open ? `Open · ${Math.round(bottle.percent)}%` : null;

/** The Needs-details link's words (CROSS-LOT: drafts are "Needs details"). */
export const needsDetailsLabel = (count: number): string =>
  `${COUNT.format(count)} ${count === 1 ? "needs" : "need"} details`;

/** The empty search's title, in the kit's words. */
export const noMatchTitle = (search: string): string =>
  `No bottle matches “${search.trim()}”`;

const DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** The wide tile's date: "Nov 21, 2023"; undefined when unreadable. */
export const noteDateLabel = (iso: string | null): string | undefined => {
  if (iso === null) return undefined;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? undefined : DAY.format(t);
};

/** A group's average, one decimal: "4.1". */
export const formatAverage = (value: number): string => value.toFixed(1);
