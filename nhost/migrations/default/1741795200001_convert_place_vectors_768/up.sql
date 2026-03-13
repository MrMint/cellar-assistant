-- Convert place_vectors from halfvec(3072) to halfvec(768)
-- Standardizing on 768 dimensions to match Gemini Embedding 2 output
-- Existing vectors will be truncated; all vectors will be regenerated

-- Drop the existing distance function that depends on the vector column type
DROP FUNCTION IF EXISTS public.calculate_place_vector_distance(place_vectors, halfvec(3072));

-- Drop existing HNSW indexes before altering the column
DROP INDEX IF EXISTS "public"."idx_place_vectors_hnsw";
DROP INDEX IF EXISTS "public"."idx_place_vectors_hnsw_l2";

-- Alter the vector column from halfvec(3072) to halfvec(768)
-- Note: existing vector data will be truncated to 768 dimensions;
-- all vectors should be regenerated after this migration
ALTER TABLE "public"."place_vectors"
ALTER COLUMN "vector" TYPE halfvec(768) USING vector::halfvec(768);

-- Recreate HNSW index for cosine similarity search
CREATE INDEX "idx_place_vectors_hnsw" ON "public"."place_vectors"
USING hnsw ("vector" halfvec_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Recreate HNSW index for L2 distance search
CREATE INDEX "idx_place_vectors_hnsw_l2" ON "public"."place_vectors"
USING hnsw ("vector" halfvec_l2_ops)
WITH (m = 16, ef_construction = 64);

-- Recreate the distance calculation function with halfvec(768) signature
CREATE OR REPLACE FUNCTION public.calculate_place_vector_distance(place_vector place_vectors, search halfvec(768))
RETURNS double precision
LANGUAGE sql
STABLE
AS $function$
  SELECT place_vector.vector <=> search
$function$;

-- Grant execute permissions to nhost_hasura
GRANT EXECUTE ON FUNCTION public.calculate_place_vector_distance TO nhost_hasura;

-- Update table and column comments to reflect new dimensions
COMMENT ON TABLE "public"."place_vectors" IS 'Stores halfvec(768) embeddings for places with HNSW indexing for efficient similarity search (Gemini Embedding 2)';
COMMENT ON COLUMN "public"."place_vectors"."vector" IS 'halfvec(768) embedding with HNSW index support';
