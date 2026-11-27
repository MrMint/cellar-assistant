/**
 * The recipe editor's model (X15): what the form holds, how a stored recipe
 * becomes one, and how one becomes the three writes that save it.
 *
 * Pure, so every rule here is a unit test rather than a browser session:
 *
 * - **An AI match is a proposal until the person says so** (D6: Accept /
 *   Reject is the universal "confirm the AI" control). A draft's catalog
 *   matches arrive `suggested`; Keep makes one `confirmed`, Not this drops it
 *   and the line becomes a plain ingredient by name. Save is never blocked by a
 *   suggestion ({@link pendingMatches} only counts them); an unchecked one
 *   saves as the words, so nothing the model chose is published without a tap.
 * - **A line that kept its identity keeps its row's facts.** Kind, role, the
 *   numeric quantity and the generic item's id survive a save untouched; a
 *   line whose name or amount changed sends what the person typed and lets
 *   the server infer the rest (`RecipeActor.setIngredients`).
 * - **Nothing is invented on the way out.** A typed line becomes a generic
 *   ingredient by its name — `kind: "ingredient"` unless it already had one —
 *   never a guessed catalog item.
 */

import {
  type BarKind,
  type IngredientRole,
  isBarKind,
  isIngredientRole,
} from "@cellar-assistant/contracts/bar";

export const RECIPE_PRIVACIES = ["PRIVATE", "FRIENDS", "PUBLIC"] as const;
export type RecipePrivacy = (typeof RECIPE_PRIVACIES)[number];

/** The six item types an ingredient can name, plus a generic ingredient. */
export type IngredientRefType =
  | "WINE"
  | "BEER"
  | "SPIRIT"
  | "COFFEE"
  | "SAKE"
  | "TEA"
  | "GENERIC";

export type GenericItemKind =
  | "beer"
  | "coffee"
  | "ingredient"
  | "sake"
  | "spirit"
  | "tea"
  | "wine";

/** A catalog item the line is matched to, and whether the person agreed. */
export type IngredientMatch = {
  readonly type: Exclude<IngredientRefType, "GENERIC">;
  readonly id: string;
  /** The item's own name ("Tanqueray London Dry Gin"). */
  readonly label: string;
  readonly state: "suggested" | "confirmed";
};

/** The generic item the line already points at, if it does. */
export type GenericRef = {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly kind: GenericItemKind;
};

/** What the stored row said, so an unchanged line writes it back as it was. */
export type StoredLine = {
  readonly name: string;
  readonly amount: string;
  readonly quantity: number | null;
  readonly unit: string | null;
  readonly quantityText: string | null;
  readonly role: string | null;
  readonly kind: string | null;
  readonly brandMentioned: string | null;
  readonly substitutionNotes: string | null;
};

export type DraftIngredient = {
  /** Stable React key; a row id when it came from the server. */
  readonly key: string;
  readonly amount: string;
  readonly name: string;
  readonly isOptional: boolean;
  readonly match: IngredientMatch | null;
  readonly generic: GenericRef | null;
  /** A short name the bar vocabulary gives the line ("Gin"), if any. */
  readonly kindLabel: string | null;
  readonly stored: StoredLine | null;
};

export type DraftStep = {
  readonly key: string;
  readonly text: string;
  /** The stored step's other columns, kept while its text is unchanged. */
  readonly stored: {
    readonly text: string;
    readonly instructionType: string | null;
    readonly equipmentNeeded: string | null;
    readonly timeMinutes: number | null;
  } | null;
};

export type RecipeForm = {
  readonly name: string;
  readonly type: "cocktail" | "food";
  readonly description: string;
  readonly privacy: RecipePrivacy;
  readonly ingredients: readonly DraftIngredient[];
  readonly steps: readonly DraftStep[];
};

let counter = 0;
/** A key for a row the person added; never sent to the server. */
export const newKey = (prefix: string): string => {
  counter += 1;
  return `${prefix}-new-${counter}`;
};

export const emptyIngredient = (): DraftIngredient => ({
  key: newKey("ingredient"),
  amount: "",
  name: "",
  isOptional: false,
  match: null,
  generic: null,
  kindLabel: null,
  stored: null,
});

