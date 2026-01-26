-- Revert recipe_category enum table changes
BEGIN;

-- Drop foreign key constraint
ALTER TABLE "public"."recipe_groups" DROP CONSTRAINT IF EXISTS "recipe_groups_category_fkey";

-- Re-add the check constraint
ALTER TABLE "public"."recipe_groups"
  ADD CONSTRAINT "recipe_groups_category_check"
  CHECK (category = ANY (ARRAY['cocktail'::text, 'mocktail'::text, 'shot'::text, 'punch'::text, 'other'::text]));

-- Drop the enum table
DROP TABLE IF EXISTS "public"."recipe_category";

COMMIT;
