-- Convert place_vectors to halfvec(768) — idempotent + guarded.
--
-- HISTORY NOTE: this migration carries timestamp 1741795200001 (Mar 2025),
-- which sorts BEFORE 1757471890000_add_place_vectors_table (Sep 2025) — the
-- migration that actually creates the table. On a fresh, from-scratch replay
-- (local dev / CI / disaster-recovery) it therefore ran before the table
-- existed and failed with: relation "public.place_vectors" does not exist.
--
-- Production already applied this migration in order, against an existing
-- table, so its version number is deliberately left unchanged to avoid forcing
-- a re-run (which would rebuild the HNSW indexes under a lock). The body is now
-- fully guarded so a from-scratch replay is a clean no-op here: the final
-- halfvec(768) shape is produced by 1757474282000_update_place_vectors_to_halfvec
-- instead. The conversion below only executes on the (now non-existent) path
-- where the table is present but still wider than 768 dimensions.

DO $do$
BEGIN
  -- Fresh replay: this migration sorts before table creation, so the table is
  -- not there yet. Nothing to do — the later migration creates it at 768.
  IF to_regclass('public.place_vectors') IS NULL THEN
    RAISE NOTICE 'place_vectors does not exist yet; skipping 768 conversion (handled by 1757474282000).';
    RETURN;
  END IF;

  -- Already halfvec(768) (e.g. production, or a re-run): nothing to do.
  IF (
    SELECT format_type(atttypid, atttypmod)
    FROM pg_attribute
    WHERE attrelid = 'public.place_vectors'::regclass
      AND attname = 'vector'
      AND NOT attisdropped
  ) = 'halfvec(768)' THEN
    RAISE NOTICE 'place_vectors.vector already halfvec(768); nothing to do.';
    RETURN;
  END IF;

  -- Table exists but column is still wider than 768: perform the conversion.
  -- Existing vectors are truncated to 768 dimensions and should be regenerated.
  EXECUTE 'DROP FUNCTION IF EXISTS public.calculate_place_vector_distance(place_vectors, halfvec(3072))';
  EXECUTE 'DROP INDEX IF EXISTS public.idx_place_vectors_hnsw';
  EXECUTE 'DROP INDEX IF EXISTS public.idx_place_vectors_hnsw_l2';

  EXECUTE 'ALTER TABLE public.place_vectors ALTER COLUMN vector TYPE halfvec(768) USING vector::halfvec(768)';

  EXECUTE 'CREATE INDEX idx_place_vectors_hnsw ON public.place_vectors USING hnsw (vector halfvec_cosine_ops) WITH (m = 16, ef_construction = 64)';
  EXECUTE 'CREATE INDEX idx_place_vectors_hnsw_l2 ON public.place_vectors USING hnsw (vector halfvec_l2_ops) WITH (m = 16, ef_construction = 64)';

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.calculate_place_vector_distance(place_vector place_vectors, search halfvec(768))
    RETURNS double precision
    LANGUAGE sql
    STABLE
    AS $function$
      SELECT place_vector.vector <=> search
    $function$
  $fn$;
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.calculate_place_vector_distance TO nhost_hasura';

  EXECUTE 'COMMENT ON TABLE public.place_vectors IS ''Stores halfvec(768) embeddings for places with HNSW indexing for efficient similarity search (Gemini Embedding 2)''';
  EXECUTE 'COMMENT ON COLUMN public.place_vectors.vector IS ''halfvec(768) embedding with HNSW index support''';

  RAISE NOTICE 'place_vectors.vector converted to halfvec(768).';
END
$do$;
