/**
 * The compare screen's words and rows (Social-Friends 09, 10; MC-compare,
 * L11), from the server's counts and rows. Pure, so the copy is tested
 * without rendering. Agreement is a count, never a percentage, and "agree"
 * means within half a star — the server's own rule for `agreed`.
 */
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import { itemHref } from "@/components/item-api/itemTypes";
import { formatVintage } from "@/utilities";
import { displayItemName } from "@/utilities/smart-title-case";
import type { AgreementCounts } from "../taste-lines";

/** CROSS-LOT's kind order (the owner's volume); kinds with none hidden. */
export const COMPARE_KIND_ORDER: readonly ApiItemType[] = [
  "BEER",
  "WINE",
  "SPIRIT",
  "COFFEE",
  "TEA",
  "SAKE",
];

const KIND_LABEL: Readonly<Record<ApiItemType, string>> = {
  BEER: "Beer",
  WINE: "Wine",
  SPIRIT: "Spirit",
  COFFEE: "Coffee",
  TEA: "Tea",
  SAKE: "Sake",
};

const DRINKS: Readonly<Record<ApiItemType, [string, string]>> = {
  BEER: ["beer", "beers"],
  WINE: ["wine", "wines"],
  SPIRIT: ["spirit", "spirits"],
  COFFEE: ["coffee", "coffees"],
  TEA: ["tea", "teas"],
  SAKE: ["sake", "sakes"],
};

const drinks = (kind: ApiItemType | null, count: number): string => {
  if (kind === null) return count === 1 ? "drink" : "drinks";
  const [one, many] = DRINKS[kind];
  return count === 1 ? one : many;
};

export type KindCell = { value: ApiItemType; label: string; count: number };

/** The kind chips after "All": one per kind you both rated, in kit order. */
export const compareKinds = (counts: AgreementCounts): KindCell[] =>
  COMPARE_KIND_ORDER.flatMap((kind) => {
    const row = counts.byType.find((entry) => entry.itemType === kind);
    return row === undefined || row.shared === 0
      ? []
      : [{ value: kind, label: KIND_LABEL[kind], count: row.shared }];
  });

export type CompareTile = {
  /** The big number, or null below the server's gate. */
  agreed: number | null;
  shared: number;
  /** "shared drinks agree, within half a star". */
  line: string;
};

/** The "12 of 13" tile, for all kinds or one. */
export const compareTile = (
  counts: AgreementCounts,
  kind: ApiItemType | null,
): CompareTile => {
  const row =
    kind === null
      ? counts
      : (counts.byType.find((entry) => entry.itemType === kind) ?? {
          shared: 0,
          agreed: null,
        });
  if (row.agreed === null) {
    return {
      agreed: null,
      shared: row.shared,
      line: `Not enough ${drinks(kind, 2)} in common yet`,
    };
  }
  return {
    agreed: row.agreed,
    shared: row.shared,
    line: `shared ${drinks(kind, row.shared)} agree, within half a star`,
  };
};

/** The profile's agreement card: its two lines and its bar. */
export const agreementCard = (
  counts: AgreementCounts,
): { title: string; line: string; segments: number; filled: number } => {
  if (counts.agreed === null || counts.shared === 0) {
    return {
      title: "Not enough in common yet",
      line: `${counts.shared} shared ${drinks(null, counts.shared)}`,
      segments: 0,
      filled: 0,
    };
  }
  const segments = Math.min(counts.shared, 20);
  return {
    title: `You agree on ${counts.agreed} of ${counts.shared}`,
    line: `shared ${drinks(null, counts.shared)}, within half a star`,
    segments,
    filled: Math.round((counts.agreed / counts.shared) * segments),
  };
};

export type CompareRowNode = {
  readonly myScore: number;
  readonly theirScore: number;
  readonly item:
    | {
        readonly __typename: string;
        readonly id: string;
        readonly type: string;
        readonly name: string;
        readonly vintage?: unknown;
        readonly vintageYear?: number | null;
      }
    | null
    | undefined;
};

export type CompareRow = {
  readonly id: string;
  readonly title: string;
  readonly href: string;
  readonly itemType: ApiItemType | null;
  readonly mine: number;
  readonly theirs: number;
  /** "1.0 apart" when you disagree (more than half a star); else null. */
  readonly apart: string | null;
};

const isKind = (value: string): value is ApiItemType =>
  (COMPARE_KIND_ORDER as readonly string[]).includes(value);

/** One server row → what the row draws; null for an item that is gone. */
export const compareRow = (node: CompareRowNode): CompareRow | null => {
  const item = node.item;
  if (item === null || item === undefined) return null;
  const vintage =
    item.__typename === "Wine"
      ? formatVintage(item.vintage as string | null | undefined)
      : item.__typename === "Sake"
        ? formatVintage(item.vintageYear ?? undefined)
        : undefined;
  const name = displayItemName(item.name);
  const gap = Math.abs(node.myScore - node.theirScore);
  return {
    id: item.id,
    title: vintage === undefined ? name : `${vintage} ${name}`,
    href: itemHref(item.type, item.id),
    itemType: isKind(item.type) ? item.type : null,
    mine: node.myScore,
    theirs: node.theirScore,
    apart: gap > 0.5 ? `${gap.toFixed(1)} apart` : null,
  };
};

/** "Maya" from "Maya Chen": the column head and the screen's title. */
export const firstName = (name: string): string =>
  name.trim().split(/\s+/)[0] ?? name;
