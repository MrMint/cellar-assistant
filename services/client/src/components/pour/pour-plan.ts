/**
 * The Pour sheet's rules (X03), as pure functions — so the level the bottle
 * shows, what a glass takes out of it, and what each write and its Undo send
 * are unit tests rather than taps.
 *
 * A pour is three things in one thumb-zone action: open the bottle (on its
 * first pour), log the drink (X02's `logDrink`, with the bottle), and set the
 * level. The writes are two calls — `logDrink`, then one `updateCellarItem`
 * carrying the level and, for a sealed bottle, `openAt` (the pour's own time,
 * so a backdated first pour opens the bottle when it was poured). Undo is the
 * mirror: `deleteDrinkLog` on the id the sheet minted, then the level (and a
 * sealed bottle's `openAt: null`) put back.
 */
import type { ApiItemType } from "@/components/cellar-api/itemTypes";

/* -------------------------------------------------------------------------- */
/* Glass presets                                                               */
/* -------------------------------------------------------------------------- */

/**
 * What a "bottle" means for each type, for turning a glass into a share of
 * it. The app does not record a bottle's size, so these are the common ones,
 * and the sheet says which it assumed ("of a 750 ml bottle").
 */
export const CONTAINER: Readonly<
  Record<ApiItemType, { readonly amount: number; readonly unit: "ml" | "g" }>
> = {
  WINE: { amount: 750, unit: "ml" },
  BEER: { amount: 355, unit: "ml" },
  SPIRIT: { amount: 700, unit: "ml" },
  SAKE: { amount: 720, unit: "ml" },
  COFFEE: { amount: 340, unit: "g" },
  TEA: { amount: 100, unit: "g" },
};

/** What the container is called in "of a 750 ml bottle". */
const CONTAINER_NOUN: Readonly<Record<ApiItemType, string>> = {
  WINE: "bottle",
  BEER: "bottle",
  SPIRIT: "bottle",
  SAKE: "bottle",
  COFFEE: "bag",
  TEA: "tin",
};

export type GlassPreset = {
  /** Stable key, for `aria-pressed` and tests. */
  readonly id: string;
  /** "Glass" — the word on the chip. */
  readonly label: string;
  /** In the container's unit. */
  readonly amount: number;
};

/**
 * Three pours per type, smallest first — a pour of wine is about 150 ml, of
 * a spirit a 45 ml measure, of sake a 60 ml ochoko; coffee and tea are
 * measured in grams of beans or leaf.
 */
export const GLASS_PRESETS: Readonly<
  Record<ApiItemType, readonly GlassPreset[]>
> = {
  WINE: [
    { id: "taste", label: "Taste", amount: 75 },
    { id: "glass", label: "Glass", amount: 150 },
    { id: "large", label: "Large glass", amount: 250 },
  ],
  BEER: [
    { id: "taste", label: "Taste", amount: 60 },
    { id: "half", label: "Half", amount: 180 },
    { id: "glass", label: "Glass", amount: 355 },
  ],
  SPIRIT: [
    { id: "taste", label: "Taste", amount: 20 },
    { id: "glass", label: "Measure", amount: 45 },
    { id: "double", label: "Double", amount: 90 },
  ],
  SAKE: [
    { id: "taste", label: "Ochoko", amount: 60 },
    { id: "glass", label: "Glass", amount: 120 },
    { id: "tokkuri", label: "Tokkuri", amount: 180 },
  ],
  COFFEE: [
    { id: "glass", label: "Cup", amount: 18 },
    { id: "double", label: "Two cups", amount: 36 },
    { id: "pot", label: "Pot", amount: 60 },
  ],
  TEA: [
    { id: "glass", label: "Cup", amount: 3 },
    { id: "pot", label: "Pot", amount: 8 },
    { id: "large", label: "Large pot", amount: 15 },
  ],
};

/** The share of the container one preset takes, in whole percent (at least 1). */
export const presetPercent = (type: ApiItemType, preset: GlassPreset): number =>
  Math.max(1, Math.round((preset.amount / CONTAINER[type].amount) * 100));

/** "150 ml", "18 g". */
export const presetAmount = (type: ApiItemType, preset: GlassPreset): string =>
  `${preset.amount} ${CONTAINER[type].unit}`;

/** "Measured against a 750 ml bottle." */
export const containerNote = (type: ApiItemType): string =>
  `Measured against a ${CONTAINER[type].amount} ${CONTAINER[type].unit} ${CONTAINER_NOUN[type]}.`;

/** The level after pouring `preset` from `level`: never below empty. */
export const levelAfterPreset = (
  type: ApiItemType,
  level: number,
  preset: GlassPreset,
): number => Math.max(0, level - presetPercent(type, preset));

