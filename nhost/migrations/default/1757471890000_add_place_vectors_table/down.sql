-- Rollback place_vectors table creation

-- Drop computed field function
DROP FUNCTION IF EXISTS public.calculate_place_vector_distance(place_vectors, vector(3072));

-- Drop trigger and trigger function
DROP TRIGGER IF EXISTS update_place_vectors_updated_at ON "public"."place_vectors";
DROP FUNCTION IF EXISTS update_place_vectors_updated_at();

-- Drop the table (this will also drop indexes and constraints)
DROP TABLE "public"."place_vectors";