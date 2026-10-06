/**
 * Merging a model's proposal into a form someone is already typing in — E2c.
 *
 * ## The three things this exists to stop
 *
 * `ItemOnboardingWizard` opened a session on mount and, 10–30 seconds later,
 * wrote the model's answer into the form with `setValues`. Three separate
 * defects lived in those few lines:
 *
 * 1. **It overwrote typed input.** `name`, `description`, `country` and
 *    `brandName` took the model's value whenever the model had one, and
 *    `attributes` was replaced *wholesale* — so a vintage and a style the user
 *    had already picked were dropped on the floor by an answer that mentioned
 *    neither. The user is typing during exactly the window the call takes.
 * 2. **It read the per-type attributes from the wrong place.** The output
 *    schema nests them in a bag (`defaults.wine.vintage` —
 *    `ITEM_ATTRIBUTE_KEY`); the wizard read `defaults.vintage`. So the two
 *    fields the save error goes on to complain about were *never* pre-filled,
 *    even when the model returned both. Measured against the running Ollama:
 *    `{"name":"…","wine":{"vintage":"2018","style":"Red Wine"}}` filled in
 *    nothing, and then the form said "Vintage is required".
 * 3. **It silently dropped what it could not use.** `wines.vintage` is a `date`
 *    column, so the field is `<input type="date">` and wants `YYYY-MM-DD`; the
 *    model answers `"2018"`. Assigning that to a date input leaves it visibly
 *    empty while the state says otherwise, which is how a form comes to
 *    contradict its own error message.
 *
 * A fourth turned up once the first three were closed, and it is the same shape
 * as (3) with no syntax to catch it: **a value the picker cannot offer.**
 * `reference` and `static` fields are an `Autocomplete` over a fixed list, and
 * `"yuki_hie"` — a perfectly legal `sake_serving_temperature` label, and one the
 * model may now propose because X1b constrains it to the full enum — was not in
 * `STATIC_OPTIONS`. Written into state, it left a control the user cannot
 * re-pick backing a field the form believes is filled. See
 * {@link MergeInput.allowedValues}.
 *
 * ## The rule
 *
 * **Fill-empty-only, and say what you did not fill.** A field the user has
 * touched is never written, a field that already has a value is never
 * overwritten, and a proposal that a field cannot hold is not written either —
 * but every proposal that was not applied comes back in `skipped` with a
 * reason, so the wizard can show it rather than the user discovering it in a
 * validation message. Nothing is dropped quietly; that is the half that makes
 * the UI stop lying.
 *
 * ## Why it lives in `src/lib` and takes its field list as an argument
 *
 * `bun run test:unit` runs `bun test` over `src/lib` only. The original reason
 * for the shape below was that the runner had no bundler: under `node --test`
 * an import of `@/…` failed outright with ERR_MODULE_NOT_FOUND, because Node
 * does not read `tsconfig.json`'s `paths`. **That half of the reason is gone** —
 * measured on the bun 1.4.2 migration, `bun test` does resolve `@/…` from
 * `compilerOptions.paths`, so a test here could now import across the alias.
 *
 * The shape stays anyway, for the half that still holds: taking the fields as a
 * parameter (the wizard passes `ITEM_FORM_RULES[type].attributes`) keeps this
 * module free of any dependency on the form layer, so the test exercises the
 * merge and not a form config. Reaching through `@/` because the runner now
 * permits it would couple a `src/lib` module to `src/components`, which is the
 * coupling this parameter exists to avoid.
 */

/** Just enough of `AttributeField` to know what the input can hold. */
export type ExtractionField = {
  readonly key: string;
  readonly label: string;
  readonly kind:
    | "text"
    | "number"
    | "date"
    | "year"
    | "boolean"
    | "reference"
    | "static";
  /**
   * For `kind: "static"` — the key into `STATIC_OPTIONS`. Carried here only so
   * that {@link MergeInput.allowedValues} can look the picker's list up; this
   * module never reads the table itself.
   */
  readonly options?: string;
};

/** The shape `ItemFields` edits. Structurally `ItemFieldValues`. */
export type ExtractionValues = {
  readonly name: string;
  readonly description: string;
  readonly country: string;
  readonly brandName: string;
  readonly attributes: Readonly<Record<string, string>>;
};

export type Proposal = {
  /** `name`, `country`, … or `attributes.vintage`. Matches `edited`'s keys. */
  readonly path: string;
  readonly label: string;
  readonly value: string;
};

export type SkippedProposal = Proposal & {
  /** `kept` — you had already filled it in. `unusable` — the field can't hold it. */
  readonly reason: "kept" | "unusable";
  readonly detail: string;
};