/**
 * The preset the sheet starts on: a glass (the type's middle pour) when
 * there is that much left, otherwise whatever is left — the last of it.
 */
export const defaultPour = (type: ApiItemType, level: number): number => {
  const glass = GLASS_PRESETS[type][1];
  return glass === undefined ? level : levelAfterPreset(type, level, glass);
};

/**
 * Whether the primary button can pour: the level must have moved down — or
 * the bottle reads 0% without having been finished, where the only pour is
 * the last of it.
 */
export const canPourTo = (from: number, to: number): boolean =>
  to < from || (from === 0 && to === 0);

/** Which preset (if any) a level is exactly one pour of. */
export const presetFor = (
  type: ApiItemType,
  from: number,
  to: number,
): GlassPreset | null =>
  GLASS_PRESETS[type].find(
    (preset) => levelAfterPreset(type, from, preset) === to && to > 0,
  ) ?? null;

/** "700 ml bottle", "100 g tin": the line under the level (Cellars-Pour). */
export const containerLabel = (type: ApiItemType): string =>
  `${CONTAINER[type].amount}\u202f${CONTAINER[type].unit} ${CONTAINER_NOUN[type]}`;

/**
 * How much a pour from `from` to `to` takes, in the container's unit: the
 * preset's own amount when it is exactly one, otherwise the share of the
 * container ("602 ml" for the rest of a 700 ml bottle at 86 %).
 */
export const pourAmount = (
  type: ApiItemType,
  from: number,
  to: number,
): string => {
  const preset = presetFor(type, from, to);
  if (preset !== null) return presetAmount(type, preset);
  const { amount, unit } = CONTAINER[type];
  return `${Math.max(0, Math.round(((from - to) / 100) * amount))} ${unit}`;
};

/** Tea steeps; everything else pours (Cellars-Pour ruling 6). */
export const pourVerb = (type: ApiItemType): "Pour" | "Steep" =>
  type === "TEA" ? "Steep" : "Pour";

/**
 * The levels the presets land on from `from`, and empty ("The rest"): where
 * the level's detents sit as a finger drags it.
 */
export const levelStops = (type: ApiItemType, from: number): number[] =>
  [
    ...GLASS_PRESETS[type]
      .map((preset) => levelAfterPreset(type, from, preset))
      .filter((level) => level > 0),
    0,
  ].filter((level, index, all) => all.indexOf(level) === index);

/** Whether a move from `prev` to `next` reaches or crosses a stop: a detent. */
export const crossesStop = (
  prev: number,
  next: number,
  stops: readonly number[],
): boolean =>
  prev !== next &&
  stops.some((stop) =>
    next < prev ? next <= stop && stop < prev : prev < stop && stop <= next,
  );

/* -------------------------------------------------------------------------- */
/* The level                                                                   */
/* -------------------------------------------------------------------------- */

/** A level as the API stores it: a whole percent, 0–100. */
export const clampLevel = (value: number, max = 100): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(
    Math.max(0, Math.round(value)),
    Math.max(0, Math.min(100, max)),
  );
};

/**
 * Where the liquid sits for each vessel, on `VesselSilhouette`'s 64 × 160
 * grid: `bottom` is the inside of its base, `full` the line a full one is
 * filled to (the shoulder, below the neck — nobody pours from the neck).
 */
export const LIQUID_BOUNDS: Readonly<
  Record<ApiItemType, { readonly full: number; readonly bottom: number }>
> = {
  WINE: { full: 58, bottom: 156 },
  BEER: { full: 54, bottom: 156 },
  SPIRIT: { full: 34, bottom: 156 },
  SAKE: { full: 40, bottom: 156 },
  COFFEE: { full: 26, bottom: 156 },
  TEA: { full: 36, bottom: 156 },
};

/** The liquid's top edge, in vessel units, for a level. */
export const liquidTop = (type: ApiItemType, level: number): number => {
  const { full, bottom } = LIQUID_BOUNDS[type];
  return bottom - ((bottom - full) * clampLevel(level)) / 100;
};

/**
 * The level a finger at `clientY` asks for, over a vessel drawn in `rect`:
 * the inverse of {@link liquidTop}, clamped to what was in the bottle
 * (`max`) — a pour only takes away.
 */
export const levelAtPointer = (
  type: ApiItemType,
  clientY: number,
  rect: { readonly top: number; readonly height: number },
  max: number,
): number => {
  if (rect.height <= 0) return clampLevel(max, max);
  const { full, bottom } = LIQUID_BOUNDS[type];
  const y = ((clientY - rect.top) / rect.height) * 160;
  return clampLevel(((bottom - y) / (bottom - full)) * 100, max);
};

