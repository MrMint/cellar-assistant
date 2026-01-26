-- ==========================================
-- Rollback Ambiguous user_id Fix
-- ==========================================

-- Drop function with fixed parameter name
DROP FUNCTION IF EXISTS search_places_adaptive_cluster(FLOAT, FLOAT, FLOAT, FLOAT, TEXT[], FLOAT, TEXT, UUID, INTEGER);

-- Restore function with original parameter name (this will still have the ambiguity issue)
CREATE OR REPLACE FUNCTION search_places_adaptive_cluster(
  west_bound FLOAT,
  south_bound FLOAT, 
  east_bound FLOAT,
  north_bound FLOAT,
  category_filter TEXT[] DEFAULT NULL,
  min_rating FLOAT DEFAULT NULL,
  visit_status_filter TEXT DEFAULT NULL,
  user_id UUID DEFAULT NULL,
  result_limit INTEGER DEFAULT 500
) RETURNS SETOF place_search_results AS $$
DECLARE
  viewport_area_km2 FLOAT;
  cluster_distance_meters FLOAT;
  total_places INTEGER;
BEGIN
  -- This will have the same ambiguity issue as before
  SELECT COUNT(*) INTO total_places
  FROM places p
  LEFT JOIN user_place_interactions upi ON (p.id = upi.place_id AND upi.user_id = user_id)
  WHERE p.location && ST_MakeEnvelope(west_bound, south_bound, east_bound, north_bound, 4326)
    AND p.is_active = true
    AND p.confidence >= 0.5
    AND (category_filter IS NULL OR p.primary_category = ANY(category_filter));

  RETURN QUERY SELECT NULL::boolean, NULL::integer, NULL::integer, NULL::geography, NULL::geometry,
    NULL::uuid, NULL::text, NULL::geography, NULL::text, NULL::text[], NULL::numeric,
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::char,
    NULL::text, NULL::text, NULL::text, NULL::jsonb, NULL::integer,
    NULL::numeric, NULL::integer, NULL::boolean, NULL::float, NULL::float, NULL::boolean
  LIMIT 0; -- Return no results since this is a rollback
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION search_places_adaptive_cluster TO nhost_hasura;