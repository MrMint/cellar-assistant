/**
 * The restored onboarding wizard's adapters — the new API's shapes in, the old
 * components' props out, and back again. Plain module: no React, no URQL, so
 * `adapter.test.ts` exercises it directly.
 *
 * Old → new, per step of `82450ad1:src/components/common/OnboardingWizard`:
 *
 * - `{T}/actors/fetchDefaults` read `{type}_defaults(hint)` (snake_case,
 *   flat, `brand_id`/`brand_name`/`is_new_brand`). Now `startItemOnboarding`
 *   returns `ItemOnboarding.defaults`, a JSON bag whose per-type attributes
 *   are nested (`defaults.wine.vintage`) and camelCase. It goes through the
 *   E2c merge (`lib/items/extraction-merge.ts`) — fill-empty-only, and every
 *   proposal a field cannot hold reported rather than dropped — into the
 *   restored form's own values ({@link formDefaultsFromOnboarding}).
 * - `QuickAddCard`'s `QuickAddItemDefaults` (snake_case) is derived from those
 *   form values ({@link quickAddDefaultsFrom}), so the card and the form can
 *   never disagree about what will be saved.
 * - `insert_{type}s_one(item_onboarding_id, barcode on_conflict…)` becomes
 *   `confirmItemOnboarding` ({@link confirmInputFrom}); the barcode is the
 *   session's (scanned) or `ensureBarcode` + `linkBarcodeItem` (typed, X11).
 */

import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import type { ItemCardItem } from "@/components/item/ItemCard/types";
import type { ItemFormValues } from "@/components/item/ItemForm";
import { dateFromYear, yearFromDate } from "@/components/item/itemFormLayout";
import {
  ATTRIBUTE_INPUT_KEY,
  attributesToSave,
  ITEM_FORM_RULES,
  missingRequiredAttributes,
  staticOptionValues,
} from "@/components/item-api/itemFormRules";
import { ITEM_TYPE_SEGMENTS } from "@/components/item-api/itemTypes";
import { CONFIDENCE_THRESHOLDS } from "@/constants";
import {
  mergeExtractedDefaults,
  type SkippedProposal,
} from "@/lib/items/extraction-merge";
import type { QuickAddItemDefaults } from "../QuickAddCard";

/** What the analyze step hands the form and the quick-add card. */
export type OnboardingDefaults = {
  values: ItemFormValues;
  /** The brand as the label printed it; `confirmItemOnboarding` resolves it. */
  brandName: string;
  /** Proposals the form could not take, with the reason — shown, not dropped. */
  skipped: readonly SkippedProposal[];
};

export const emptyFormValues = (): ItemFormValues => ({
  name: "",
  description: "",
  country: "",
  attributes: {},
});

export const emptyDefaults = (): OnboardingDefaults => ({
  values: emptyFormValues(),
  brandName: "",
  skipped: [],
});

/** The keys whose column is a `date` — the restored form edits them as a year. */
const dateKeys = (type: ApiItemType): string[] =>
  ITEM_FORM_RULES[type].attributes
    .filter((field) => field.kind === "date")
    .map((field) => field.key);

/**
 * `ItemOnboarding.defaults` → the restored form's default values.
 *
 * The merge runs against an empty form (the old wizard showed the form only
 * once the analysis was back, so there is nothing typed to protect) but keeps
 * its other half: a value a field cannot hold is reported in `skipped`, and a
 * `static` picker only takes one of its own options. A `date` proposal
 * (`2015-06-01`) becomes the year the old form asked for (`2015`).
 */
export const formDefaultsFromOnboarding = (
  type: ApiItemType,
  defaults: unknown,
): OnboardingDefaults => {
  const merged = mergeExtractedDefaults({
    defaults,
    bagKey: ATTRIBUTE_INPUT_KEY[type],
    fields: ITEM_FORM_RULES[type].attributes,
    current: { ...emptyFormValues(), brandName: "" },
    edited: new Set(),
    allowedValues: (field) =>
      field.kind === "static" ? staticOptionValues(field.options) : null,
  });
  const attributes: Record<string, string> = { ...merged.values.attributes };
  for (const key of dateKeys(type)) {
    if (attributes[key] !== undefined) {
      attributes[key] = yearFromDate(attributes[key]);
    }
  }
  return {
    values: {
      name: merged.values.name,
      description: merged.values.description,
      country: merged.values.country,
      attributes,
    },
    brandName: merged.values.brandName,
    skipped: merged.skipped,
  };
};

/** The form's year fields back to the `YYYY-01-01` the columns hold. */
const attributesForSave = (
  type: ApiItemType,
  attributes: Record<string, string>,
): Record<string, string> => {
  const out = { ...attributes };
  for (const key of dateKeys(type)) {
    out[key] = dateFromYear(out[key] ?? "", "");
  }
  return out;
};

