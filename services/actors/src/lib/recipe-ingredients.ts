/**
 * A `recipe_ingredients` row as the wire carries it — shared by its writer,
 * `RecipeActor`, and by `RecipeGroupsCollectionActor.ingredientUses` (UI parity
 * G11), which reads the same rows from the other end: by the item they name.
 *
 * Moved out of `recipe-actor.ts` rather than exported from it so a collection
 * actor does not import an entity actor's module.
 *
 * ## X14: kind and role, stored or inferred
 *
 * `role` and `kind` are new columns, and every recipe written before them has
 * both null. Rather than leave those recipes dark until a backfill runs, a
 * read derives them: {@link loadIngredientFacts} reads the referenced item's or
 * generic item's name (and a spirit's type, a wine's style), and
 * `inferIngredientMeta` (contracts `bar.ts`) turns the recipe's facts into a
 * kind and a role per row, keeping anything stored. The backfill
 * (`RecipeActor.backfillIngredientMeta`) persists exactly the same answer.
 */
import type {
  InferredIngredientMeta,
  IngredientFacts,
  RecipeIngredientDto,
  RecipeIngredientRef,
} from "@cellar-assistant/contracts";
import {
  ConflictError,
  inferIngredientMeta,
  isBarKind,
  isIngredientRole,
} from "@cellar-assistant/contracts";
import type { recipeIngredients } from "@cellar-assistant/db";
import { genericItems, spirits, wines } from "@cellar-assistant/db";
import { inArray } from "@cellar-assistant/db/orm";
import type { DbOrTx } from "./db.ts";
import { ARCS } from "./item-arcs.ts";
import { ITEM_TABLES } from "./item-bindings.ts";

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

/**
 * The wire shape. `meta` is the inferred kind/role for this row (see the
 * module doc); without it the DTO carries only what is stored.
 */
export const ingredientRowToDto = (
  row: RecipeIngredientRow,
  meta?: InferredIngredientMeta,
): RecipeIngredientDto => {
  const storedKind = isBarKind(row.kind) ? row.kind : null;
  const storedRole = isIngredientRole(row.role) ? row.role : null;
  return {
    id: row.id,
    recipeId: row.recipeId,
    ref: ingredientRefOf(row),
    quantity: numberOrNull(row.quantity),
    unit: row.unit,
    isOptional: row.isOptional ?? false,
    substitutionNotes: row.substitutionNotes,
    createdAt: iso(row.createdAt),
    role: storedRole ?? meta?.role ?? null,
    kind: storedKind ?? meta?.kind ?? null,
    quantityText: row.quantityText,
    brandMentioned: row.brandMentioned,
  };
};

/** What one referenced row says about itself. */
type RefFacts = {
  readonly name: string;
  readonly spiritType?: string | null;
  readonly wineStyle?: string | null;
  readonly genericCategory?: string | null;
};

const refKey = (ref: RecipeIngredientRef): string => `${ref.type}:${ref.id}`;

/**
 * The facts behind each row's reference — name, a spirit's type, a wine's
 * style, a generic item's category — in **one select per referenced table**,
 * skipped for a table no row names. Keyed by row id.
 *
 * A read of other actors' tables (`spirits`, `generic_items`, …), which any
 * actor may do (§1.1) and none may cache: the caller uses the answer for the
 * turn in hand.
 */
export const loadIngredientFacts = async (
  db: DbOrTx,
  rows: readonly RecipeIngredientRow[],
): Promise<Map<string, IngredientFacts>> => {
  const idsByType = new Map<RecipeIngredientRef["type"], string[]>();
  for (const row of rows) {
    const ref = ingredientRefOf(row);
    const ids = idsByType.get(ref.type) ?? [];
    ids.push(ref.id);
    idsByType.set(ref.type, ids);
  }

  const facts = new Map<string, RefFacts>();
  for (const [type, ids] of idsByType) {
    if (type === "GENERIC") {
      const found = await db
        .select({
          id: genericItems.id,
          name: genericItems.name,
          category: genericItems.category,
          subcategory: genericItems.subcategory,
        })
        .from(genericItems)
        .where(inArray(genericItems.id, ids));
      for (const row of found) {
        facts.set(refKey({ type, id: row.id }), {
          name: row.name,
          // Both, most specific first: the seed's "Bourbon" is category
          // "spirit", subcategory "whiskey".
          genericCategory: [row.subcategory, row.category]
            .filter((part): part is string => part !== null)
            .join(" "),
        });
      }
    } else if (type === "SPIRIT") {
      const found = await db
        .select({ id: spirits.id, name: spirits.name, type: spirits.type })
        .from(spirits)
        .where(inArray(spirits.id, ids));
      for (const row of found) {
        facts.set(refKey({ type, id: row.id }), {
          name: row.name,
          spiritType: row.type,
        });
      }
    } else if (type === "WINE") {
      const found = await db
        .select({ id: wines.id, name: wines.name, style: wines.style })
        .from(wines)
        .where(inArray(wines.id, ids));
      for (const row of found) {
        facts.set(refKey({ type, id: row.id }), {
          name: row.name,
          wineStyle: row.style,
        });
      }
    } else {
      const table = ITEM_TABLES[type];
      const found = await db
        .select({ id: table.id, name: table.name })
        .from(table)
        .where(inArray(table.id, ids));
      for (const row of found) {
        facts.set(refKey({ type, id: row.id }), { name: row.name });
      }
    }
  }

  const byRow = new Map<string, IngredientFacts>();
  for (const row of rows) {
    const ref = ingredientRefOf(row);
    const found = facts.get(refKey(ref));
    byRow.set(row.id, {
      name: found?.name ?? null,
      refType: ref.type,
      brandMentioned: row.brandMentioned,
      genericCategory: found?.genericCategory ?? null,
      spiritType: found?.spiritType ?? null,
      wineStyle: found?.wineStyle ?? null,
      quantity: numberOrNull(row.quantity),
      unit: row.unit,
      isOptional: row.isOptional ?? false,
      kind: row.kind,
      role: row.role,
    });
  }
  return byRow;
};

/**
 * Kind and role for every row of **one recipe**, stored values kept, keyed by
 * row id. `rows` must be the whole recipe: a role is relative to its siblings.
 */
export const inferRecipeMeta = async (
  db: DbOrTx,
  rows: readonly RecipeIngredientRow[],
): Promise<Map<string, InferredIngredientMeta>> => {
  const facts = await loadIngredientFacts(db, rows);
  const ordered = rows.map(
    (row) => facts.get(row.id) ?? { name: null, refType: "GENERIC" },
  );
  const meta = inferIngredientMeta(ordered);
  return new Map(
    rows.map((row, index) => [
      row.id,
      meta[index] ?? { kind: null, role: null },
    ]),
  );
};
