-- Rollback: Remove created_by_id from community tables

-- Drop indexes
DROP INDEX IF EXISTS public.idx_recipes_created_by;
DROP INDEX IF EXISTS public.idx_recipe_groups_created_by;
DROP INDEX IF EXISTS public.idx_generic_items_created_by;

-- Remove columns
ALTER TABLE public.recipes
DROP COLUMN IF EXISTS created_by_id;

ALTER TABLE public.recipe_groups
DROP COLUMN IF EXISTS created_by_id;

ALTER TABLE public.generic_items
DROP COLUMN IF EXISTS created_by_id;
