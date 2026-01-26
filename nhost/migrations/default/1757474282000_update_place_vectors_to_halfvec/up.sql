-- Update place_vectors table to use halfvec(3072) instead of vector(3072)
-- This enables creation of HNSW indexes for efficient similarity search

-- First, drop the existing function that depends on the vector column
DROP FUNCTION IF EXISTS public.calculate_place_vector_distance(place_vectors, vector(3072));

-- Create a backup of existing data (if any) and convert to halfvec
-- Note: This migration assumes the table is empty or has minimal data
-- For production with large datasets, consider a more careful migration approach

-- Alter the vector column to use halfvec(3072)
ALTER TABLE "public"."place_vectors" 
ALTER COLUMN "vector" TYPE halfvec(3072) USING vector::halfvec(3072);

-- Create HNSW index for efficient similarity search
-- HNSW (Hierarchical Navigable Small World) is optimal for high-dimensional vectors
CREATE INDEX "idx_place_vectors_hnsw" ON "public"."place_vectors" 
USING hnsw ("vector" halfvec_cosine_ops) 
WITH (m = 16, ef_construction = 64);

-- Create additional index for L2 distance if needed
CREATE INDEX "idx_place_vectors_hnsw_l2" ON "public"."place_vectors" 
USING hnsw ("vector" halfvec_l2_ops) 
WITH (m = 16, ef_construction = 64);

-- Recreate the distance calculation function with halfvec support
CREATE OR REPLACE FUNCTION public.calculate_place_vector_distance(place_vector place_vectors, search halfvec(3072))
RETURNS double precision
LANGUAGE sql
STABLE
AS $function$
  SELECT place_vector.vector <=> search
$function$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.calculate_place_vector_distance TO nhost_hasura;

-- Update table comment to reflect the change
COMMENT ON TABLE "public"."place_vectors" IS 'Stores halfvec(3072) embeddings for places with HNSW indexing for efficient similarity search';
COMMENT ON COLUMN "public"."place_vectors"."vector" IS 'halfvec(3072) embedding with HNSW index support';