/**
 * Which form fields still hold what a machine filled in — the logic behind
 * `AIDraftField` (N19, `docs/product/design-direction.md` §3.8).
 *
 * A field is marked as drafted **by diffing**, not by remembering who typed
 * last: the draft (what the label read, what the pin's reverse geocode said, a
 * barcode lookup, a suggestion) is compared with what the form holds now. A
 * value the person changed — or cleared — is theirs, and the mark goes; a
 * value they changed back is the draft's again, which is the honest answer
 * since it is the draft's value.
 *
 * Plain module, no React, so the markup can be swapped (the shadcn migration,
 * D20) without touching the rule, and the rule is tested on its own
 * (`ai-draft.test.ts`).
 */

/** Where a drafted value came from — one mark per source. */
export type DraftSource = "label" | "suggested" | "pin" | "barcode";

/** The words each source's mark carries. */
export const DRAFT_SOURCE_LABEL: Readonly<Record<DraftSource, string>> = {
  label: "From label",
  suggested: "Suggested",
  pin: "From pin",
  barcode: "From barcode",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A form's values as `path → text`, the paths `react-hook-form` uses
 * (`name`, `attributes.vintage`). Only string leaves count: a draft is text a
 * person can read and overwrite, and anything else (arrays, numbers a control
 * keeps as numbers) is outside what this marks.
 */
export const flattenFormValues = (
  values: unknown,
  prefix = "",
): Readonly<Record<string, string>> => {
  const out: Record<string, string> = {};
  if (!isRecord(values)) return out;
  for (const [key, value] of Object.entries(values)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string") {
      out[path] = value;
    } else if (isRecord(value)) {
      Object.assign(out, flattenFormValues(value, path));
    }
  }
  return out;
};

const same = (a: string, b: string): boolean => a.trim() === b.trim();

/**
 * The paths whose current value is still the draft's.
 *
 * A blank draft value marks nothing (nothing was filled in), and a path the
 * form does not hold is not drafted (the field is not there to mark).
 */
export const draftedPaths = (
  draft: unknown,
  current: unknown,
): ReadonlySet<string> => {
  const drafted = flattenFormValues(draft);
  const now = flattenFormValues(current);
  const paths = new Set<string>();
  for (const [path, value] of Object.entries(drafted)) {
    if (value.trim() === "") continue;
    const held = now[path];
    if (held !== undefined && same(held, value)) paths.add(path);
  }
  return paths;
};

/** One field: is `current` still the drafted `draft`? */
export const isDrafted = (
  draft: string | null | undefined,
  current: string | null | undefined,
): boolean =>
  draft !== null &&
  draft !== undefined &&
  draft.trim() !== "" &&
  current !== null &&
  current !== undefined &&
  same(draft, current);
