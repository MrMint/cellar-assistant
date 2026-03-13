-- Revert place_vectors from halfvec(768) back to halfvec(3072)
-- Reverses the Gemini Embedding 2 standardization

-- Drop the 768-dimension distance function
DROP FUNCTION IF EXISTS public.calculate_place_vector_distance(place_vectors, halfvec(768));

-- Drop the 768-dimension HNSW indexes
DROP INDEX IF EXISTS "public"."idx_place_vectors_hnsw";
DROP INDEX IF EXISTS "public"."idx_place_vectors_hnsw_l2";

-- Revert the vector column back to halfvec(3072)
ALTER TABLE "public"."place_vectors"
ALTER COLUMN "vector" TYPE halfvec(3072) USING vector::halfvec(3072);

-- Recreate HNSW index for cosine similarity search (3072 dimensions)
CREATE INDEX "idx_place_vectors_hnsw" ON "public"."place_vectors"
USING hnsw ("vector" halfvec_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Recreate HNSW index for L2 distance search (3072 dimensions)
CREATE INDEX "idx_place_vectors_hnsw_l2" ON "public"."place_vectors"
USING hnsw ("vector" halfvec_l2_ops)
WITH (m = 16, ef_construction = 64);

-- Recreate the distance calculation function with halfvec(3072) signature
CREATE OR REPLACE FUNCTION public.calculate_place_vector_distance(place_vector place_vectors, search halfvec(3072))
RETURNS double precision
LANGUAGE sql
STABLE
AS $function$
  SELECT place_vector.vector <=> search
$function$;

-- Grant execute permissions to nhost_hasura
GRANT EXECUTE ON FUNCTION public.calculate_place_vector_distance TO nhost_hasura;

-- Restore original table and column comments
COMMENT ON TABLE "public"."place_vectors" IS 'Stores halfvec(3072) embeddings for places with HNSW indexing for efficient similarity search';
COMMENT ON COLUMN "public"."place_vectors"."vector" IS 'halfvec(3072) embedding with HNSW index support';