/** `ConfirmItemOnboardingInput`, from the restored form. No `cellarId`: the
 * old flow filed the bottle as its own step (`insertCellarItem`), with the
 * display photo, and so does this one. */
export const confirmInputFrom = (
  type: ApiItemType,
  values: ItemFormValues,
  brandName: string,
) => ({
  name: values.name.trim(),
  description:
    values.description.trim() === "" ? null : values.description.trim(),
  country: values.country === "" ? null : values.country,
  brandName: brandName.trim() === "" ? null : brandName.trim(),
  attributes: attributesToSave(
    type,
    attributesForSave(type, values.attributes),
  ),
});

/**
 * Why a save would fail in the outbox rather than here — `null` when it
 * would not. `wines.style`/`vintage`, `spirits.type` and `coffees.description`
 * are NOT NULL behind nullable GraphQL inputs (`itemFormRules.ts`).
 */
export const saveBlocker = (
  type: ApiItemType,
  values: ItemFormValues,
): string | null => {
  if (values.name.trim() === "") return "Name cannot be empty.";
  if (
    ITEM_FORM_RULES[type].descriptionRequired &&
    values.description.trim() === ""
  ) {
    return "Description cannot be empty.";
  }
  const missing = missingRequiredAttributes(
    type,
    attributesForSave(type, values.attributes),
  );
  return missing.length === 0
    ? null
    : `${missing.map((field) => field.label).join(", ")} cannot be empty.`;
};

/**
 * Whether the quick-add card (15 s auto-confirm) may be offered — Q7.
 *
 * The old guard was `confidence >= 0.9` alone, and E2c is what that cost: with
 * no photograph the model invented a Château d'Yquem at 0.9 and the card
 * saved it on its own. So, as well as the old threshold:
 *
 * - a label photograph was actually uploaded and read (`labelSent`), and
 * - nothing the database requires is missing, so an unattended save cannot
 *   become an outbox row that dies after the card said "added".
 */
export const canQuickAdd = ({
  type,
  labelSent,
  confidence,
  defaults,
}: {
  type: ApiItemType;
  labelSent: boolean;
  confidence: number | undefined;
  defaults: OnboardingDefaults | undefined;
}): boolean =>
  labelSent &&
  defaults !== undefined &&
  (confidence ?? 0) >= CONFIDENCE_THRESHOLDS.HIGH &&
  saveBlocker(type, defaults.values) === null;

const nonEmpty = (value: string | undefined): string | undefined =>
  value === undefined || value.trim() === "" ? undefined : value;

/** The card's summary fields, read off the form values it would save. */
export const quickAddDefaultsFrom = (
  type: ApiItemType,
  { values, brandName }: OnboardingDefaults,
): QuickAddItemDefaults => {
  const a = values.attributes;
  const base: QuickAddItemDefaults = {
    name: nonEmpty(values.name),
    description: nonEmpty(values.description),
    country: nonEmpty(values.country),
    brand_name: nonEmpty(brandName),
  };
  switch (type) {
    case "WINE":
      return {
        ...base,
        vintage: nonEmpty(a.vintage),
        variety: nonEmpty(a.variety),
        style: nonEmpty(a.style),
        region: nonEmpty(a.region),
      };
    case "BEER":
      return { ...base, style: nonEmpty(a.style) };
    case "SPIRIT":
      return {
        ...base,
        type: nonEmpty(a.spiritType),
        style: nonEmpty(a.style),
      };
    case "COFFEE":
      return { ...base, roast_level: nonEmpty(a.roastLevel) };
    case "SAKE":
      return {
        ...base,
        category: nonEmpty(a.category),
        type: nonEmpty(a.sakeType),
      };
    case "TEA":
      return {
        ...base,
        category: nonEmpty(a.category),
        caffeine_level: nonEmpty(a.caffeineLevel),
      };
  }
};

/** One match for a scanned code, as `ExistingItems` draws it. */
export type ExistingItem = { item: ItemCardItem; type: ApiItemType };

/**
 * Where "No" on "Would you like to add another item?" goes — the old
 * `finalPrompt.DONE`. In a cellar that is the bottle (decision 1: the URL
 * carries the cellar-item id); otherwise the item.
 */
export const finishedHref = ({
  type,
  itemId,
  cellarId,
  cellarItemId,
}: {
  type: ApiItemType;
  itemId: string;
  cellarId?: string;
  cellarItemId?: string;
}): string =>
  cellarId !== undefined && cellarItemId !== undefined
    ? `/cellars/${cellarId}/${ITEM_TYPE_SEGMENTS[type]}/${cellarItemId}`
    : `/${ITEM_TYPE_SEGMENTS[type]}/${itemId}`;

/** Where "Yes" goes — the old `finalPrompt.ADD_ANOTHER`. */
export const addAnotherHref = (cellarId?: string): string =>
  cellarId !== undefined ? `/cellars/${cellarId}/items/add` : "/add";
