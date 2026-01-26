-- ==========================================
-- Rollback Rating and Visit Status Filters
-- ==========================================

-- Drop enhanced function
DROP FUNCTION IF EXISTS search_places_adaptive_cluster(FLOAT, FLOAT, FLOAT, FLOAT, TEXT[], FLOAT, TEXT, UUID, INTEGER);

-- Restore original function
CREATE OR REPLACE FUNCTION search_places_adaptive_cluster(
  west_bound FLOAT,
  south_bound FLOAT, 
  east_bound FLOAT,
  north_bound FLOAT,
  category_filter TEXT[] DEFAULT NULL,
  result_limit INTEGER DEFAULT 500
) RETURNS SETOF place_search_results AS $$
DECLARE
  viewport_area_km2 FLOAT;
  cluster_distance_meters FLOAT;
  total_places INTEGER;
BEGIN
  -- Calculate viewport area in km²
  SELECT ST_Area(
    ST_MakeEnvelope(west_bound, south_bound, east_bound, north_bound, 4326)::geography
  ) / 1000000 INTO viewport_area_km2;
  
  -- Adaptive clustering distance based on viewport size
  cluster_distance_meters := GREATEST(50, LEAST(20000, SQRT(viewport_area_km2) * 50));

  -- Count places in viewport for decision making
  SELECT COUNT(*) INTO total_places
  FROM places p
  WHERE p.location && ST_MakeEnvelope(west_bound, south_bound, east_bound, north_bound, 4326)
    AND p.is_active = true
    AND p.confidence >= 0.5
    AND (category_filter IS NULL OR p.primary_category = ANY(category_filter));

  -- Always cluster if we have more than 20 places (for testing)
  IF total_places > 20 THEN
    RETURN QUERY
    WITH filtered_places AS (
      SELECT 
        p.id, p.name, p.location, p.primary_category, p.categories, p.confidence,
        p.street_address, p.locality, p.region, p.postcode, p.country_code,
        p.phone, p.website, p.email, p.hours, p.price_level, p.rating, 
        p.review_count, p.is_verified,
        ST_Transform(p.location::geometry, 3857) as geom
      FROM places p
      WHERE p.location && ST_MakeEnvelope(west_bound, south_bound, east_bound, north_bound, 4326)
        AND p.is_active = true
        AND p.confidence >= 0.5
        AND (category_filter IS NULL OR p.primary_category = ANY(category_filter))
      ORDER BY p.confidence DESC, p.rating DESC NULLS LAST
      LIMIT CASE 
        WHEN viewport_area_km2 > 50000 THEN result_limit * 30
        WHEN viewport_area_km2 > 1000 THEN result_limit * 4
        ELSE result_limit * 2
      END
    ),
    clustered_places AS (
      SELECT 
        fp.*,
        ST_ClusterDBSCAN(fp.geom, cluster_distance_meters, 3) OVER () as cluster_id
      FROM filtered_places fp
    ),
    cluster_summary AS (
      SELECT 
        cluster_id,
        COUNT(*) as place_count,
        ST_Transform(ST_Centroid(ST_Collect(geom)), 4326)::geography(point,4326) as center_point,
        ST_Transform(ST_ConvexHull(ST_Collect(geom)), 4326)::geometry(polygon,4326) as bounds,
        AVG(confidence)::numeric(3,2) as avg_confidence,
        AVG(rating)::numeric(2,1) as avg_rating
      FROM clustered_places
      WHERE cluster_id IS NOT NULL
      GROUP BY cluster_id
      HAVING COUNT(*) >= 3
    ),
    single_places AS (
      SELECT cp.* FROM clustered_places cp WHERE cp.cluster_id IS NULL
    )
    -- Return clusters
    SELECT 
      true::boolean,
      cs.cluster_id::integer,
      cs.place_count::integer,
      cs.center_point,
      cs.bounds,
      gen_random_uuid(),
      ('🏪 ' || cs.place_count || ' places')::text,
      cs.center_point,
      'cluster'::text,
      ARRAY['cluster']::text[],
      cs.avg_confidence,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::char(2),
      NULL::text, NULL::text, NULL::text, NULL::jsonb, NULL::integer,
      cs.avg_rating, 0::integer, false::boolean,
      viewport_area_km2,
      cs.place_count::float / GREATEST(viewport_area_km2, 1.0),
      true::boolean
    FROM cluster_summary cs
    
    UNION ALL
    
    SELECT 
      false::boolean,
      NULL::integer, NULL::integer,
      NULL::geography(point,4326), NULL::geometry(polygon,4326),
      sp.id, sp.name, sp.location, sp.primary_category, sp.categories, sp.confidence,
      sp.street_address, sp.locality, sp.region, sp.postcode, sp.country_code,
      sp.phone, sp.website, sp.email, sp.hours, sp.price_level, sp.rating,
      sp.review_count, sp.is_verified,
      viewport_area_km2, 
      total_places::float / GREATEST(viewport_area_km2, 1.0),
      true::boolean
    FROM single_places sp;

  ELSE
    RETURN QUERY
    SELECT 
      false::boolean,
      NULL::integer, NULL::integer,
      NULL::geography(point,4326), NULL::geometry(polygon,4326),
      p.id, p.name, p.location, p.primary_category, p.categories, p.confidence,
      p.street_address, p.locality, p.region, p.postcode, p.country_code,
      p.phone, p.website, p.email, p.hours, p.price_level, p.rating,
      p.review_count, p.is_verified,
      viewport_area_km2, total_places::float / GREATEST(viewport_area_km2, 1.0),
      false::boolean
    FROM places p
    WHERE p.location && ST_MakeEnvelope(west_bound, south_bound, east_bound, north_bound, 4326)
      AND p.is_active = true
      AND p.confidence >= 0.5
      AND (category_filter IS NULL OR p.primary_category = ANY(category_filter))
    ORDER BY p.confidence DESC, p.rating DESC NULLS LAST
    LIMIT result_limit;
  END IF;

END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION search_places_adaptive_cluster TO nhost_hasura;