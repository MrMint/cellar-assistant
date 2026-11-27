import type { ResultOf, VariablesOf } from "gql.tada";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";
import type { ItemFormValues } from "@/components/item/ItemForm";
import { entryPath, type FormEntry } from "@/components/item/itemFormLayout";
import {
  ITEM_FORM_RULES,
  isNonVintageText,
} from "@/components/item-api/itemFormRules";
import { unwrapResult } from "@/lib/api/result";
import { confirmInputFrom } from "./adapter";
import type { SaveDraftMutation } from "./queries";

/** `enum VintageAnswer` (MC-drafts). */
export type VintageAnswer = "VINTAGE" | "NON_VINTAGE" | "UNANSWERED";

/**
 * DECISIONS 34 (3): "No vintage" is an answer, kept apart from "not said".
 * Only a type whose vintage field takes "No vintage" (wine) is ever asked;
 * beer never is, so a beer is always `UNANSWERED`, whatever its form holds.
 */
export const vintageAnswerFor = (
  type: ApiItemType,
  values: ItemFormValues,
): VintageAnswer => {
  if (type === "BEER") return "UNANSWERED";
  const field = ITEM_FORM_RULES[type].attributes.find(
    (candidate) => candidate.nonVintage === true,
  );
  if (field === undefined) return "UNANSWERED";
  const value = (values.attributes[field.key] ?? "").trim();
  if (value === "") return "UNANSWERED";
  return isNonVintageText(value) ? "NON_VINTAGE" : "VINTAGE";
};

/** Whether this type's add form asks for a vintage at all (never beer). */
export const asksVintage = (type: ApiItemType, key: string): boolean =>
  !(type === "BEER" && key === "vintage");

/**
 * A form path (`name`, `brandName`, `attributes.vintage`) as the server names
 * a guessed field: the key of `defaults.fieldConfidence` (`vintage`).
 */
export const serverFieldName = (path: string): string =>
  path.startsWith("attributes.") ? path.slice("attributes.".length) : path;

/**
 * DECISIONS 34: a guess counts as confirmed only once the person touched it —
 * edited it, chose a chip, or said "Looks right". `guessed` are the form
 * paths the read filled; `touched` the paths the person handled.
 */
export const confirmedFieldsFrom = (
  guessed: Iterable<string>,
  touched: ReadonlySet<string>,
): string[] =>
  Array.from(
    new Set(
      Array.from(guessed)
        .filter((path) => touched.has(path))
        .map(serverFieldName),
    ),
  ).sort();

/** `SaveDraftInput.fields`: the confirm input's item fields, any of them missing. */
export const draftFieldsFrom = (
  type: ApiItemType,
  values: ItemFormValues,
  brandName: string,
): Record<string, unknown> => {
  const input = confirmInputFrom(type, values, brandName);
  const fields: Record<string, unknown> = {};
  if (input.name !== "") fields.name = input.name;
  if (input.description !== null) fields.description = input.description;
  if (input.country !== null) fields.country = input.country;
  if (input.brandName !== null) fields.brandName = input.brandName;
  if (input.attributes !== undefined && input.attributes !== null) {
    fields.attributes = input.attributes;
  }
  return fields;
};

/** urql's `useMutation(SaveDraftMutation)` executor, or a test's stub. */
export type SaveDraft = (
  variables: VariablesOf<typeof SaveDraftMutation>,
) => Promise<{ data?: ResultOf<typeof SaveDraftMutation> | null }>;

export type SaveDraftArgs = {
  save: SaveDraft;
  type: ApiItemType;
  /** This session's own onboarding; the server refuses anyone else's. */
  onboardingId: string;
  /** The cellar the bottle is aimed at, from the viewer's addable cellars. */
  cellarId: string | null;
  values: ItemFormValues;
  brandName: string;
  guessed: Iterable<string>;
  touched: ReadonlySet<string>;
};

/**
 * "Finish later" (MC-drafts, L41): `saveDraft`, and nothing else. It never
 * files a bottle or creates an item. A refusal — someone else's onboarding,
 * a cellar the viewer cannot write — throws with the server's words, so the
 * caller never reports a save that did not happen.
 */
export const saveOnboardingDraft = async ({
  save,
  type,
  onboardingId,
  cellarId,
  values,
  brandName,
  guessed,
  touched,
}: SaveDraftArgs): Promise<{ status: string }> => {
  const result = unwrapResult(
    (
      await save({
        input: {
          onboardingId,
          cellarId,
          fields: draftFieldsFrom(type, values, brandName),
          confirmedFields: confirmedFieldsFrom(guessed, touched),
          vintageAnswer: vintageAnswerFor(type, values),
        },
      })
    ).data?.saveDraft,
    "ItemOnboarding",
  );
  if (!result.ok) {
    throw new Error(
      result.error.code === "NOT_FOUND"
        ? "That draft or cellar isn't yours to save to."
        : result.error.code === "TRANSPORT"
          ? "Offline · changes wait. Try again when you're back."
          : result.error.message,
    );
  }
  return { status: result.data.status };
};

/** The floor (DECISIONS 34 (1)): the name and every starred field. */
export const floorPaths = (layout: readonly FormEntry[]): string[] =>
  layout
    .filter(
      (entry) =>
        entry.kind === "name" ||
        (entry.kind === "description" && entry.required === true) ||
        (entry.kind === "attribute" && entry.required),
    )
    .map(entryPath);

/**
 * The floor fields still open, in the form's order: empty, or holding a guess
 * the person never touched (a guess counts only once touched).
 */
export const openFloorPaths = (
  layout: readonly FormEntry[],
  flat: Readonly<Record<string, string>>,
  guessed: ReadonlySet<string>,
  touched: ReadonlySet<string>,
): string[] =>
  floorPaths(layout).filter(
    (path) =>
      (flat[path] ?? "").trim() === "" ||
      (guessed.has(path) && !touched.has(path)),
  );

/** Name and maker, compared as a person would type them. */
const same = (a: string | undefined, b: string | undefined): boolean =>
  (a ?? "").trim().toLowerCase().replace(/\s+/g, " ") ===
  (b ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * DECISIONS 34 (2): after "Not this", the same name (and maker, when the
 * declined match has one) typed again is a duplicate — warned, not stopped.
 */
export const isDuplicateOfDeclined = (
  declined: { name: string; brandName?: string } | undefined,
  name: string,
  brandName: string,
): boolean =>
  declined !== undefined &&
  name.trim() !== "" &&
  same(declined.name, name) &&
  (declined.brandName === undefined ||
    declined.brandName.trim() === "" ||
    same(declined.brandName, brandName));

/**
 * "It's a different drink" needs one differing field: any field other than
 * the name and maker changed since the person said so.
 */
export const differsFrom = (
  snapshot: Readonly<Record<string, string>>,
  flat: Readonly<Record<string, string>>,
): boolean =>
  Object.keys({ ...snapshot, ...flat }).some(
    (path) =>
      path !== "name" &&
      path !== "brandName" &&
      (snapshot[path] ?? "").trim() !== (flat[path] ?? "").trim(),
  );
