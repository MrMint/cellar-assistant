/**
 * What the item forms say when a required field is empty — N03.
 *
 * Before this, a required field's `rules: { required: true }` carried no
 * message and nothing rendered `fieldState.error`: Add scrolled to the field
 * and then said nothing at all, and `saveBlocker`'s message — which names the
 * fields — could never be reached, because validation stopped the submit
 * before it ran. Now each field says what is wrong under itself, and the
 * submit button's line names every field still missing.
 *
 * Plain module, so the words and the rule are tested apart from the markup
 * (`form-errors.test.ts`) and survive the shadcn migration (D20) unchanged.
 */

import type { ItemFormValues } from "./ItemForm";
import { entryPath, type FormEntry } from "./itemFormLayout";

/** The message a required field shows under itself. */
export const requiredMessage = (label: string): string =>
  `${label} is required.`;

/** `react-hook-form` rules for an entry: a message-bearing `required`, or none. */
export const requiredRule = (
  entry: FormEntry,
): { required: string } | undefined =>
  isRequired(entry) ? { required: requiredMessage(entry.label) } : undefined;

/** Whether the form stars and validates this entry. */
export const isRequired = (entry: FormEntry): boolean =>
  entry.kind === "name" ||
  ((entry.kind === "attribute" || entry.kind === "description") &&
    entry.required === true);

/**
 * The text a field shows for its current error. A `required` error with no
 * message (a rule set elsewhere as `required: true`) still gets one, so no
 * error is ever silent.
 */
export const fieldErrorText = (
  label: string,
  error: { type?: string; message?: string } | undefined,
): string | undefined => {
  if (error === undefined) return undefined;
  if (error.message !== undefined && error.message !== "") return error.message;
  return error.type === "required"
    ? requiredMessage(label)
    : `${label} is not valid.`;
};

const valueAt = (values: ItemFormValues, path: string): string => {
  if (path.startsWith("attributes.")) {
    return values.attributes[path.slice("attributes.".length)] ?? "";
  }
  const top = values[path as "name" | "description" | "country"];
  return typeof top === "string" ? top : "";
};

/** The labels of required entries that are still blank, in form order. */
export const missingRequiredLabels = (
  layout: readonly FormEntry[],
  values: ItemFormValues,
): string[] =>
  layout
    .filter(
      (entry) =>
        isRequired(entry) && valueAt(values, entryPath(entry)).trim() === "",
    )
    .map((entry) => entry.label);

const list = (labels: readonly string[]): string =>
  labels.length <= 1
    ? (labels[0] ?? "")
    : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;

/**
 * The line beside the submit button when validation stops it: every required
 * field still missing, by the label the form shows. `null` when none is.
 */
export const requiredSummary = (
  layout: readonly FormEntry[],
  values: ItemFormValues,
): string | null => {
  const missing = missingRequiredLabels(layout, values);
  if (missing.length === 0) return null;
  return `${list(missing)} ${missing.length === 1 ? "is" : "are"} required.`;
};
