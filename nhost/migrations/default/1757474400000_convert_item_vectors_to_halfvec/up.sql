-- Convert item_vectors table from vector(768) to halfvec(768) for better indexing performance
-- This migration preserves all existing data while converting vector types

-- Step 1: Add new halfvec column
ALTER TABLE item_vectors ADD COLUMN vector_halfvec halfvec(768);

-- Step 2: Convert existing vector data to halfvec format
UPDATE item_vectors SET vector_halfvec = vector::halfvec;

-- Step 3: Drop the old vector column
ALTER TABLE item_vectors DROP COLUMN vector;

-- Step 4: Rename the new column to vector
ALTER TABLE item_vectors RENAME COLUMN vector_halfvec TO vector;

-- Step 5: Update the calculate_vector_distance function to work with halfvec
DROP FUNCTION IF EXISTS calculate_vector_distance(item_vectors, vector);

CREATE OR REPLACE FUNCTION calculate_vector_distance(item_vector item_vectors, search halfvec)
RETURNS double precision
LANGUAGE sql
STABLE
AS $function$
  SELECT item_vector.vector <=> search
$function$;

-- Step 6: Create HNSW index for efficient similarity search
CREATE INDEX IF NOT EXISTS item_vectors_vector_hnsw_idx
ON item_vectors USING hnsw (vector halfvec_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Step 7: Create additional index for L2 distance if needed
CREATE INDEX IF NOT EXISTS item_vectors_vector_hnsw_l2_idx
ON item_vectors USING hnsw (vector halfvec_l2_ops)
WITH (m = 16, ef_construction = 64);