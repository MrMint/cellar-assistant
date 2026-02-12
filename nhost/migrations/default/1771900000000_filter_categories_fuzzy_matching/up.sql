-- Adds filter_categories parameter and fuzzy name matching to search_places_hybrid.
--
-- 1. filter_categories: pushes item type filters into SQL so every CTE only
--    scans relevant places, improving quality and performance on global searches.
--
-- 2. Fuzzy name matching (three-pronged candidate generation in trgm_matches):
--    a) ILIKE on name — exact substring matches (GIN idx_places_name_trgm)
--    b) ILIKE on normalized name (non-alphanumeric stripped) — handles missing
--       spaces, hyphens, apostrophes (GIN idx_places_name_compact_trgm)
--    c) <% word_similarity operator — character-level typos (GIN idx_places_name_trgm)
--
-- 3. word_similarity() replaces similarity() for better partial match scoring.

-- Expression index for normalized name matching (strips all non-alphanumeric chars).
CREATE INDEX IF NOT EXISTS idx_places_name_compact_trgm
ON public.places USING gin ((regexp_replace(lower(name), '[^a-z0-9]', '', 'g')) gin_trgm_ops);

-- Drop old 10-param overload so CREATE OR REPLACE creates the new 11-param version
-- (adding a DEFAULT parameter changes the signature, so Postgres treats it as a new function)
DROP FUNCTION IF EXISTS public.search_places_hybrid(TEXT, TEXT[], FLOAT8[], FLOAT8, FLOAT8, FLOAT8, FLOAT8, FLOAT8, INTEGER, UUID[]);

CREATE OR REPLACE FUNCTION public.search_places_hybrid(
  search_query TEXT,
  matched_categories TEXT[] DEFAULT NULL,
  category_scores FLOAT8[] DEFAULT NULL,
  west_bound FLOAT8 DEFAULT NULL,
  south_bound FLOAT8 DEFAULT NULL,
  east_bound FLOAT8 DEFAULT NULL,
  north_bound FLOAT8 DEFAULT NULL,
  min_rating FLOAT8 DEFAULT NULL,
  result_limit INTEGER DEFAULT 50,
  tier_list_ids UUID[] DEFAULT NULL,
  filter_categories TEXT[] DEFAULT NULL
)
RETURNS SETOF public.hybrid_search_results
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  tsquery_val TSQUERY;
  has_categories BOOLEAN;
  has_text_query BOOLEAN;
  has_filter BOOLEAN;
  bbox geometry;
  safe_query TEXT;
  compact_query TEXT;
