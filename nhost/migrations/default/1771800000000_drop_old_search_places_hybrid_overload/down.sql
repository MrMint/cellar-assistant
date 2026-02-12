-- Restore the old 9-parameter overload of search_places_hybrid
-- This recreates the version without tier_list_ids parameter

CREATE OR REPLACE FUNCTION public.search_places_hybrid(search_query text, matched_categories text[] DEFAULT NULL::text[], category_scores double precision[] DEFAULT NULL::double precision[], west_bound double precision DEFAULT NULL::double precision, south_bound double precision DEFAULT NULL::double precision, east_bound double precision DEFAULT NULL::double precision, north_bound double precision DEFAULT NULL::double precision, min_rating double precision DEFAULT NULL::double precision, result_limit integer DEFAULT 50)
 RETURNS SETOF hybrid_search_results
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
    tsquery_val := websearch_to_tsquery('simple', search_query);
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
  -- Merge all match layers with raw text rank
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
  -- Normalize text rank and compute combined score
  scored AS (
    SELECT
      m.place_id,
      CASE
        WHEN max_rank.max_text_rank > 0
        THEN LEAST(1.0, m.raw_text_rank / max_rank.max_text_rank)
        ELSE 0.0
      END AS text_rank,
      m.trigram_similarity,
      m.category_score,
      (
        CASE
          WHEN max_rank.max_text_rank > 0
          THEN LEAST(1.0, m.raw_text_rank / max_rank.max_text_rank)
          ELSE 0.0
        END * 0.35 +
        m.trigram_similarity * 0.25 +
        m.category_score * 0.40
      )::FLOAT8 AS combined_score
    FROM merged m
    CROSS JOIN (
      SELECT MAX(raw_text_rank) AS max_text_rank
      FROM merged
    ) max_rank
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