export type MergeResult = {
  readonly values: ExtractionValues;
  readonly applied: readonly Proposal[];
  readonly skipped: readonly SkippedProposal[];
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const YEAR = /^\d{4}$/;

const asText = (value: unknown): string | null => {
  if (typeof value === "string") return value.trim() === "" ? null : value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  // Tea's `isOrganic`/`isFairTrade` come back as JSON booleans (f3ddd309).
  // The form holds them as "true"/"false" (`attributesFrom`), so they are
  // proposals like any other rather than silently unreadable.
  if (typeof value === "boolean") return String(value);
  return null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** `null` when the field can hold it, a reason when it cannot. */
const unusableBecause = (
  kind: ExtractionField["kind"],
  value: string,
): string | null => {
  if (kind === "date") {
    if (DATE.test(value)) return null;
    return (
      "the column is a date, so the field wants a full YYYY-MM-DD — " +
      "a bare year is not one, and nothing here will invent a month and a day"
    );
  }
  if (kind === "year") {
    return YEAR.test(value) ? null : "the field is a four-digit year";
  }
  if (kind === "number") {
    return Number.isFinite(Number(value)) ? null : "the field is a number";
  }
  if (kind === "boolean") {
    return value === "true" || value === "false"
      ? null
      : "the field is yes or no";
  }
  return null;
};

export type MergeInput = {
  readonly defaults: unknown;
  /** `ATTRIBUTE_INPUT_KEY[type]` — where the per-type bag lives in the answer. */
  readonly bagKey: string;
  readonly fields: readonly ExtractionField[];
  readonly current: ExtractionValues;
  /** Paths the person has typed in. Never written, even when empty. */
  readonly edited: ReadonlySet<string>;
  /**
   * What a picker-backed field will actually accept, or `null` for "not known
   * here, do not judge it".
   *
   * The fourth E2c failure, and the one the other three did not cover. The
   * three above are about *where* a value goes; this is about a value the field
   * cannot represent at all. `ItemFields` renders `reference` and `static`
   * fields as an `Autocomplete` over a fixed list, so a value outside that list
   * is a control that shows something nobody can re-pick, backed by state that
   * says the field is filled. It is exactly the "silently dropped what it could
   * not use" defect, for the two kinds `unusableBecause` has no syntax to check.
   *
   * Reachable, not theoretical: X1b constrains the model to
   * `SAKE_SERVING_TEMPERATURES`' nine labels and `STATIC_OPTIONS` offered seven,
   * so `yuki_hie` passed the server's `requireInVocabulary` and landed in a
   * picker with no such option. That gap is fixed; the check is here because the
   * *next* one will not be found by reading either list.
   *
   * `null` is the honest answer for `reference` fields at the moment the merge
   * runs — their options come from `ReferenceOptionsQuery`, which the wizard
   * does not hold — and for the top-level `country` for the same reason. An
   * unknown vocabulary must not manufacture a rejection.
   */
  readonly allowedValues?: (field: ExtractionField) => readonly string[] | null;
};

/**
 * The model's answer, merged into what is on screen.
 *
 * `defaults` is whatever `ItemOnboarding.defaults` held — the actor stores the
 * completion verbatim, so its shape belongs to the prompt and anything that is
 * not an object is ignored rather than trusted.
 */
export const mergeExtractedDefaults = (input: MergeInput): MergeResult => {
  const { allowedValues, bagKey, current, edited, fields } = input;
  if (!isRecord(input.defaults)) {
    return { values: current, applied: [], skipped: [] };
  }
  const bag = input.defaults;
  const attributeBag = isRecord(bag[bagKey]) ? bag[bagKey] : {};

  const applied: Proposal[] = [];
  const skipped: SkippedProposal[] = [];

  /** Decide one field. Returns the value to write, or `null` to leave it. */
  const consider = (
    path: string,
    label: string,
    proposed: unknown,
    existing: string,
    kind: ExtractionField["kind"],
    allowed: readonly string[] | null,
  ): string | null => {
    const value = asText(proposed);
    if (value === null) return null;
    if (edited.has(path) || existing.trim() !== "") {
      skipped.push({
        path,
        label,
        value,
        reason: "kept",
        detail: "kept what you entered",
      });
      return null;
    }
    const unusable =
      allowed !== null && !allowed.includes(value)
        ? `the field is a picker over ${allowed.length} values and that is ` +
          "not one of them, so choosing it back would be impossible"
        : unusableBecause(kind, value);
    if (unusable !== null) {
      skipped.push({
        path,
        label,
        value,
        reason: "unusable",
        detail: unusable,
      });
      return null;
    }
    applied.push({ path, label, value });
    return value;
  };

  const top = (
    path: "name" | "description" | "country" | "brandName",
    label: string,
  ): string =>
    // `null`: `country` is a reference picker whose options are not loaded here.
    consider(path, label, bag[path], current[path], "text", null) ??
    current[path];

  const attributes: Record<string, string> = { ...current.attributes };
  for (const field of fields) {
    const path = `attributes.${field.key}`;
    // The bag is where the schema puts these. The flat fall-back is for a
    // provider that ignores the nesting — cheaper than losing the value.
    const proposed = attributeBag[field.key] ?? bag[field.key];
    const next = consider(
      path,
      field.label,
      proposed,
      attributes[field.key] ?? "",
      field.kind,
      allowedValues?.(field) ?? null,
    );
    if (next !== null) attributes[field.key] = next;
  }

  return {
    values: {
      name: top("name", "Name"),
      description: top("description", "Description"),
      country: top("country", "Country"),
      brandName: top("brandName", "Brand"),
      attributes,
    },
    applied,
    skipped,
  };
};

/** Which paths differ between two form states — what the person just edited. */
export const editedPaths = (
  before: ExtractionValues,
  after: ExtractionValues,
): readonly string[] => {
  const changed: string[] = [];
  for (const key of ["name", "description", "country", "brandName"] as const) {
    if (before[key] !== after[key]) changed.push(key);
  }
  // `Array.from` rather than iterating the Set: the root tsconfig's target
  // predates for-of over an iterable (TS2802).
  const keys = Array.from(
    new Set([
      ...Object.keys(before.attributes),
      ...Object.keys(after.attributes),
    ]),
  );
  for (const key of keys) {
    if ((before.attributes[key] ?? "") !== (after.attributes[key] ?? "")) {
      changed.push(`attributes.${key}`);
    }
  }
  return changed;
};
