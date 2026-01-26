-- Remove index
DROP INDEX IF EXISTS idx_recipe_groups_canonical_recipe;

-- Remove foreign key constraint
ALTER TABLE recipe_groups
DROP CONSTRAINT IF EXISTS recipe_groups_canonical_recipe_id_fkey;

-- Remove column
ALTER TABLE recipe_groups
DROP COLUMN IF EXISTS canonical_recipe_id;
