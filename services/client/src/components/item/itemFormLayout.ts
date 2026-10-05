/**
 * The six old forms' field order and labels, over the new attribute keys.
 *
 * `82450ad1:src/components/{wine,beer,spirit,coffee,sake,tea}/{T}Form.tsx`
 * each laid out its own fields; this is that order and those labels, keyed
 * by `ITEM_FORM_RULES` (`AttributeKey`) so `ItemForm` can render any type and
 * the round trip stays the rewrite's (`attributesFrom` / `attributesToSave`).
 *
 * Two fields the old forms carried are not here:
 *
 * - **Brand** (`BrandPicker`) was shown on create only, never on edit; create
 *   is the onboarding wizard's.
 * - **Barcode** was a free number input written with `on_conflict` into
 *   `barcodes`. On this API a barcode is linked with `linkBarcodeItem` after
 *   `ensureBarcode`, with a symbology the old field never knew (X11), and the
 *   wizard owns that flow; the edit form leaves the item's barcode alone.
 *
 * Required markers come from the database (`ITEM_FORM_RULES`), not from the
 * old forms: those also starred sake's vintage and category and tea's
 * category, which are nullable columns — on an edit form a star there would
 * only stop someone clearing a value the database allows to be empty.
 */

import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import {
  type AttributeField,
  ITEM_FORM_RULES,
} from "@/components/item-api/itemFormRules";

export type FormEntry =
  | { kind: "name"; label: string }
  | { kind: "description"; label: string }
  | { kind: "country"; label: string }
  | {
      kind: "attribute";
      label: string;
      field: AttributeField;
      /** A `Textarea`, as the old tea form had for two fields. */
      multiline?: boolean;
    };

type Spec =
  | "name"
  | "description"
  | "country"
  | readonly [key: string, label: string, multiline?: boolean];

const ORDER: Record<ApiItemType, readonly Spec[]> = {
  WINE: [
    "name",
    ["vintage", "Vintage"],
    "description",
    ["style", "Style"],
    ["variety", "Variety"],
    "country",
    ["region", "Region"],
    ["alcoholContentPercentage", "Alcohol Content"],
    ["vineyardDesignation", "Vineyard Designation"],
    ["specialDesignation", "Special Designation"],
  ],
  BEER: [
    "name",
    "description",
    ["vintage", "Vintage"],
    ["style", "Style"],
    "country",
    ["alcoholContentPercentage", "Alcohol Content"],
    ["internationalBitternessUnit", "IBU"],
  ],
  SPIRIT: [
    "name",
    ["spiritType", "Type"],
    "description",
    ["vintage", "Vintage"],
    ["style", "Style"],
    ["alcoholContentPercentage", "Alcohol Content"],
    "country",
  ],
  COFFEE: [
    "name",
    "description",
    ["roastLevel", "Roast Level"],
    ["species", "Species"],
    ["cultivar", "Cultivar"],
    ["process", "Process"],
    "country",
  ],
  SAKE: [
    "name",
    ["vintageYear", "Vintage"],
    "description",
    ["category", "Category"],
    ["sakeType", "Type"],
    "country",
    ["region", "Region"],
    ["alcoholContentPercentage", "Alcohol Content"],
    ["polishGrade", "Polish Grade (%)"],
    ["sakeMeterValue", "SMV (Nihonshudo)"],
    ["acidity", "Acidity"],
    ["aminoAcid", "Amino Acid"],
    ["riceVariety", "Rice Variety"],
    ["yeastStrain", "Yeast Strain"],
    ["servingTemperature", "Recommended Serving Temperature"],
  ],
  TEA: [
    "name",
    ["harvestYear", "Harvest Year"],
    "description",
    ["category", "Category"],
    ["form", "Form"],
    ["caffeineLevel", "Caffeine Level"],
    "country",
    ["region", "Region"],
    ["cultivar", "Cultivar"],
    ["oxidationLevel", "Oxidation Level"],
    ["processing", "Processing"],
    ["ingredients", "Ingredients", true],
    ["steepingTemperature", "Steeping Temperature"],
    ["steepingTime", "Steeping Time"],
    ["flavorProfile", "Flavor Profile", true],
    ["isOrganic", "Organic"],
    ["isFairTrade", "Fair Trade"],
  ],
};

const LABELS = {
  name: "Name",
  description: "Description",
  country: "Country",
} as const;

/** The form's entries for one type, old order and labels. */
export const formLayout = (type: ApiItemType): FormEntry[] =>
  ORDER[type].map((spec): FormEntry => {
    if (typeof spec === "string") return { kind: spec, label: LABELS[spec] };
    const [key, label, multiline] = spec;
    const field = ITEM_FORM_RULES[type].attributes.find((f) => f.key === key);
    if (field === undefined) {
      throw new Error(`itemFormLayout: ${type} has no attribute ${key}`);
    }
    return { kind: "attribute", label, field, multiline };
  });

/**
 * The old forms took a vintage as a year (`<Input type="number" min=1900>`)
 * and wrote `convertYearToDate(year)`; wine, beer and spirit vintages are
 * still dates. Year in, `YYYY-01-01` out — unless the year is unchanged, in
 * which case the stored date is kept as it was rather than rounded to 1 Jan.
 */
export const yearFromDate = (date: string): string => {
  const year = date.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : "";
};

export const dateFromYear = (year: string, original: string): string => {
  const trimmed = year.trim();
  if (trimmed === "") return "";
  if (yearFromDate(original) === trimmed) return original;
  return /^\d{4}$/.test(trimmed) ? `${trimmed}-01-01` : trimmed;
};