export const emptyStep = (): DraftStep => ({
  key: newKey("step"),
  text: "",
  stored: null,
});

/** A blank recipe for Type: private first (D22), one empty line of each. */
export const blankForm = (): RecipeForm => ({
  name: "",
  type: "cocktail",
  description: "",
  privacy: "PRIVATE",
  ingredients: [emptyIngredient()],
  steps: [emptyStep()],
});

/* -------------------------------------------------------------------------- */
/* From the server                                                             */
/* -------------------------------------------------------------------------- */

/** The ingredient fields `RecipeEditQuery` selects, as the editor reads them. */
export type ServerIngredient = {
  readonly id: string;
  readonly quantity: number | null;
  readonly unit: string | null;
  readonly quantityText: string | null;
  readonly amount: string;
  readonly isOptional: boolean;
  readonly substitutionNotes: string | null;
  readonly role: string | null;
  readonly kind: string | null;
  readonly kindLabel: string | null;
  readonly brandMentioned: string | null;
  readonly item: {
    readonly id: string;
    readonly name: string;
    readonly type: string;
  } | null;
  readonly genericItem: {
    readonly id: string;
    readonly name: string;
    readonly category: string;
    readonly kind: string;
  } | null;
};

export type ServerStep = {
  readonly id: string;
  readonly instructionText: string;
  readonly instructionType: string | null;
  readonly equipmentNeeded: string | null;
  readonly timeMinutes: number | null;
};

export type ServerRecipe = {
  readonly name: string;
  readonly type: string;
  readonly description: string | null;
  readonly privacy: string;
  readonly isDraft: boolean;
  readonly ingredients: readonly ServerIngredient[];
  readonly steps: readonly ServerStep[];
};

const ITEM_TYPES = new Set(["WINE", "BEER", "SPIRIT", "COFFEE", "SAKE", "TEA"]);
const GENERIC_KINDS = new Set<string>([
  "beer",
  "coffee",
  "ingredient",
  "sake",
  "spirit",
  "tea",
  "wine",
]);

const asPrivacy = (value: string): RecipePrivacy =>
  (RECIPE_PRIVACIES as readonly string[]).includes(value)
    ? (value as RecipePrivacy)
    : "PRIVATE";

const asGenericKind = (value: string): GenericItemKind =>
  GENERIC_KINDS.has(value) ? (value as GenericItemKind) : "ingredient";

/**
 * A stored recipe as the form. A **draft**'s catalog matches are the model's
 * and arrive `suggested`; a published recipe's were accepted when it was
 * saved, and arrive `confirmed`.
 */
export const formFromRecipe = (recipe: ServerRecipe): RecipeForm => ({
  name: recipe.name,
  type: recipe.type === "food" ? "food" : "cocktail",
  description: recipe.description ?? "",
  privacy: asPrivacy(recipe.privacy),
  ingredients: recipe.ingredients.map((row): DraftIngredient => {
    const item =
      row.item !== null && ITEM_TYPES.has(row.item.type) ? row.item : null;
    const name = item?.name ?? row.genericItem?.name ?? "";
    return {
      key: row.id,
      amount: row.amount,
      name,
      isOptional: row.isOptional,
      match:
        item === null
          ? null
          : {
              type: item.type as IngredientMatch["type"],
              id: item.id,
              label: item.name,
              state: recipe.isDraft ? "suggested" : "confirmed",
            },
      generic:
        row.genericItem === null
          ? null
          : {
              id: row.genericItem.id,
              name: row.genericItem.name,
              category: row.genericItem.category,
              kind: asGenericKind(row.genericItem.kind),
            },
      kindLabel: row.kindLabel,
      stored: {
        name,
        amount: row.amount,
        quantity: row.quantity,
        unit: row.unit,
        quantityText: row.quantityText,
        role: row.role,
        kind: row.kind,
        brandMentioned: row.brandMentioned,
        substitutionNotes: row.substitutionNotes,
      },
    };
  }),
  steps: recipe.steps.map((step) => ({
    key: step.id,
    text: step.instructionText,
    stored: {
      text: step.instructionText,
      instructionType: step.instructionType,
      equipmentNeeded: step.equipmentNeeded,
      timeMinutes: step.timeMinutes,
    },
  })),
});

