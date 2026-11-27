/**
 * K2 · "Needs details" (Capture-Place 25 to 28; CROSS-LOT "Drafts needing
 * details"): what each saved draft still misses, in the owner's words, and
 * the write that finishes it.
 *
 * A draft's needs are the fields a finished bottle of its kind carries: a
 * name, its maker, its style, then strength (beer, wine, spirit, sake) or
 * origin (coffee, tea), and a wine's vintage answer. They include the
 * server's floor (`draftMeetsFloor`: a name, a wine's style and vintage
 * answer, a spirit's type), so a draft with no needs left always confirms.
 *
 * Pure — `needs.test.ts`.
 */
import type { ApiItemType as ItemType } from "@/components/cellar-api/itemTypes";
import {
  formatBeerStyle,
  formatEnum,
  formatSakeType,
  formatSpiritType,
  formatTeaCategory,
  formatWineStyle,
} from "@/utilities/formatters";

export type Need =
  | "name"
  | "maker"
  | "style"
  | "strength"
  | "origin"
  | "vintage";

export type VintageAnswer = "VINTAGE" | "NON_VINTAGE" | "UNANSWERED";

/** `SaveDraftInput.fields`: `ConfirmItemOnboardingInput`'s item fields. */
export type DraftFields = {
  name?: string;
  description?: string;
  country?: string;
  brandName?: string;
  attributes?: Record<string, unknown>;
};

/** A saved draft, as the list reads it (`NeedsDetailsDraft`). */
export type Draft = {
  readonly id: string;
  readonly itemType: ItemType;
  readonly cellarId: string | null;
  readonly displayName: string | null;
  readonly displayMaker: string | null;
  readonly draftFields: unknown;
  readonly confirmedFields: readonly string[];
  readonly vintageAnswer: VintageAnswer;
  readonly imageId: string | null;
};

type KindSpec = {
  /** "Brewery": the maker field's label for this kind. */
  readonly maker: string;
  /** The style attribute's key, its label, and its words. */
  readonly style: {
    readonly key: string;
    readonly label: string;
    readonly words: (value: string) => string;
  };
  /** Strength (alcohol) or origin (country) as the fourth need. */
  readonly fourth: "strength" | "origin";
  readonly vintage: boolean;
};

const words =
  (format: (value: string) => string | null | undefined) =>
  (value: string): string =>
    format(value) ?? value;

const KINDS: Readonly<Record<ItemType, KindSpec>> = {
  BEER: {
    maker: "Brewery",
    style: { key: "style", label: "Style", words: words(formatBeerStyle) },
    fourth: "strength",
    vintage: false,
  },
  WINE: {
    maker: "Winery",
    style: { key: "style", label: "Style", words: words(formatWineStyle) },
    fourth: "strength",
    vintage: true,
  },
  SPIRIT: {
    maker: "Distillery",
    style: { key: "spiritType", label: "Type", words: words(formatSpiritType) },
    fourth: "strength",
    vintage: false,
  },
  COFFEE: {
    maker: "Roaster",
    style: { key: "roastLevel", label: "Roast", words: words(formatEnum) },
    fourth: "origin",
    vintage: false,
  },
  SAKE: {
    maker: "Brewery",
    style: { key: "sakeType", label: "Type", words: words(formatSakeType) },
    fourth: "strength",
    vintage: false,
  },
  TEA: {
    maker: "Maker",
    style: { key: "category", label: "Kind", words: words(formatTeaCategory) },
    fourth: "origin",
    vintage: false,
  },
};

export const kindSpec = (type: ItemType): KindSpec => KINDS[type];

/** The strength attribute every alcoholic kind shares. */
export const STRENGTH_KEY = "alcoholContentPercentage";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value : undefined;

/** `draftFields` (JSON) as fields, keeping only what the shape allows. */
export const fieldsOf = (value: unknown): DraftFields => {
  if (!isRecord(value)) return {};
  const out: DraftFields = {};
  const name = text(value.name);
  if (name !== undefined) out.name = name;
  const description = text(value.description);
  if (description !== undefined) out.description = description;
  const country = text(value.country);
  if (country !== undefined) out.country = country;
  const brandName = text(value.brandName);
  if (brandName !== undefined) out.brandName = brandName;
  if (isRecord(value.attributes)) out.attributes = { ...value.attributes };
  return out;
};

