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
 * Required markers come from the database (`ITEM_FORM_RULES`), plus — in
 * the **create** form only — the three the old forms starred over nullable
 * columns: sake's Vintage and Category (`82450ad1:src/components/sake/
 * SakeForm.tsx:192,238`) and tea's Category (`tea/TeaForm.tsx:236`). A new
 * sake or tea needs them as it always did; on the edit form a star there would
 * only stop someone clearing a value the database allows to be empty, so edit
 * keeps the database's rule.
 */

import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import {
  type AttributeField,
  ITEM_FORM_RULES,
  isNonVintageText,
  NON_VINTAGE,
} from "@/components/item-api/itemFormRules";

export type FormEntry =
  | { kind: "name"; label: string }
  | {
      kind: "description";
      label: string;
      /** `descriptionRequired` — no type since X19 dropped coffee's NOT NULL. */
      required?: boolean;
    }
  | { kind: "country"; label: string }
  | {
      kind: "attribute";
      label: string;
      field: AttributeField;
      /** A `Textarea`, as the old tea form had for two fields. */
      multiline?: boolean;
      /** Starred and validated: the database's rule, or the old create form's. */
      required: boolean;
    };

/** Which form: the onboarding wizard's create, or an item's edit. */
export type FormMode = "create" | "edit";

/**
 * Starred by the old create forms over columns the database leaves nullable
 * (see the module comment) — create mode only.
 */
const CREATE_REQUIRED: Partial<Record<ApiItemType, readonly string[]>> = {
  SAKE: ["vintageYear", "category"],
  TEA: ["category"],
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

/** The `react-hook-form` path an entry edits (`name`, `attributes.vintage`). */
export const entryPath = (entry: FormEntry): string =>
  entry.kind === "attribute" ? `attributes.${entry.field.key}` : entry.kind;

/** The form's entries for one type, old order and labels. */
export const formLayout = (
  type: ApiItemType,
  mode: FormMode = "edit",
): FormEntry[] =>
  ORDER[type].map((spec): FormEntry => {
    if (spec === "description") {
      return {
        kind: spec,
        label: LABELS[spec],
        required: ITEM_FORM_RULES[type].descriptionRequired,
      };
    }
    if (typeof spec === "string") return { kind: spec, label: LABELS[spec] };
    const [key, label, multiline] = spec;
    const field = ITEM_FORM_RULES[type].attributes.find((f) => f.key === key);
    if (field === undefined) {
      throw new Error(`itemFormLayout: ${type} has no attribute ${key}`);
    }
    // X19: a non-vintage-capable field is starred in both forms — the column
    // is nullable, but NULL means "NV", so the form asks for a year or NV.
    const required =
      field.required === true ||
      field.nonVintage === true ||
      (mode === "create" && (CREATE_REQUIRED[type] ?? []).includes(key));
    return { kind: "attribute", label, field, multiline, required };
  });

/**
 * The old forms took a vintage as a year (`<Input type="number" min=1900>`)
 * and wrote `convertYearToDate(year)`; wine, beer and spirit vintages are
 * still dates. Year in, `YYYY-01-01` out — unless the year is unchanged, in
 * which case the stored date is kept as it was rather than rounded to 1 Jan.
 */
export const yearFromDate = (date: string): string => {
  if (isNonVintageText(date)) return NON_VINTAGE;
  const year = date.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : "";
};

export const dateFromYear = (year: string, original: string): string => {
  const trimmed = year.trim();
  if (trimmed === "") return "";
  // X19: "NV" stays "NV" — `attributesToSave` sends it as `null`.
  if (isNonVintageText(trimmed)) return NON_VINTAGE;
  if (yearFromDate(original) === trimmed) return original;
  return /^\d{4}$/.test(trimmed) ? `${trimmed}-01-01` : trimmed;
};

/** "alcohol_content_percentage" and "alcoholContentPercentage" alike. */
const fieldWord = (key: string): string =>
  key.replace(/[_\s-]/g, "").toLowerCase();

/**
 * C3 "Check this" (CROSS-LOT): `Item.unconfirmedFields` names the fields the
 * label read guessed and nobody confirmed (`name`, `brandName`, `country`, or
 * an attribute key). This maps them to the form's own paths, in the form's
 * order, keeping only the fields the form shows; `brandName` only when the
 * form has a brand field.
 */
export const checkPaths = (
  unconfirmed: readonly string[],
  layout: readonly FormEntry[],
  withBrand: boolean,
): string[] => {
  const wanted = new Set(unconfirmed.map(fieldWord));
  // The brand field sits right after the description (ItemForm's order).
  const shown = layout.flatMap((entry) =>
    withBrand && entry.kind === "description"
      ? [entryPath(entry), "brandName"]
      : [entryPath(entry)],
  );
  return shown.filter((path) =>
    wanted.has(fieldWord(path.replace(/^attributes\./, ""))),
  );
};

/** "1 to check", "3 to check" (CROSS-LOT: the counter beside the primary). */
export const toCheckLabel = (count: number): string => `${count} to check`;
