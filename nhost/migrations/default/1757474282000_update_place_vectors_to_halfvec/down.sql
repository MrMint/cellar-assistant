-- Rollback place_vectors table from halfvec(3072) back to vector(3072)
-- This reverses the HNSW index optimization

-- Drop the function that uses halfvec
DROP FUNCTION IF EXISTS public.calculate_place_vector_distance(place_vectors, halfvec(3072));

-- Drop the HNSW indexes
DROP INDEX IF EXISTS "public"."idx_place_vectors_hnsw";
DROP INDEX IF EXISTS "public"."idx_place_vectors_hnsw_l2";

-- Convert the column back to vector(3072)
-- Note: This will lose the precision benefits of halfvec
ALTER TABLE "public"."place_vectors" 
ALTER COLUMN "vector" TYPE vector(3072) USING vector::vector(3072);

-- Recreate the original distance calculation function with vector support
CREATE OR REPLACE FUNCTION public.calculate_place_vector_distance(place_vector place_vectors, search vector(3072))
RETURNS double precision
LANGUAGE sql
STABLE
AS $function$
  SELECT place_vector.vector <=> search
$function$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.calculate_place_vector_distance TO nhost_hasura;

-- Update table comment to reflect the rollback
COMMENT ON TABLE "public"."place_vectors" IS 'Stores vector(3072) embeddings for places (rolled back from halfvec optimization)';
COMMENT ON COLUMN "public"."place_vectors"."vector" IS 'vector(3072) embedding without HNSW index support';