/** The keyboard on the level: arrows by 1, Page keys by 10, Home empty, End back to where it was. */
export const levelForKey = (
  key: string,
  level: number,
  max: number,
  shift = false,
): number | null => {
  const step = shift ? 10 : 1;
  switch (key) {
    case "ArrowDown":
    case "ArrowLeft":
      return clampLevel(level - step, max);
    case "ArrowUp":
    case "ArrowRight":
      return clampLevel(level + step, max);
    case "PageDown":
      return clampLevel(level - 10, max);
    case "PageUp":
      return clampLevel(level + 10, max);
    case "Home":
      return 0;
    case "End":
      return clampLevel(max, max);
    default:
      return null;
  }
};

/** "40% left · pouring 20%" — the level's spoken value. */
export const levelValueText = (from: number, to: number): string =>
  to === from
    ? `${to}% left, nothing poured yet`
    : to === 0
      ? "Empty — pouring the last of it"
      : `${to}% left, pouring ${from - to}%`;

/* -------------------------------------------------------------------------- */
/* What the writes send                                                        */
/* -------------------------------------------------------------------------- */

/** The bottle as the sheet found it — what Undo puts back. */
export type BottleBefore = {
  readonly percentageRemaining: number;
  readonly openAt: string | null;
};

/**
 * The one `updateCellarItem` a pour ends with (a level above 0): the new
 * level, and for a sealed bottle `openAt` — the pour's time, so the bottle
 * reads as opened when it was. The last pour (0) is not this: it asks
 * "Finished?" first (N13a).
 */
export const pourBottleInput = (
  before: BottleBefore,
  level: number,
  drankAt: string,
): { percentageRemaining: number; openAt?: string } => ({
  percentageRemaining: clampLevel(level),
  ...(before.openAt === null ? { openAt: drankAt } : {}),
});

/** Undo's `updateCellarItem`: the level back, and a sealed bottle sealed again. */
export const undoPourBottleInput = (
  before: BottleBefore,
): { percentageRemaining: number; openAt?: null } => ({
  percentageRemaining: clampLevel(before.percentageRemaining),
  ...(before.openAt === null ? { openAt: null } : {}),
});

/**
 * "Not yet" after the last pour: the bottle is not finished, so it keeps a
 * drop — 5%, or what it had if that was less. The pour is still logged.
 */
export const NOT_YET_LEVEL = 5;
export const notYetLevel = (before: BottleBefore): number =>
  Math.max(1, Math.min(NOT_YET_LEVEL, clampLevel(before.percentageRemaining)));

/** The toast after a pour: "Poured 150 ml · 40% left", "Steeped 3 g · 97% left". */
export const pouredMessage = (
  type: ApiItemType,
  from: number,
  to: number,
): string =>
  `${type === "TEA" ? "Steeped" : "Poured"} ${pourAmount(type, from, to)} · ${to}% left`;

/** The primary button: "Pour 45 ml", "Steep 3 g", "Pour the last of it". */
export const pourLabel = (
  type: ApiItemType,
  from: number,
  to: number,
): string => {
  const verb = pourVerb(type);
  // An empty bottle that was never finished (0% left) can still be poured:
  // that is the last of it, and it asks "Finished?".
  if (to === 0) return `${verb} the last of it`;
  if (to >= from) return verb;
  return `${verb} ${pourAmount(type, from, to)}`;
};

/* -------------------------------------------------------------------------- */
/* Who with: "Just me" / "me + Sam"                                            */
/* -------------------------------------------------------------------------- */

export type Companion = {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
};

/** "me + Sam", "me + Sam and Ana", "me + Sam, Ana and 2 others". */
export const meAndLabel = (companions: readonly Companion[]): string => {
  const names = companions.map((companion) => companion.displayName);
  if (names.length === 0) return "Just me";
  if (names.length === 1) return `me + ${names[0]}`;
  if (names.length === 2) return `me + ${names[0]} and ${names[1]}`;
  const rest = names.length - 2;
  return `me + ${names[0]}, ${names[1]} and ${rest} ${rest === 1 ? "other" : "others"}`;
};

/**
 * The remembered "who with" (the last set poured with), kept to friends who
 * are still friends when that list is known. `null` friends = not known yet:
 * trust the memory, the server refuses a non-friend anyway.
 */
export const rememberedCompanions = (
  remembered: readonly Companion[],
  friends: readonly { readonly id: string }[] | null,
): Companion[] =>
  friends === null
    ? [...remembered]
    : remembered.filter((companion) =>
        friends.some((friend) => friend.id === companion.id),
      );

