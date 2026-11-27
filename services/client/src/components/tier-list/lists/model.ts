/**
 * The lists screens' words and arithmetic (Social-Lists board), kept pure so
 * they are tested without a render.
 */

import type { Band } from "@/components/app/parts/Rank";
import { groupByBand } from "@/lib/share/tier-bands";

/** The kinds a list can hold, in the order the New list sheet offers them. */
export const LIST_KINDS = [
  { value: "place", label: "Places", one: "place", many: "places" },
  { value: "beer", label: "Beers", one: "beer", many: "beers" },
  { value: "wine", label: "Wines", one: "wine", many: "wines" },
  { value: "spirit", label: "Spirits", one: "spirit", many: "spirits" },
  { value: "coffee", label: "Coffees", one: "coffee", many: "coffees" },
  { value: "tea", label: "Teas", one: "tea", many: "teas" },
  { value: "sake", label: "Sake", one: "sake", many: "sake" },
] as const;

export type ListKind = (typeof LIST_KINDS)[number]["value"];

const kindOf = (listType: string) =>
  LIST_KINDS.find((kind) => kind.value === listType.toLowerCase());

/** "113 places", "1 tea", "2 sake". */
export const kindNoun = (listType: string, count: number): string => {
  const kind = kindOf(listType);
  const noun =
    kind === undefined
      ? count === 1
        ? "entry"
        : "entries"
      : count === 1
        ? kind.one
        : kind.many;
  return `${count} ${noun}`;
};

/** The singular noun alone: "New beer list". */
export const kindOne = (listType: string): string =>
  kindOf(listType)?.one ?? "list";

/** The most a list started from your ratings holds (`MAX_BATCH_ADD`). */
const TEMPLATE_CAP = 100;

/** The From my ratings switch's subtitle: "Best 100 of 165 beers". */
export const fromRatingsLine = (listType: string, count: number): string =>
  count > TEMPLATE_CAP
    ? `Best ${TEMPLATE_CAP} of ${kindNoun(listType, count)}`
    : kindNoun(listType, count);

export type BandStrip = {
  /** Every band, best first; a zero count draws as a stub. */
  segments: { band: Band; count: number }[];
  /** Entries the read did not reach: drawn neutral, never given a band. */
  unloaded: number;
};

/**
 * The five-band bar under a list card, from the bands the read reached. A
 * list longer than the read keeps its remainder neutral rather than guessing
 * (CROSS-LOT: never show a limit as a total). Unrated (0) is not drawn.
 */
export const bandStrip = (
  bands: readonly number[],
  itemCount: number,
): BandStrip => {
  const segments = ([5, 4, 3, 2, 1] as const).map((band) => ({
    band,
    count: bands.filter((b) => b === band).length,
  }));
  return {
    segments,
    unloaded: Math.max(0, itemCount - bands.length),
  };
};

/** The derived rank (`band desc, position asc`) of one entry, or null. */
export const rankOf = (
  entries: readonly { id: string; band: number; position: number }[],
  id: string,
): number | null =>
  groupByBand(entries)
    .flatMap((group) => group.entries)
    .find((entry) => entry.id === id)?.rank ?? null;

const MONTHS = [
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
];

/** "Sep 13" this year, "Jun 15, 2025" before it (UTC, so server = client). */
export const shortDate = (
  iso: string | null | undefined,
  now: Date = new Date(),
): string | null => {
  if (iso == null) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const day = `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
  return date.getUTCFullYear() === now.getUTCFullYear()
    ? day
    : `${day}, ${date.getUTCFullYear()}`;
};

export type Privacy = "PRIVATE" | "FRIENDS" | "PUBLIC";

export const PRIVACY_OPTIONS: readonly { value: Privacy; label: string }[] = [
  { value: "PRIVATE", label: "Only me" },
  { value: "FRIENDS", label: "Friends" },
  { value: "PUBLIC", label: "Everyone" },
];

export const asPrivacy = (value: string | null | undefined): Privacy =>
  value === "FRIENDS" || value === "PUBLIC" ? value : "PRIVATE";

/** The share sheet's subtitle: who can open the link. */
export const privacyLine = (privacy: string): string => {
  switch (asPrivacy(privacy)) {
    case "FRIENDS":
      return "Friends can open the link";
    case "PUBLIC":
      return "Anyone with the link can open it";
    default:
      return "Only you can open the link";
  }
};

/**
 * Whether this viewer may write to the list (rename, privacy, delete): its
 * maker only, and never on a missing id on either side. The server refuses
 * too; this keeps the control from being offered at all.
 */
export const canEditList = (
  viewerId: string | null | undefined,
  createdById: string | null | undefined,
): boolean =>
  typeof viewerId === "string" &&
  viewerId !== "" &&
  typeof createdById === "string" &&
  viewerId === createdById;

/** "Ranked places", "Ranked wines": a list's overline when shared. */
export const rankedKind = (listType: string): string => {
  const kind = LIST_KINDS.find((k) => k.value === listType.toLowerCase());
  return `Ranked ${kind?.many ?? "entries"}`;
};

/**
 * Where an add lands, before any read: the actor appends to the end of its
 * band (`addItem`), so the new entry's rank is one past every rated entry in
 * that band or above. Null when the bands at hand are not the whole list.
 */
export const rankOnAppend = (
  bands: readonly number[],
  itemCount: number,
  landed: number,
): number | null => {
  if (landed < 1 || bands.length < itemCount) return null;
  return bands.filter((band) => band >= landed).length + 1;
};
