/**
 * "Is it this one? +1 bottle" — which catalogue item a label read already
 * names (N19), and whether that match is strong enough to add a bottle of it
 * unattended (N02).
 *
 * Plain module: no React, no URQL. The wizard's `searchCatalog` actor fetches
 * candidates (`itemSearch(text:, itemTypes:)`) and hands them here.
 *
 * ## The rule
 *
 * A candidate is a match only if it is the type being added and its vintage
 * **equals** the vintage read off the label — compared explicitly, because a
 * text embedding puts "Château Margaux 2015" right next to "Château Margaux
 * 2016" and the bottle in hand is one of them. A wine read without a vintage
 * matches only an item without one; a type with no vintage (coffee, tea)
 * compares as equal on both sides, which is why the unattended path also
 * needs the name (below).
 *
 * `exact` is the stronger claim the 15 s quick-add needs (`canQuickAdd`): a
 * barcode hit (the code names the product) or a search hit whose name is the
 * name read, letter for letter once case, accents and punctuation are set
 * aside. A semantic neighbour that is merely close is offered with a button
 * the person taps (D25: the AI never adds anything without a tap) — never
 * counted down.
 */

import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import type { ItemCardItem } from "@/components/item/ItemCard/types";
import type { ItemFormValues } from "@/components/item/ItemForm";
import type { ExistingItem } from "./adapter";

export type CatalogCandidate = ExistingItem & {
  source: "barcode" | "search";
  /** Cosine distance from `itemSearch`; lower is closer. Search hits only. */
  distance?: number;
};

export type CatalogMatch = CatalogCandidate & {
  /** A barcode hit, or a search hit with the very name read. */
  exact: boolean;
};

/** The attribute that holds a type's vintage in the form, if it has one. */
const VINTAGE_KEY: Readonly<Record<ApiItemType, string | null>> = {
  WINE: "vintage",
  BEER: "vintage",
  SPIRIT: "vintage",
  SAKE: "vintageYear",
  // The card carries no year for these two (`itemCardFromItem`), so there is
  // nothing to compare on the catalogue's side.
  COFFEE: null,
  TEA: null,
};

const yearOf = (value: string | undefined): string | undefined => {
  const year = value?.trim().slice(0, 4);
  return year !== undefined && /^\d{4}$/.test(year) ? year : undefined;
};

/** The vintage the label gave, as a year — `undefined` when it gave none. */
export const readVintage = (
  type: ApiItemType,
  values: ItemFormValues,
): string | undefined => {
  const key = VINTAGE_KEY[type];
  return key === null ? undefined : yearOf(values.attributes[key]);
};

/** Explicit vintage compare: both absent, or the same year. */
export const sameVintage = (
  type: ApiItemType,
  read: string | undefined,
  item: Pick<ItemCardItem, "vintage">,
): boolean => {
  if (VINTAGE_KEY[type] === null) return true;
  return yearOf(read) === yearOf(item.vintage);
};

// Built with `new RegExp` because the client's tsconfig target predates the
// `u` flag in literals (TS1501); every browser the app supports has it.
// biome-ignore lint/complexity/useRegexLiterals: a literal is TS1501 here
const MARKS = new RegExp("\\p{M}", "gu");
// biome-ignore lint/complexity/useRegexLiterals: a literal is TS1501 here
const NOT_LETTER_OR_DIGIT = new RegExp("[^\\p{L}\\p{N}]+", "gu");

/**
 * A name with case, accents, punctuation and spacing set aside. Letters are
 * Unicode letters, so a sake's kanji name compares as itself.
 */
export const normalizeName = (name: string): string =>
  name
    .normalize("NFD")
    .replace(MARKS, "")
    .toLowerCase()
    .replace(NOT_LETTER_OR_DIGIT, " ")
    .trim();

const sameName = (
  candidate: string,
  read: { name: string; brandName: string },
): boolean => {
  const target = normalizeName(candidate);
  if (target === "") return false;
  const name = normalizeName(read.name);
  const branded = normalizeName(`${read.brandName} ${read.name}`);
  return target === name || target === branded;
};

/**
 * The text `itemSearch` is asked for: the name as read, with the brand in
 * front when the name does not already carry it. `null` when nothing was read
 * — searching for an empty string would only return the catalogue's nearest
 * noise.
 */
export const catalogSearchText = ({
  name,
  brandName,
}: {
  name: string;
  brandName: string;
}): string | null => {
  const trimmed = name.trim();
  if (trimmed === "") return null;
  const brand = brandName.trim();
  return brand !== "" && !normalizeName(trimmed).includes(normalizeName(brand))
    ? `${brand} ${trimmed}`
    : trimmed;
};

/**
 * The best match among the candidates, or `null`.
 *
 * Barcode hits lead (a code is a product key), then search hits nearest
 * first. `excludeItemIds` are items the person already said no to — the
 * barcode chooser's "Create New" — and are never offered back.
 */
export const findCatalogMatch = ({
  type,
  values,
  brandName,
  candidates,
  excludeItemIds = [],
}: {
  type: ApiItemType;
  values: ItemFormValues;
  brandName: string;
  candidates: readonly CatalogCandidate[];
  excludeItemIds?: readonly string[];
}): CatalogMatch | null => {
  const vintage = readVintage(type, values);
  const eligible = candidates.filter(
    (candidate) =>
      candidate.type === type &&
      !excludeItemIds.includes(candidate.item.itemId) &&
      sameVintage(type, vintage, candidate.item),
  );
  const ranked = [
    ...eligible.filter((c) => c.source === "barcode"),
    ...eligible
      .filter((c) => c.source === "search")
      .sort(
        (a, b) =>
          (a.distance ?? Number.POSITIVE_INFINITY) -
          (b.distance ?? Number.POSITIVE_INFINITY),
      ),
  ];
  const read = { name: values.name, brandName };
  // An exact one anywhere in the list beats a nearer near-miss.
  const best =
    ranked.find((c) => c.source === "barcode" || sameName(c.item.name, read)) ??
    ranked[0];
  if (best === undefined) return null;
  return {
    ...best,
    exact: best.source === "barcode" || sameName(best.item.name, read),
  };
};