/** Parse what `localStorage` holds; anything malformed is nothing. */
export const parseCompanions = (raw: string | null): Companion[] => {
  if (raw === null) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (entry): entry is Companion =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as Companion).id === "string" &&
          typeof (entry as Companion).displayName === "string",
      )
      .slice(0, 8)
      .map((entry) => ({
        id: entry.id,
        displayName: entry.displayName,
        avatarUrl: typeof entry.avatarUrl === "string" ? entry.avatarUrl : null,
      }));
  } catch {
    return [];
  }
};

/* -------------------------------------------------------------------------- */
/* After the last pour: rate, then a band from that rating                     */
/* -------------------------------------------------------------------------- */

/** One of your tier lists this item is on, as the band step shows it. */
export type ListPlacement = {
  /** The `tier_list_items` row. */
  readonly entryId: string;
  readonly tierListId: string;
  readonly name: string;
  readonly band: number;
};

/**
 * The lists to suggest a band on: yours only (a band is the list owner's
 * call), one row per list, in the order the API gave them (most recently
 * changed first).
 */
export const ownPlacements = (
  entries: readonly {
    readonly id: string;
    readonly band: number;
    readonly tierList: {
      readonly id: string;
      readonly name: string;
      readonly createdById: string;
    } | null;
  }[],
  viewerId: string | null,
): ListPlacement[] => {
  if (viewerId === null) return [];
  const seen = new Set<string>();
  const out: ListPlacement[] = [];
  for (const entry of entries) {
    const list = entry.tierList;
    if (list === null || list.createdById !== viewerId || seen.has(list.id)) {
      continue;
    }
    seen.add(list.id);
    out.push({
      entryId: entry.id,
      tierListId: list.id,
      name: list.name,
      band: entry.band,
    });
  }
  return out;
};

/**
 * The `seq` of the band move just made, for its toast's Undo
 * (`undoTierListEdit`'s `expectedSeq`, D4): the list's top edit, read right
 * after the move, when it is that move — a MOVE from `fromBand` to `toBand`.
 * `null` when something else is on top (another tab edited the list in
 * between), so the toast offers no Undo rather than one that would take back
 * an edit this sheet never made.
 */
export const movedEditSeq = (
  undo:
    | {
        readonly seq: number;
        readonly kind: string;
        readonly fromBand?: number | null;
        readonly toBand?: number | null;
      }
    | null
    | undefined,
  fromBand: number,
  toBand: number,
): number | null =>
  undo !== null &&
  undo !== undefined &&
  undo.kind === "MOVE" &&
  undo.fromBand === fromBand &&
  undo.toBand === toBand
    ? undo.seq
    : null;

/**
 * `reorderTierListBand`'s `orderedIds` for moving one entry into `band`:
 * the band as it is (by position), with the entry at its end — a rating
 * says which band, not where in it. `null` when it is already there.
 */
export const bandMoveOrder = (
  items: readonly {
    readonly id: string;
    readonly band: number;
    readonly position: number;
  }[],
  entryId: string,
  band: number,
): string[] | null => {
  const current = items.find((item) => item.id === entryId);
  if (current !== undefined && current.band === band) return null;
  return [
    ...items
      .filter((item) => item.band === band && item.id !== entryId)
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((item) => item.id),
    entryId,
  ];
};

/* -------------------------------------------------------------------------- */
/* The band step: counts and ranks for F2b's BandSheet                         */
/* -------------------------------------------------------------------------- */

type RankedEntry = {
  readonly id: string;
  readonly band: number;
  readonly position: number;
};

/** A list's order: best band first, then position. */
const listOrder = (items: readonly RankedEntry[]): RankedEntry[] =>
  items
    .slice()
    .sort((a, b) => b.band - a.band || a.position - b.position)
    .filter((item) => item.band > 0);

/** How many sit in each band (1–5). */
export const bandCounts = (
  items: readonly RankedEntry[],
): Partial<Record<1 | 2 | 3 | 4 | 5, number>> => {
  const counts: Partial<Record<1 | 2 | 3 | 4 | 5, number>> = {};
  for (const item of items) {
    if (item.band >= 1 && item.band <= 5) {
      const band = item.band as 1 | 2 | 3 | 4 | 5;
      counts[band] = (counts[band] ?? 0) + 1;
    }
  }
  return counts;
};

/** "#4": where an entry sits on its list, or null when it is not ranked. */
export const rankOf = (
  items: readonly RankedEntry[],
  entryId: string,
): number | null => {
  const at = listOrder(items).findIndex((item) => item.id === entryId);
  return at < 0 ? null : at + 1;
};

/**
 * The rank an entry lands on when a band move puts it at that band's end
 * (`bandMoveOrder`): computed once, for the toast (CROSS-LOT "one placement,
 * one rank").
 */
export const rankAfterMove = (
  items: readonly RankedEntry[],
  entryId: string,
  band: number,
): number =>
  items.filter((item) => item.id !== entryId && item.band >= band).length + 1;