/* -------------------------------------------------------------------------- */
/* Match chips                                                                 */
/* -------------------------------------------------------------------------- */

/** Keep the AI's match. */
export const confirmMatch = (line: DraftIngredient): DraftIngredient =>
  line.match === null
    ? line
    : { ...line, match: { ...line.match, state: "confirmed" } };

/**
 * Not this one: the line stops naming the catalog item and becomes an
 * ingredient by name — the bar vocabulary's word for it ("Gin") when there
 * is one, which is what the photo said far more often than the brand the
 * search found; otherwise the item's name, for the person to edit.
 */
export const rejectMatch = (line: DraftIngredient): DraftIngredient =>
  line.match === null
    ? line
    : {
        ...line,
        match: null,
        name:
          line.kindLabel !== null && line.kindLabel.trim() !== ""
            ? line.kindLabel
            : line.name,
      };

/** Keep every match still waiting — one deliberate tap for the lot. */
export const confirmAllMatches = (form: RecipeForm): RecipeForm => ({
  ...form,
  ingredients: form.ingredients.map(confirmMatch),
});

/** How many AI matches still wait on Keep or Not this. */
export const pendingMatches = (form: RecipeForm): number =>
  form.ingredients.filter((line) => line.match?.state === "suggested").length;

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

export const NAME_MAX = 300;
export const AMOUNT_MAX = 80;

export type FormProblem =
  | { readonly field: "name"; readonly message: string }
  | { readonly field: "ingredients"; readonly message: string };

/** Lines with something in them; blank rows are the form's, not the recipe's. */
export const filledIngredients = (form: RecipeForm) =>
  form.ingredients.filter(
    (line) => line.name.trim() !== "" || line.match !== null,
  );

export const filledSteps = (form: RecipeForm) =>
  form.steps.filter((step) => step.text.trim() !== "");

/** What stops a save, in the order the person meets it on the page. */
export const formProblems = (form: RecipeForm): FormProblem[] => {
  const problems: FormProblem[] = [];
  const name = form.name.trim();
  if (name === "") {
    problems.push({ field: "name", message: "Give the recipe a name." });
  } else if (name.length > NAME_MAX) {
    problems.push({
      field: "name",
      message: `Keep the name under ${NAME_MAX} characters.`,
    });
  }
  if (filledIngredients(form).length === 0) {
    problems.push({
      field: "ingredients",
      message: "Add at least one ingredient.",
    });
  }
  if (form.ingredients.some((line) => line.amount.trim().length > AMOUNT_MAX)) {
    problems.push({
      field: "ingredients",
      message: `Keep each amount under ${AMOUNT_MAX} characters.`,
    });
  }
  return problems;
};

/* -------------------------------------------------------------------------- */
/* To the server                                                               */
/* -------------------------------------------------------------------------- */

/** `RecipeIngredientInput`, as `setRecipeIngredients` takes it. */
export type IngredientInput = {
  ref?: { type: IngredientRefType; id: string };
  newGenericItem?: {
    name: string;
    category: string;
    kind: GenericItemKind;
  };
  quantity: number | null;
  unit: string | null;
  quantityText: string | null;
  isOptional: boolean;
  role: IngredientRole | null;
  kind: BarKind | null;
  brandMentioned: string | null;
  substitutionNotes: string | null;
};

/** `recipe_instructions.instruction_type`'s six values. */
const INSTRUCTION_TYPES = [
  "chill",
  "cook",
  "garnish",
  "mix",
  "prep",
  "serve",
] as const;
type InstructionType = (typeof INSTRUCTION_TYPES)[number];
const asInstructionType = (value: string | null): InstructionType | null =>
  (INSTRUCTION_TYPES as readonly (string | null)[]).includes(value)
    ? (value as InstructionType)
    : null;

export type StepInput = {
  instructionText: string;
  instructionType: InstructionType | null;
  equipmentNeeded: string | null;
  timeMinutes: number | null;
};

/**
 * The complete ingredient list (`setRecipeIngredients` replaces it).
 * Call only when {@link formProblems} is empty: a still-`suggested` match is
 * written as a plain ingredient here, never as the model's choice.
 */
