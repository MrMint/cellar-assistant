import type { ApiItemType } from "@/components/cellar-api/itemTypes";

/**
 * W-20: the words a bottle's page uses, per item type. Wine, beer, spirits and
 * sake come in bottles, are poured and drunk by the glass; tea comes in a tin
 * and coffee in a bag (the Pour sheet's own nouns, `pour/pour-plan.ts`), and
 * both are made and drunk by the cup — so "1 bottle", "Pour", "Log a glass"
 * and "Drink until" read wrong on their pages.
 *
 * The verb names the same action everywhere: the Pour sheet (open + log +
 * level), whose presets already say "Cup" and "Pot" for these two.
 */
export type TypeWords = {
  /** "bottle", "tin", "bag". */
  readonly container: string;
  readonly containers: string;
  /** The Pour sheet's button: "Pour", "Steep", "Brew". */
  readonly pour: string;
  /** One serving: "glass", "cup". */
  readonly serving: string;
  /** The packaging date's row: "Bottled", "Packed", "Roasted". */
  readonly packaged: string;
  /** The window's two ends: "Drink from" / "Drink until", "Best from" / "Best by". */
  readonly windowFrom: string;
  readonly windowUntil: string;
};

const BOTTLE: TypeWords = {
  container: "bottle",
  containers: "bottles",
  pour: "Pour",
  serving: "glass",
  packaged: "Bottled",
  windowFrom: "Drink from",
  windowUntil: "Drink until",
};

const WORDS: Readonly<Record<ApiItemType, TypeWords>> = {
  WINE: BOTTLE,
  BEER: BOTTLE,
  SPIRIT: BOTTLE,
  SAKE: BOTTLE,
  TEA: {
    container: "tin",
    containers: "tins",
    pour: "Steep",
    serving: "cup",
    packaged: "Packed",
    windowFrom: "Best from",
    windowUntil: "Best by",
  },
  COFFEE: {
    container: "bag",
    containers: "bags",
    pour: "Brew",
    serving: "cup",
    packaged: "Roasted",
    windowFrom: "Best from",
    windowUntil: "Best by",
  },
};

/** The words for this type; an unknown type reads as a bottle. */
export const typeWords = (type: string): TypeWords =>
  WORDS[type as ApiItemType] ?? BOTTLE;

/** "2 bottles", "1 tin": the Your bottles heading's count; none is null. */
export const containerCountLabel = (
  type: string,
  count: number,
): string | null => {
  if (count === 0) return null;
  const words = typeWords(type);
  return `${count} ${count === 1 ? words.container : words.containers}`;
};

/** "Your bottles", "Your tins", "Your bags". */
export const yourContainersLabel = (type: string): string => {
  const { containers } = typeWords(type);
  return `Your ${containers}`;
};

/** "This bottle", "This tin", "This bag". */
export const thisContainerLabel = (type: string): string =>
  `This ${typeWords(type).container}`;
