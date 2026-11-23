/**
 * L04 breadth stamps, as words. A stamp is a count of distinct things —
 * styles, regions, kinds of drink, recipes made — and never a count of drinks,
 * days or volume (contracts `recap.ts`, `BREADTH_STAMP_KINDS`).
 *
 * Shared by Me's `MeStamps`, the recap deck and the recap share image, so the
 * three always say the same thing.
 */
import type { BreadthStampKind } from "@cellar-assistant/contracts/recap";

const NOUNS: Readonly<Record<BreadthStampKind, readonly [string, string]>> = {
  STYLES: ["style", "styles"],
  REGIONS: ["region", "regions"],
  TYPES: ["kind of drink", "kinds of drink"],
  RECIPES: ["recipe made", "recipes made"],
};

/** `styles`, `kind of drink`, ... */
export const stampNoun = (kind: BreadthStampKind, count: number): string => {
  const [one, many] = NOUNS[kind];
  return count === 1 ? one : many;
};

/**
 * A tier as a number that cannot be read as a count: "3+". A stamp is the
 * highest tier reached, so beside a recap card that says "5 kinds of drink"
 * a bare "3 kinds of drink" contradicted it (W-18).
 */
export const stampTierText = (tier: number): string => `${tier}+`;

/** The earned tier as words: "5+ regions", "3+ kinds of drink". */
export const stampLabel = (stamp: {
  readonly kind: BreadthStampKind;
  readonly tier: number;
}): string =>
  `${stampTierText(stamp.tier)} ${stampNoun(stamp.kind, stamp.tier)}`;

/** For assistive tech: "Stamp: 5 regions (6 so far)". */
export const stampDescription = (stamp: {
  readonly kind: BreadthStampKind;
  readonly tier: number;
  readonly count: number;
}): string =>
  stamp.count > stamp.tier
    ? `Stamp: ${stampLabel(stamp)} (${stamp.count} so far)`
    : `Stamp: ${stampLabel(stamp)}`;
