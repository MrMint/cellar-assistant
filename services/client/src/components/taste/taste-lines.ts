/**
 * L03's words, from the server's counts. Pure, so the copy is tested without
 * rendering: agreement is always a count ("7 of 9 shared wines"), never a
 * percentage, and below the server's gate (`agreed` null) it only says how
 * much you share.
 */
import type { ApiItemType } from "@/components/cellar-api/itemTypes";

const PLURAL: Readonly<Record<ApiItemType, [string, string]>> = {
  WINE: ["wine", "wines"],
  BEER: ["beer", "beers"],
  SPIRIT: ["spirit", "spirits"],
  COFFEE: ["coffee", "coffees"],
  SAKE: ["sake", "sakes"],
  TEA: ["tea", "teas"],
};

export type AgreementCounts = {
  readonly shared: number;
  readonly agreed: number | null;
  readonly byType: readonly {
    readonly itemType: ApiItemType;
    readonly shared: number;
    readonly agreed: number | null;
  }[];
};

const noun = (type: ApiItemType | null, count: number): string => {
  if (type === null) return count === 1 ? "item" : "items";
  const [one, many] = PLURAL[type];
  return count === 1 ? one : many;
};

/** Whether the server's gate let the agreed count through. */
export const agreementShown = (counts: AgreementCounts): boolean =>
  counts.agreed !== null;

/**
 * "You agree on 7 of 9 shared wines" when every shared item is one type,
 * "… shared items" when they span types, and "Not enough in common yet
 * (2 shared)" below the gate.
 */
export const agreementLine = (counts: AgreementCounts): string => {
  if (counts.agreed === null) {
    return `Not enough in common yet (${counts.shared} shared)`;
  }
  const only = counts.byType.length === 1 ? counts.byType[0] : undefined;
  const type = only?.itemType ?? null;
  return `You agree on ${counts.agreed} of ${counts.shared} shared ${noun(type, counts.shared)}`;
};

/**
 * A stored style value for display (F-186): the contract's one rule, so a
 * lowercase `black` reads "Black" here exactly as it does in the taste line.
 */
export { styleLabel } from "@cellar-assistant/contracts/taste";

/** Bar widths for "What it's built from": the most-rated type is full. */
export const typeBarWidths = (
  types: readonly { readonly itemType: ApiItemType; readonly count: number }[],
): { itemType: ApiItemType; count: number; percent: number }[] => {
  const top = Math.max(1, ...types.map((t) => t.count));
  return types.map((t) => ({
    itemType: t.itemType,
    count: t.count,
    percent: Math.max(4, Math.round((t.count / top) * 100)),
  }));
};

/** A connection's nodes, in order (the API pages every list, §1.5). */
export function nodes<T>(connection: {
  readonly edges: readonly { readonly node: T }[];
}): T[] {
  return connection.edges.map((edge) => edge.node);
}

/** An agreement row as `agreementLine` reads it, from the API's shape. */
export function agreementCounts(row: {
  readonly shared: number;
  readonly agreed: number | null;
  readonly byType: {
    readonly edges: readonly {
      readonly node: AgreementCounts["byType"][number];
    }[];
  };
}): AgreementCounts {
  return { shared: row.shared, agreed: row.agreed, byType: nodes(row.byType) };
}

/** Under the archetype: "190 ratings · 4 kinds". */
export const ratingsLine = (ratingCount: number, kinds: number): string =>
  [
    `${ratingCount} ${ratingCount === 1 ? "rating" : "ratings"}`,
    kinds > 0 ? `${kinds} ${kinds === 1 ? "kind" : "kinds"}` : "",
  ]
    .filter((part) => part !== "")
    .join(" · ");

/**
 * The locked archetype's meter: `need` dashed cells, the first `have` filled.
 * "Rate 10 drinks to see yours" and "3 of 10".
 */
export const archetypeMeter = (
  ratingCount: number,
  need: number,
): { cells: boolean[]; line: string } => {
  const have = Math.max(0, Math.min(need, ratingCount));
  return {
    cells: Array.from({ length: need }, (_, k) => k < have),
    line: `${have} of ${need}`,
  };
};

/**
 * Agreement as cells, one per shared item, the agreed ones lit (FIX-social-b
 * ruling 5: a two-state grid, never a chart or a percentage). Past `max`
 * shared items the grid stops growing and the count says the rest. `null`
 * below the server's gate, which says only how much is shared.
 */
export const agreementCells = (
  counts: Pick<AgreementCounts, "shared" | "agreed">,
  max = 16,
): { cells: boolean[]; line: string } | null => {
  if (counts.agreed === null) return null;
  const shown = Math.min(counts.shared, max);
  const lit = Math.round((counts.agreed / Math.max(1, counts.shared)) * shown);
  return {
    cells: Array.from({ length: shown }, (_, k) => k < lit),
    line: `${counts.agreed} of ${counts.shared}`,
  };
};