const present = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== "";

/** What this draft still misses, in the order the row says them. */
export const needsOf = (
  type: ItemType,
  fields: DraftFields,
  vintageAnswer: VintageAnswer,
): Need[] => {
  const spec = KINDS[type];
  const bag = fields.attributes ?? {};
  const out: Need[] = [];
  if (!present(fields.name)) out.push("name");
  if (!present(fields.brandName)) out.push("maker");
  if (!present(bag[spec.style.key])) out.push("style");
  if (spec.fourth === "strength" && !present(bag[STRENGTH_KEY])) {
    out.push("strength");
  }
  if (spec.fourth === "origin" && !present(fields.country)) out.push("origin");
  if (
    spec.vintage &&
    (vintageAnswer === "UNANSWERED" ||
      (vintageAnswer === "VINTAGE" && !present(bag.vintage)))
  ) {
    out.push("vintage");
  }
  return out;
};

/** One need in a sentence's words: "brewery", "strength". */
export const needWord = (type: ItemType, need: Need): string => {
  const spec = KINDS[type];
  switch (need) {
    case "maker":
      return spec.maker.toLowerCase();
    case "style":
      return spec.style.label.toLowerCase();
    default:
      return need;
  }
};

const andList = (items: readonly string[]): string =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/** The row's third line: "Needs brewery and strength". */
export const needLine = (type: ItemType, needs: readonly Need[]): string =>
  needs.length === 0
    ? "Ready to add"
    : `Needs ${andList(needs.map((need) => needWord(type, need)))}`;

/** The filter chips' words (CROSS-LOT: "Maker" across every kind). */
export const NEED_CHIP: Readonly<Record<Need, string>> = {
  name: "Name",
  maker: "Maker",
  style: "Style",
  strength: "Strength",
  origin: "Origin",
  vintage: "Vintage",
};

export type DraftRow = {
  readonly draft: Draft;
  readonly fields: DraftFields;
  readonly needs: readonly Need[];
  /** The name, or "Unnamed beer". */
  readonly title: string;
  /** "Brewery · Witbier": what the draft does know. */
  readonly detail: string;
  readonly needLine: string;
};

export const rowOf = (draft: Draft): DraftRow => {
  const fields = fieldsOf(draft.draftFields);
  const spec = KINDS[draft.itemType];
  const needs = needsOf(draft.itemType, fields, draft.vintageAnswer);
  const name = fields.name ?? text(draft.displayName);
  const maker = fields.brandName ?? text(draft.displayMaker);
  const style = fields.attributes?.[spec.style.key];
  return {
    draft,
    fields,
    needs,
    title: name ?? `Unnamed ${draft.itemType.toLowerCase()}`,
    detail: [maker, typeof style === "string" ? spec.style.words(style) : null]
      .filter((part): part is string => part !== null && part !== undefined)
      .join(" · "),
    needLine: needLine(draft.itemType, needs),
  };
};