export const ingredientInputs = (form: RecipeForm): IngredientInput[] =>
  filledIngredients(form).map((line): IngredientInput => {
    const name = line.name.trim();
    const amount = line.amount.trim();
    const stored = line.stored;
    const sameAmount = stored !== null && stored.amount.trim() === amount;
    const confirmed =
      line.match !== null && line.match.state === "confirmed"
        ? line.match
        : null;
    // The identity is the same row's when the line still names what it
    // named: the confirmed item, or the generic item under the same name.
    const sameIdentity =
      stored !== null &&
      (confirmed !== null
        ? true
        : line.generic !== null && line.generic.name === name);
    const source: Pick<IngredientInput, "ref" | "newGenericItem"> =
      confirmed !== null
        ? { ref: { type: confirmed.type, id: confirmed.id } }
        : line.generic !== null && line.generic.name === name
          ? { ref: { type: "GENERIC", id: line.generic.id } }
          : {
              newGenericItem: {
                name,
                category: line.generic?.category ?? "ingredient",
                kind: line.generic?.kind ?? "ingredient",
              },
            };
    return {
      ...source,
      quantity: sameAmount ? stored.quantity : null,
      unit: sameAmount ? stored.unit : null,
      quantityText: amount === "" ? null : amount,
      isOptional: line.isOptional,
      // Only a value the vocabulary knows goes back; anything else is left
      // for the server to infer rather than refused.
      role: sameIdentity && isIngredientRole(stored.role) ? stored.role : null,
      kind: sameIdentity && isBarKind(stored.kind) ? stored.kind : null,
      brandMentioned: sameIdentity ? stored.brandMentioned : null,
      substitutionNotes: stored?.substitutionNotes ?? null,
    };
  });

/** The complete method (`setRecipeInstructions` numbers it 1..n). */
export const stepInputs = (form: RecipeForm): StepInput[] =>
  filledSteps(form).map((step) => {
    const text = step.text.trim();
    const kept = step.stored !== null && step.stored.text.trim() === text;
    return {
      instructionText: text,
      instructionType: kept
        ? asInstructionType(step.stored?.instructionType ?? null)
        : null,
      equipmentNeeded: kept ? (step.stored?.equipmentNeeded ?? null) : null,
      timeMinutes: kept ? (step.stored?.timeMinutes ?? null) : null,
    };
  });

/** The recipe row's own fields, for `createRecipe` / `updateRecipe`. */
export const recipeFields = (form: RecipeForm) => ({
  name: form.name.trim(),
  type: form.type,
  description: form.description.trim() === "" ? null : form.description.trim(),
  privacy: form.privacy,
});

/**
 * The `createRecipe` input for a new recipe: always **Private**, whatever
 * the form says. A save is several writes (recipe, ingredients, method), and
 * a recipe shared before its ingredients are written would be a half-written
 * recipe other people can open if a later write fails. The chosen privacy is
 * applied by {@link widenAfterCreate}, after the rest has landed — the same
 * "publish last" rule a draft follows.
 */
export const createFields = (form: RecipeForm) => ({
  ...recipeFields(form),
  privacy: "PRIVATE" as const,
});

/** Whether a new recipe still needs its privacy set once everything else is written. */
export const widenAfterCreate = (form: RecipeForm): boolean =>
  form.privacy !== "PRIVATE";

/* -------------------------------------------------------------------------- */
/* Words                                                                       */
/* -------------------------------------------------------------------------- */

/** Who sees it, in a sentence (the privacy control's helper line). */
export const PRIVACY_COPY: Readonly<
  Record<RecipePrivacy, { label: string; line: string }>
> = {
  PRIVATE: { label: "Private", line: "Only you can see this recipe." },
  FRIENDS: {
    label: "Friends",
    line: "You and your friends can see this recipe.",
  },
  PUBLIC: {
    label: "Public",
    line: "Anyone can see it, and you can share a link to it.",
  },
};

/** Who sees a recipe, in the rows' and the page's words ("Everyone · 3 ingredients"). */
export const PRIVACY_WHO: Readonly<Record<RecipePrivacy, string>> = {
  PRIVATE: "Only you",
  FRIENDS: "Friends",
  PUBLIC: "Everyone",
};
