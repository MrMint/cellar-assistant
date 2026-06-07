-- Revert place_vectors from halfvec(768) back to halfvec(3072) — guarded.
-- Reverses the Gemini Embedding 2 standardization.
--
-- Because this migration is mis-timestamped (1741795200001), in a full reverse
-- rollback it runs LAST — after 1757471890000's down has already dropped the
-- table. The guard below makes that a clean no-op instead of an error.

DO $do$
BEGIN
  IF to_regclass('public.place_vectors') IS NULL THEN
    RAISE NOTICE 'place_vectors does not exist; nothing to revert.';
    RETURN;
  END IF;

  EXECUTE 'DROP FUNCTION IF EXISTS public.calculate_place_vector_distance(place_vectors, halfvec(768))';
  EXECUTE 'DROP INDEX IF EXISTS public.idx_place_vectors_hnsw';
  EXECUTE 'DROP INDEX IF EXISTS public.idx_place_vectors_hnsw_l2';

  EXECUTE 'ALTER TABLE public.place_vectors ALTER COLUMN vector TYPE halfvec(3072) USING vector::halfvec(3072)';

  EXECUTE 'CREATE INDEX idx_place_vectors_hnsw ON public.place_vectors USING hnsw (vector halfvec_cosine_ops) WITH (m = 16, ef_construction = 64)';
  EXECUTE 'CREATE INDEX idx_place_vectors_hnsw_l2 ON public.place_vectors USING hnsw (vector halfvec_l2_ops) WITH (m = 16, ef_construction = 64)';

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.calculate_place_vector_distance(place_vector place_vectors, search halfvec(3072))
    RETURNS double precision
    LANGUAGE sql
    STABLE
    AS $function$
      SELECT place_vector.vector <=> search
    $function$
  $fn$;
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.calculate_place_vector_distance TO nhost_hasura';

  EXECUTE 'COMMENT ON TABLE public.place_vectors IS ''Stores halfvec(3072) embeddings for places with HNSW indexing for efficient similarity search''';
  EXECUTE 'COMMENT ON COLUMN public.place_vectors.vector IS ''halfvec(3072) embedding with HNSW index support''';
END
$do$;