/** Each need's count over the rows, most first, zeros left out. */
export const needCounts = (
  rows: readonly DraftRow[],
): { need: Need; count: number }[] => {
  const counts = new Map<Need, number>();
  for (const row of rows) {
    for (const need of row.needs) counts.set(need, (counts.get(need) ?? 0) + 1);
  }
  const order = Object.keys(NEED_CHIP) as Need[];
  return order
    .map((need) => ({ need, count: counts.get(need) ?? 0 }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);
};

/** "50 bottles", "1 bottle". */
export const bottlesLine = (count: number): string =>
  `${count} ${count === 1 ? "bottle" : "bottles"}`;

/** What the person typed in the finish-one sheet, per need. */
export type Edits = {
  name?: string;
  maker?: string;
  style?: string;
  strength?: number | null;
  origin?: string;
  /** A year, or "NV" for no vintage. */
  vintage?: number | "NV" | null;
};

/** The confirmed-field name each need writes (`fieldConfidence` keys). */
const fieldNameOf = (type: ItemType, need: Need): string => {
  switch (need) {
    case "name":
      return "name";
    case "maker":
      return "brandName";
    case "style":
      return KINDS[type].style.key;
    case "strength":
      return STRENGTH_KEY;
    case "origin":
      return "country";
    case "vintage":
      return "vintage";
  }
};

export type FinishPlan = {
  /** `SaveDraftInput`, less the id. */
  readonly save: {
    readonly cellarId: string | null;
    readonly fields: DraftFields;
    readonly confirmedFields: string[];
    readonly vintageAnswer: VintageAnswer;
  };
  /** Nothing left to fill: the draft can be filed as a bottle. */
  readonly complete: boolean;
  /** What is still missing after the edits. */
  readonly needs: readonly Need[];
};

/**
 * The write for one finish-one Save: the draft's fields with the person's
 * edits over them, the edited fields marked confirmed, and whether nothing is
 * left so the draft can be filed. Blank edits change nothing.
 */
export const finishPlan = (draft: Draft, edits: Edits): FinishPlan => {
  const type = draft.itemType;
  const spec = KINDS[type];
  const fields = fieldsOf(draft.draftFields);
  const attributes: Record<string, unknown> = { ...(fields.attributes ?? {}) };
  const confirmed = new Set(draft.confirmedFields);
  let vintageAnswer = draft.vintageAnswer;
  const touched = (need: Need) => confirmed.add(fieldNameOf(type, need));

  const name = edits.name?.trim();
  if (name) {
    fields.name = name;
    touched("name");
  }
  const maker = edits.maker?.trim();
  if (maker) {
    fields.brandName = maker;
    touched("maker");
  }
  const style = edits.style?.trim();
  if (style) {
    attributes[spec.style.key] = style;
    touched("style");
  }
  if (
    spec.fourth === "strength" &&
    typeof edits.strength === "number" &&
    Number.isFinite(edits.strength)
  ) {
    attributes[STRENGTH_KEY] = edits.strength;
    touched("strength");
  }
  const origin = edits.origin?.trim();
  if (spec.fourth === "origin" && origin) {
    fields.country = origin;
    touched("origin");
  }
  if (spec.vintage && edits.vintage !== undefined && edits.vintage !== null) {
    if (edits.vintage === "NV") {
      vintageAnswer = "NON_VINTAGE";
      delete attributes.vintage;
    } else {
      vintageAnswer = "VINTAGE";
      attributes.vintage = `${edits.vintage}-01-01`;
    }
    touched("vintage");
  }
  if (Object.keys(attributes).length > 0) fields.attributes = attributes;
  const needs = needsOf(type, fields, vintageAnswer);
  return {
    save: {
      cellarId: draft.cellarId,
      fields,
      confirmedFields: Array.from(confirmed),
      vintageAnswer,
    },
    complete: needs.length === 0,
    needs,
  };
};

/** The draft as it was, to put back on Undo. */
export const restoreInput = (draft: Draft) => ({
  onboardingId: draft.id,
  cellarId: draft.cellarId,
  fields: fieldsOf(draft.draftFields),
  confirmedFields: [...draft.confirmedFields],
  vintageAnswer: draft.vintageAnswer,
});

/**
 * `ConfirmItemOnboardingInput` from a complete plan. `cellarId` is left out:
 * the draft's own cellar (the server's fallback), never one the client names.
 */
export const confirmInput = (plan: FinishPlan) => {
  const { fields, confirmedFields, vintageAnswer } = plan.save;
  const attributes: Record<string, unknown> = { ...(fields.attributes ?? {}) };
  if (vintageAnswer === "NON_VINTAGE") attributes.vintage = null;
  return {
    name: fields.name ?? "",
    ...(fields.brandName === undefined ? {} : { brandName: fields.brandName }),
    ...(fields.country === undefined ? {} : { country: fields.country }),
    ...(fields.description === undefined
      ? {}
      : { description: fields.description }),
    attributes,
    confirmedFields,
  };
};
