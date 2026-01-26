-- Rollback recipe_vectors table creation

-- Drop the distance calculation function
DROP FUNCTION IF EXISTS public.calculate_recipe_vector_distance(recipe_vectors, halfvec(768));

-- Drop the updated_at trigger and function
DROP TRIGGER IF EXISTS update_recipe_vectors_updated_at ON "public"."recipe_vectors";
DROP FUNCTION IF EXISTS update_recipe_vectors_updated_at();

-- Drop the table (indexes and constraints are dropped automatically)
DROP TABLE IF EXISTS "public"."recipe_vectors";
