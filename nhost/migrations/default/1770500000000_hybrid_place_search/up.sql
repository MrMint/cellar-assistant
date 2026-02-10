-- Hybrid Place Search Migration
--
-- Replaces per-place vector embeddings (~7M rows, ~44GB) with a 3-layer hybrid:
--   Layer 1: Full-text search (tsvector) + trigram fuzzy matching (pg_trgm) on places
--   Layer 2: Category-level semantic vectors (~200 rows) for natural language → category resolution
--   Layer 3: Existing PostGIS spatial filtering (unchanged)
--
-- Also drops 4 dead place-related SQL functions that were superseded by this system.

-- =============================================================================
-- Layer 1A: Full-Text Search on Places
-- =============================================================================

-- Add tsvector column (populated via trigger since array_to_string is not immutable)
--   A (highest) = place name
--   B = categories (includes primary category as first element)
--   C = locality (city/area)
ALTER TABLE public.places ADD COLUMN IF NOT EXISTS search_text tsvector;

-- Function to update search_text (VOLATILE — accesses mutable row state)
CREATE OR REPLACE FUNCTION public.update_places_search_text()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_text :=
    setweight(to_tsvector('simple', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(array_to_string(NEW.categories, ' '), '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW.locality, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to maintain search_text on INSERT/UPDATE
DROP TRIGGER IF EXISTS trg_places_search_text ON public.places;
CREATE TRIGGER trg_places_search_text
  BEFORE INSERT OR UPDATE OF name, categories, locality ON public.places
  FOR EACH ROW EXECUTE FUNCTION public.update_places_search_text();

-- Populate existing rows (this will take time on 3.5M rows)
UPDATE public.places SET search_text =
  setweight(to_tsvector('simple', COALESCE(name, '')), 'A') ||
  setweight(to_tsvector('simple', COALESCE(array_to_string(categories, ' '), '')), 'B') ||
  setweight(to_tsvector('simple', COALESCE(locality, '')), 'C')
WHERE search_text IS NULL;

-- GIN index for fast tsvector queries
CREATE INDEX IF NOT EXISTS idx_places_search_text ON public.places USING GIN (search_text);

-- =============================================================================
-- Layer 1B: Trigram Fuzzy Matching on Places
-- =============================================================================

-- pg_trgm is already enabled (from 1769500000000_add_brand_similarity_search)

-- GIN trigram index on name for fuzzy name search
CREATE INDEX IF NOT EXISTS idx_places_name_trgm ON public.places USING GIN (name gin_trgm_ops);

-- GIN trigram index on locality for area search
CREATE INDEX IF NOT EXISTS idx_places_locality_trgm ON public.places USING GIN (locality gin_trgm_ops);

-- =============================================================================
-- Layer 2: Category Semantic Vectors
-- =============================================================================

-- Table for pre-embedded category labels (~200 rows)
CREATE TABLE IF NOT EXISTS public.category_vectors (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  label_type TEXT NOT NULL DEFAULT 'category'
    CHECK (label_type IN ('category', 'alias', 'item_type', 'descriptor')),
  associated_categories TEXT[] DEFAULT '{}',
  vector halfvec(768) NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW cosine index (only ~200 rows, but consistent with place_vectors pattern)
CREATE INDEX IF NOT EXISTS idx_category_vectors_hnsw
  ON public.category_vectors
  USING hnsw (vector halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_category_vectors_label_type
  ON public.category_vectors (label_type);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_category_vectors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_category_vectors_updated_at ON public.category_vectors;
CREATE TRIGGER trg_category_vectors_updated_at
  BEFORE UPDATE ON public.category_vectors
  FOR EACH ROW EXECUTE FUNCTION public.update_category_vectors_updated_at();

-- Computed distance function for Hasura computed fields
CREATE OR REPLACE FUNCTION public.calculate_category_vector_distance(
  category_vector category_vectors,
  query_vector halfvec(768)
)
RETURNS double precision
LANGUAGE sql
STABLE
AS $function$
  SELECT category_vector.vector <=> query_vector
$function$;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.category_vectors TO nhost_hasura;
GRANT USAGE, SELECT ON SEQUENCE public.category_vectors_id_seq TO nhost_hasura;
GRANT EXECUTE ON FUNCTION public.calculate_category_vector_distance TO nhost_hasura;

-- =============================================================================
-- Category Vector Search Function
-- =============================================================================

-- Result type for category vector search
CREATE TABLE IF NOT EXISTS public.search_category_vectors_results (
  id INTEGER,
  label TEXT,
  label_type TEXT,
  associated_categories TEXT[],
  metadata JSONB,
  distance FLOAT8
);

CREATE OR REPLACE FUNCTION public.search_category_vectors(
  query_vector halfvec(768),
  max_distance FLOAT8 DEFAULT 0.8,
  result_limit INTEGER DEFAULT 15
)
RETURNS SETOF public.search_category_vectors_results
LANGUAGE plpgsql
STABLE
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    cv.id,
    cv.label,
    cv.label_type,
    cv.associated_categories,
    cv.metadata,
    (cv.vector <=> query_vector)::FLOAT8 AS distance
  FROM public.category_vectors cv
  WHERE (cv.vector <=> query_vector) <= max_distance
  ORDER BY cv.vector <=> query_vector
  LIMIT result_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.search_category_vectors TO nhost_hasura;

-- =============================================================================
-- Layer 3: Hybrid Search PostgreSQL Function
-- =============================================================================

-- Result type for hybrid search (flat, no clustering — semantic queries want ranked results)
CREATE TABLE IF NOT EXISTS public.hybrid_search_results (
  id UUID,
  name TEXT,
  location GEOGRAPHY(POINT, 4326),
  primary_category TEXT,
  categories TEXT[],
  confidence NUMERIC(3,2),
  street_address TEXT,
  locality TEXT,
  region TEXT,
  postcode TEXT,
  country_code CHAR(2),
  phone TEXT,
  website TEXT,
  email TEXT,
  hours JSONB,
  price_level INTEGER,
  rating NUMERIC(2,1),
  review_count INTEGER,
  is_verified BOOLEAN,
  text_rank FLOAT8,
  trigram_similarity FLOAT8,
  category_score FLOAT8,
  combined_score FLOAT8
);

-- Bounds-first hybrid search: filters by PostGIS GiST index FIRST, then applies
-- text/trigram/category matching on the small bounded set (~1K-10K rows vs 7M+).
-- Uses geography-native ST_Intersects (no ::geometry cast) to leverage the GiST index.
CREATE OR REPLACE FUNCTION public.search_places_hybrid(
  search_query TEXT,
  matched_categories TEXT[] DEFAULT NULL,
  category_scores FLOAT8[] DEFAULT NULL,
  west_bound FLOAT8 DEFAULT NULL,
  south_bound FLOAT8 DEFAULT NULL,
  east_bound FLOAT8 DEFAULT NULL,
  north_bound FLOAT8 DEFAULT NULL,
  min_rating FLOAT8 DEFAULT NULL,
  result_limit INTEGER DEFAULT 50
)
RETURNS SETOF public.hybrid_search_results
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  tsquery_val TSQUERY;
  has_categories BOOLEAN;
  has_text_query BOOLEAN;
BEGIN
  has_categories := matched_categories IS NOT NULL AND array_length(matched_categories, 1) > 0;
  has_text_query := search_query IS NOT NULL AND length(trim(search_query)) > 0;

  IF has_text_query THEN
    tsquery_val := plainto_tsquery('simple', search_query);
  END IF;

  RETURN QUERY
  WITH
  -- Step 1: Use GiST spatial index to narrow to places within viewport.
  -- This is materialized (referenced 3x) and typically yields ~1K-10K rows
  -- instead of scanning all 7M+ places in every subsequent CTE.
  bounded_places AS (
    SELECT p.id, p.name, p.search_text, p.primary_category, p.categories, p.rating
    FROM public.places p
    WHERE p.is_active = true
      AND (
        (west_bound IS NULL OR south_bound IS NULL OR east_bound IS NULL OR north_bound IS NULL)
        OR ST_Intersects(
          p.location,
          ST_MakeEnvelope(west_bound, south_bound, east_bound, north_bound, 4326)::geography
        )
      )
      AND (min_rating IS NULL OR p.rating >= min_rating)
  ),
  -- Layer 1A: Full-text search on the bounded set
  text_matches AS (
    SELECT
      bp.id,
      ts_rank_cd(bp.search_text, tsquery_val, 32) AS rank_score
    FROM bounded_places bp
    WHERE has_text_query
      AND bp.search_text @@ tsquery_val
    ORDER BY rank_score DESC
    LIMIT result_limit * 3
  ),
  -- Layer 1B: Trigram name similarity on the bounded set
  trgm_matches AS (
    SELECT
      bp.id,
      similarity(bp.name, search_query) AS sim_score
    FROM bounded_places bp
    WHERE has_text_query
      AND similarity(bp.name, search_query) >= 0.15
    ORDER BY sim_score DESC
    LIMIT result_limit * 2
  ),
  -- Layer 2: Category matching on the bounded set
  category_matches AS (
    SELECT
      bp.id,
      LEAST(1.0, scores.cat_score * CASE
        WHEN bp.primary_category = ANY(matched_categories) THEN 1.15
        ELSE 1.0
      END) AS cat_score
    FROM bounded_places bp
    CROSS JOIN LATERAL (
      SELECT COALESCE(MAX(
        CASE
          WHEN category_scores IS NOT NULL AND array_position(matched_categories, cat) IS NOT NULL
          THEN category_scores[array_position(matched_categories, cat)]
          ELSE 0.5
        END
      ), 0) AS cat_score
      FROM unnest(bp.categories) AS cat
      WHERE cat = ANY(matched_categories)
    ) scores
    WHERE has_categories
      AND (bp.primary_category = ANY(matched_categories) OR bp.categories && matched_categories)
    ORDER BY scores.cat_score DESC,
             CASE WHEN bp.primary_category = ANY(matched_categories) THEN 0 ELSE 1 END,
             bp.rating DESC NULLS LAST
    LIMIT result_limit * 3
  ),
  -- Merge all match layers
  merged AS (
    SELECT
      COALESCE(tm.id, tg.id, cm.id) AS place_id,
      COALESCE(tm.rank_score, 0.0)::FLOAT8 AS text_rank,
      COALESCE(tg.sim_score, 0.0)::FLOAT8 AS trigram_similarity,
      COALESCE(cm.cat_score, 0.0)::FLOAT8 AS category_score,
      (
        COALESCE(tm.rank_score, 0.0) * 0.35 +
        COALESCE(tg.sim_score, 0.0) * 0.25 +
        COALESCE(cm.cat_score, 0.0) * 0.40
      )::FLOAT8 AS combined_score
    FROM text_matches tm
    FULL OUTER JOIN trgm_matches tg ON tm.id = tg.id
    FULL OUTER JOIN category_matches cm ON COALESCE(tm.id, tg.id) = cm.id
  ),
  deduped AS (
    SELECT DISTINCT ON (place_id)
      place_id, text_rank, trigram_similarity, category_score, combined_score
    FROM merged
    ORDER BY place_id, combined_score DESC
  )
  -- Final join back to full places table (only for the small result set)
  SELECT
    p.id, p.name, p.location,
    p.primary_category, p.categories, p.confidence,
    p.street_address, p.locality, p.region, p.postcode, p.country_code,
    p.phone, p.website, p.email, p.hours, p.price_level, p.rating,
    p.review_count, p.is_verified,
    d.text_rank, d.trigram_similarity, d.category_score, d.combined_score
  FROM deduped d
  JOIN public.places p ON p.id = d.place_id
  WHERE d.combined_score > 0
  ORDER BY d.combined_score DESC, p.rating DESC NULLS LAST
  LIMIT result_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.search_places_hybrid TO nhost_hasura;

-- =============================================================================
-- Drop unused place-related functions
-- =============================================================================
-- These functions have zero references in the application codebase (src/, functions/)
-- and are not tracked in Hasura metadata. They were superseded by:
--   - search_places_adaptive_cluster (replaces get_places_in_bounds)
--   - search_places_hybrid (replaces search_cached_places_nearby)
--
-- Note: calculate_place_vector_distance is NOT dropped here because it's still
-- referenced by place_vectors Hasura metadata (computed field).

DROP FUNCTION IF EXISTS public.get_places_in_bounds(
  numeric, numeric, numeric, numeric, text[], integer
);

DROP FUNCTION IF EXISTS public.search_cached_places_nearby(
  geography, integer, text[], integer
);

DROP FUNCTION IF EXISTS public.places_distance(
  geography, geography
);

DROP FUNCTION IF EXISTS public.places_within_distance(
  geography, geography, integer
);
