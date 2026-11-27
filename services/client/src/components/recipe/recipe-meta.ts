/**
 * The words every recipe surface shares: the difficulty labels and the one
 * meta line ("Cocktail · Easy · 5 min"). CROSS-LOT "Recipe difficulty
 * labels": the app's five, in sentence case, everywhere.
 */

export const DIFFICULTY_LABELS = [
  "Very easy",
  "Easy",
  "Medium",
  "Hard",
  "Expert",
] as const;

/** 1 to 5 → its label; anything else is no label. */
export const difficultyLabel = (
  level: number | null | undefined,
): string | null => {
  if (level === null || level === undefined) return null;
  return DIFFICULTY_LABELS[Math.round(level) - 1] ?? null;
};

/** "5 min" (a narrow no-break space before the unit, KIT § 4 Formatting). */
export const minutesLabel = (
  minutes: number | null | undefined,
): string | null =>
  minutes === null || minutes === undefined || minutes <= 0
    ? null
    : `${minutes} min`;

const join = (parts: readonly (string | null | undefined)[]): string =>
  parts
    .filter((part): part is string => part != null && part !== "")
    .join(" · ");

/** The page's meta line: "Cocktail · Easy · 5 min". */
export const recipeMetaLine = ({
  type,
  difficulty,
  minutes,
  serves,
}: {
  type?: string | null;
  difficulty?: number | null;
  minutes?: number | null;
  serves?: number | null;
}): string =>
  join([
    type === "food" ? "Food" : type === "cocktail" ? "Cocktail" : null,
    difficultyLabel(difficulty),
    minutesLabel(minutes),
    serves !== null && serves !== undefined && serves > 1
      ? `Serves ${serves}`
      : null,
  ]);

/** A row's line: "Rum · Easy · 4 min", or "By you · Very easy · 3 min". */
export const recipeRowLine = (
  lead: string | null | undefined,
  difficulty?: number | null,
  minutes?: number | null,
): string => join([lead, difficultyLabel(difficulty), minutesLabel(minutes)]);

/** "1 ingredient" / "3 ingredients". */
export const ingredientsLine = (count: number): string =>
  count === 1 ? "1 ingredient" : `${count} ingredients`;

/** "3 versions" / "1 version". */
export const versionsLine = (count: number): string =>
  count === 1 ? "1 version" : `${count} versions`;
