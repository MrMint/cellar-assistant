-- One vector per recipe, enforced — the recipe half of
-- `20260928043351_item_vectors_one_per_item`.
--
-- `RecipeActor` reads `recipe_vectors` ordered by id and updates the first
-- row, and `RecipeSearchActor` takes `min(distance)` over every row a recipe
-- has, so a second row for one recipe (a placement split-brain double insert:
-- two activations of one recipe, each finding no vector) was never cleaned up
-- and a stale duplicate went on matching searches. With this index the second
-- insert conflicts instead, and `regenerateVector` writes with
-- `ON CONFLICT (recipe_id) DO UPDATE`, so it cannot wedge on that conflict
-- either.
--
-- Before the index, every duplicate for one recipe but the newest is removed
-- — `updated_at` desc, then `id` desc, the same deterministic choice the
-- item_vectors migration made. A vector is derived data: `regenerateVector`
-- rebuilds it from the recipe, so nothing is lost that cannot be recomputed.
-- Measured on cellar-stack before writing this (2026-09-28): 151 rows over
-- 151 distinct recipes, so the delete is a no-op there.
DELETE FROM "recipe_vectors" v
 USING (SELECT id,
               row_number() OVER (
                 PARTITION BY recipe_id
                 ORDER BY updated_at DESC NULLS LAST, id DESC) AS rank
          FROM "recipe_vectors") ranked
 WHERE v.id = ranked.id AND ranked.rank > 1;--> statement-breakpoint
DROP INDEX "idx_recipe_vectors_recipe_id";--> statement-breakpoint
CREATE UNIQUE INDEX "idx_recipe_vectors_recipe_id" ON "recipe_vectors" ("recipe_id");