BEGIN
  has_categories := matched_categories IS NOT NULL AND array_length(matched_categories, 1) > 0;
  has_text_query := search_query IS NOT NULL AND length(trim(search_query)) > 0;
  has_filter := filter_categories IS NOT NULL AND array_length(filter_categories, 1) > 0;

  IF has_text_query THEN
    tsquery_val := websearch_to_tsquery('simple', search_query);
    -- Escape LIKE wildcards for safe ILIKE usage in trgm_matches
    safe_query := replace(replace(replace(search_query, '\', '\\'), '%', '\%'), '_', '\_');
    -- Normalized version for compact name matching (strip all non-alphanumeric)
    compact_query := regexp_replace(lower(search_query), '[^a-z0-9]', '', 'g');
  END IF;

  -- Pre-compute bounding box once (used by && operator below)
  IF west_bound IS NOT NULL AND south_bound IS NOT NULL
     AND east_bound IS NOT NULL AND north_bound IS NOT NULL THEN
    bbox := ST_MakeEnvelope(west_bound, south_bound, east_bound, north_bound, 4326);
  END IF;

  RETURN QUERY
  WITH
  -- Index-first strategy: each match layer queries the places table directly
  -- so PostgreSQL can leverage GIN indexes for text/trigram/category lookups.

  -- Layer 1A: Full-text search — uses GIN index idx_places_search_text.
  text_matches AS (
    SELECT
      p.id,
      ts_rank_cd(p.search_text, tsquery_val, 32) AS rank_score
    FROM public.places p
    WHERE has_text_query
      AND p.is_active = true
      AND p.search_text @@ tsquery_val
      AND (NOT has_filter OR p.primary_category = ANY(filter_categories) OR p.categories && filter_categories)
      AND (bbox IS NULL OR p.location && bbox)
      AND (min_rating IS NULL OR p.rating >= min_rating)
      AND (tier_list_ids IS NULL OR EXISTS (SELECT 1 FROM tier_list_items tli WHERE tli.place_id = p.id AND tli.tier_list_id = ANY(tier_list_ids)))
    LIMIT result_limit * 3
  ),
  -- Layer 1B: Fuzzy name matching — three candidate generation paths merged
  -- via BitmapOr. No ORDER BY: allows early termination via LIMIT.
  --   a) ILIKE on name — exact substring (GIN idx_places_name_trgm)
  --   b) ILIKE on space-stripped name — missing spaces (GIN idx_places_name_compact_trgm)
  --   c) <% word_similarity — character-level typos (GIN idx_places_name_trgm)
  trgm_matches AS (
    SELECT
      p.id,
      word_similarity(search_query, p.name) AS sim_score
    FROM public.places p
    WHERE has_text_query
      AND length(trim(search_query)) >= 3
      AND p.is_active = true
      AND (
        p.name ILIKE '%' || safe_query || '%'
        OR regexp_replace(lower(p.name), '[^a-z0-9]', '', 'g') ILIKE '%' || compact_query || '%'
        OR search_query OPERATOR(public.<%) p.name
      )
      AND (NOT has_filter OR p.primary_category = ANY(filter_categories) OR p.categories && filter_categories)
      AND (bbox IS NULL OR p.location && bbox)
      AND (min_rating IS NULL OR p.rating >= min_rating)
      AND (tier_list_ids IS NULL OR EXISTS (SELECT 1 FROM tier_list_items tli WHERE tli.place_id = p.id AND tli.tier_list_id = ANY(tier_list_ids)))
    LIMIT result_limit * 2
  ),
  -- Layer 2: Category matching — uses GIN index idx_places_categories
  category_matches AS (
    SELECT
      p.id,
      LEAST(1.0, scores.cat_score * CASE
        WHEN p.primary_category = ANY(matched_categories) THEN 1.15
        ELSE 1.0
      END) AS cat_score
    FROM public.places p
    CROSS JOIN LATERAL (
      SELECT COALESCE(MAX(
        CASE
          WHEN category_scores IS NOT NULL AND array_position(matched_categories, cat) IS NOT NULL
          THEN category_scores[array_position(matched_categories, cat)]
          ELSE 0.5
        END
      ), 0) AS cat_score
      FROM unnest(p.categories) AS cat
      WHERE cat = ANY(matched_categories)
    ) scores
    WHERE has_categories
      AND p.is_active = true
      AND (p.primary_category = ANY(matched_categories) OR p.categories && matched_categories)
      AND (NOT has_filter OR p.primary_category = ANY(filter_categories) OR p.categories && filter_categories)
      AND (bbox IS NULL OR p.location && bbox)
      AND (min_rating IS NULL OR p.rating >= min_rating)
      AND (tier_list_ids IS NULL OR EXISTS (SELECT 1 FROM tier_list_items tli WHERE tli.place_id = p.id AND tli.tier_list_id = ANY(tier_list_ids)))
    LIMIT result_limit * 3
  ),
  -- Merge all match layers (raw scores)
  merged AS (
    SELECT
      COALESCE(tm.id, tg.id, cm.id) AS place_id,
      COALESCE(tm.rank_score, 0.0)::FLOAT8 AS raw_text_rank,
      COALESCE(tg.sim_score, 0.0)::FLOAT8 AS trigram_similarity,
      COALESCE(cm.cat_score, 0.0)::FLOAT8 AS category_score
    FROM text_matches tm
    FULL OUTER JOIN trgm_matches tg ON tm.id = tg.id
    FULL OUTER JOIN category_matches cm ON COALESCE(tm.id, tg.id) = cm.id
  ),
  -- Category enrichment: text/trgm matched places may not appear in the
  -- LIMIT-constrained category_matches (e.g., 1.37M coffee shops but only
  -- 150 picked). For the small text/trgm set, look up actual category scores
  -- via primary key — just a handful of index lookups.
  category_enrich AS (
    SELECT
      m.place_id,
      LEAST(1.0, scores.cat_score * CASE
        WHEN p.primary_category = ANY(matched_categories) THEN 1.15
        ELSE 1.0
      END) AS cat_score
    FROM merged m
    JOIN public.places p ON p.id = m.place_id
    CROSS JOIN LATERAL (
      SELECT COALESCE(MAX(
        CASE
          WHEN category_scores IS NOT NULL AND array_position(matched_categories, cat) IS NOT NULL
          THEN category_scores[array_position(matched_categories, cat)]
          ELSE 0.5
        END
      ), 0) AS cat_score
      FROM unnest(p.categories) AS cat
      WHERE cat = ANY(matched_categories)
    ) scores
    WHERE has_categories
      AND m.category_score = 0.0
      AND (m.raw_text_rank > 0 OR m.trigram_similarity > 0)
  ),
  -- Compute max text_rank for normalization (avoids window functions which
  -- trigger a paradedb schema resolution issue in PL/pgSQL on some configs)
  max_text AS (
    SELECT GREATEST(MAX(raw_text_rank), 0.001) AS val FROM merged
  ),
  -- Normalize text_rank and compute combined score with name boost
  scored AS (
    SELECT
      m.place_id,
      -- Normalize text_rank to 0-1 within the result set.
      -- ts_rank_cd() returns ~0.001-0.15 raw; without normalization its
      -- 35% weight contributes almost nothing vs 0-1 trigram/category scores.
      (m.raw_text_rank / mt.val)::FLOAT8 AS text_rank,
      m.trigram_similarity,
      GREATEST(m.category_score, COALESCE(ce.cat_score, 0.0))::FLOAT8 AS category_score,
      (
        -- Base scoring with normalized text rank
        (m.raw_text_rank / mt.val) * 0.35 +
        m.trigram_similarity * 0.25 +
        GREATEST(m.category_score, COALESCE(ce.cat_score, 0.0)) * 0.40 +
        -- Name match boost: quadratic bonus for strong name similarity.
        -- Ensures specific place searches surface the correct place at the
        -- top, while generic queries remain category-dominant.
        CASE
          WHEN m.trigram_similarity >= 0.5
            THEN POWER(m.trigram_similarity, 2) * 0.5
          ELSE 0.0
        END
      )::FLOAT8 AS combined_score
    FROM merged m
    CROSS JOIN max_text mt
    LEFT JOIN category_enrich ce ON m.place_id = ce.place_id
  ),
  deduped AS (
    SELECT DISTINCT ON (place_id)
      place_id, text_rank, trigram_similarity, category_score, combined_score
    FROM scored
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
