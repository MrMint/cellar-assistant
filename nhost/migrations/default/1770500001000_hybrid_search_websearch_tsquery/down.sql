-- Revert search_places_hybrid from websearch_to_tsquery back to plainto_tsquery

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

GRANT EXECUTE ON FUNCTION public.search_places_hybrid TO nhost_hasura;
