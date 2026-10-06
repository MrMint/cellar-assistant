/**
 * A `recipe_ingredients` row as the wire carries it — shared by its writer,
 * `RecipeActor`, and by `RecipeGroupsCollectionActor.ingredientUses` (UI parity
 * G11), which reads the same rows from the other end: by the item they name.
 *
 * Moved out of `recipe-actor.ts` rather than exported from it so a collection
 * actor does not import an entity actor's module.
 */
import type {
  RecipeIngredientDto,
  RecipeIngredientRef,
} from "@cellar-assistant/contracts";
import { ConflictError } from "@cellar-assistant/contracts";
import type { recipeIngredients } from "@cellar-assistant/db";
import { ARCS } from "./item-arcs.ts";

export type RecipeIngredientRow = typeof recipeIngredients.$inferSelect;

const INGREDIENTS = ARCS.recipeIngredients;

const iso = (value: Date | null): string | null =>
  value === null ? null : value.toISOString();

const numberOrNull = (value: string | number | null): number | null =>
  value === null ? null : Number(value);

/** The one non-null FK column of an ingredient row, as a typed ref. */
export const ingredientRefOf = (
  row: RecipeIngredientRow,
): RecipeIngredientRef => {
  if (row.genericItemId !== null) {
    return { type: "GENERIC", id: row.genericItemId };
  }
  const item = INGREDIENTS.refOf(row);
  if (item !== null) return item;
  throw new ConflictError(
    `recipe_ingredient ${row.id} has no reference; ` +
      "exactly_one_item_reference should make this unreachable",
  );
};

export const ingredientRowToDto = (
  row: RecipeIngredientRow,
): RecipeIngredientDto => ({
  id: row.id,
  recipeId: row.recipeId,
  ref: ingredientRefOf(row),
  quantity: numberOrNull(row.quantity),
  unit: row.unit,
  isOptional: row.isOptional ?? false,
  substitutionNotes: row.substitutionNotes,
  createdAt: iso(row.createdAt),
});
