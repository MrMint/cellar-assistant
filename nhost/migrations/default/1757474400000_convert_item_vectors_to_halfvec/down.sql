-- Rollback conversion of item_vectors table from halfvec(768) back to vector(768)
-- This migration converts halfvec data back to full precision vectors

-- Step 1: Drop HNSW indexes
DROP INDEX IF EXISTS item_vectors_vector_hnsw_idx;
DROP INDEX IF EXISTS item_vectors_vector_hnsw_l2_idx;

-- Step 2: Add new vector column with full precision
ALTER TABLE item_vectors ADD COLUMN vector_full vector(768);

-- Step 3: Convert existing halfvec data back to vector format
UPDATE item_vectors SET vector_full = vector::vector;

-- Step 4: Drop the halfvec column
ALTER TABLE item_vectors DROP COLUMN vector;

-- Step 5: Rename the new column to vector
ALTER TABLE item_vectors RENAME COLUMN vector_full TO vector;

-- Step 6: Restore the original calculate_vector_distance function
DROP FUNCTION IF EXISTS calculate_vector_distance(item_vectors, halfvec);

CREATE OR REPLACE FUNCTION calculate_vector_distance(item_vector item_vectors, search vector)
RETURNS double precision
LANGUAGE sql
STABLE
AS $function$
  SELECT item_vector.vector <=> search
$function$;