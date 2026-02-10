-- Revert search_places_hybrid to version from 1771000000000 (without name_boost)

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
  tier_list_ids UUID[] DEFAULT NULL
)
RETURNS SETOF public.hybrid_search_results
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  tsquery_val TSQUERY;
  has_categories BOOLEAN;
  has_text_query BOOLEAN;
  bbox geometry;
  safe_query TEXT;
BEGIN
  has_categories := matched_categories IS NOT NULL AND array_length(matched_categories, 1) > 0;
  has_text_query := search_query IS NOT NULL AND length(trim(search_query)) > 0;

  IF has_text_query THEN
    tsquery_val := websearch_to_tsquery('simple', search_query);
    safe_query := replace(replace(replace(search_query, '\', '\\'), '%', '\%'), '_', '\_');
  END IF;

  IF west_bound IS NOT NULL AND south_bound IS NOT NULL
     AND east_bound IS NOT NULL AND north_bound IS NOT NULL THEN
    bbox := ST_MakeEnvelope(west_bound, south_bound, east_bound, north_bound, 4326);
  END IF;

  RETURN QUERY
  WITH
  text_matches AS (
    SELECT
      p.id,
      ts_rank_cd(p.search_text, tsquery_val, 32) AS rank_score
    FROM public.places p
    WHERE has_text_query
      AND p.is_active = true
      AND p.search_text @@ tsquery_val
      AND (bbox IS NULL OR p.location && bbox)
      AND (min_rating IS NULL OR p.rating >= min_rating)
      AND (tier_list_ids IS NULL OR EXISTS (SELECT 1 FROM tier_list_items tli WHERE tli.place_id = p.id AND tli.tier_list_id = ANY(tier_list_ids)))
    LIMIT result_limit * 3
  ),
  trgm_matches AS (
    SELECT
      p.id,
      similarity(p.name, search_query) AS sim_score
    FROM public.places p
    WHERE has_text_query
      AND length(trim(search_query)) >= 3
      AND p.is_active = true
      AND p.name ILIKE '%' || safe_query || '%'
      AND (bbox IS NULL OR p.location && bbox)
      AND (min_rating IS NULL OR p.rating >= min_rating)
      AND (tier_list_ids IS NULL OR EXISTS (SELECT 1 FROM tier_list_items tli WHERE tli.place_id = p.id AND tli.tier_list_id = ANY(tier_list_ids)))
    LIMIT result_limit * 2
  ),
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
      AND (bbox IS NULL OR p.location && bbox)
      AND (min_rating IS NULL OR p.rating >= min_rating)
      AND (tier_list_ids IS NULL OR EXISTS (SELECT 1 FROM tier_list_items tli WHERE tli.place_id = p.id AND tli.tier_list_id = ANY(tier_list_ids)))
    LIMIT result_limit * 3
  ),
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
