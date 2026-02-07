-- Revert to previous clustering function with fixed distance cap and no noise limit

CREATE OR REPLACE FUNCTION public.search_places_adaptive_cluster(
  west_bound FLOAT8,
  south_bound FLOAT8,
  east_bound FLOAT8,
  north_bound FLOAT8,
  category_filter TEXT[] DEFAULT NULL,
  min_rating FLOAT8 DEFAULT NULL,
  visit_status_filter TEXT DEFAULT NULL,
  filter_user_id UUID DEFAULT NULL,
  result_limit INTEGER DEFAULT 500
)
RETURNS SETOF place_search_results
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  viewport_area_km2_calc FLOAT;
  cluster_distance_meters FLOAT;
  total_places INTEGER;
BEGIN
  -- Calculate viewport area in km²
  SELECT ST_Area(
    ST_MakeEnvelope(west_bound, south_bound, east_bound, north_bound, 4326)::geography
  ) / 1000000 INTO viewport_area_km2_calc;

  -- Adaptive clustering distance based on viewport size
  cluster_distance_meters := GREATEST(50, LEAST(20000, SQRT(viewport_area_km2_calc) * 50));

  -- Count places in viewport for decision making (with all filters applied)
  SELECT COUNT(*) INTO total_places
  FROM places p
  LEFT JOIN user_place_interactions upi ON (p.id = upi.place_id AND upi.user_id = filter_user_id)
  WHERE p.location && ST_MakeEnvelope(west_bound, south_bound, east_bound, north_bound, 4326)
    AND p.is_active = true
    AND p.confidence >= 0.5
    AND (category_filter IS NULL OR p.primary_category = ANY(category_filter))
    AND (min_rating IS NULL OR p.rating >= min_rating)
    AND (visit_status_filter IS NULL OR
         (visit_status_filter = 'visited' AND upi.is_visited = true) OR
         (visit_status_filter = 'unvisited' AND (upi.is_visited IS NULL OR upi.is_visited = false)));

  -- Always cluster if we have more than 20 places
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
      LEFT JOIN user_place_interactions upi ON (p.id = upi.place_id AND upi.user_id = filter_user_id)
      WHERE p.location && ST_MakeEnvelope(west_bound, south_bound, east_bound, north_bound, 4326)
        AND p.is_active = true
        AND p.confidence >= 0.5
        AND (category_filter IS NULL OR p.primary_category = ANY(category_filter))
        AND (min_rating IS NULL OR p.rating >= min_rating)
        AND (visit_status_filter IS NULL OR
             (visit_status_filter = 'visited' AND upi.is_visited = true) OR
             (visit_status_filter = 'unvisited' AND (upi.is_visited IS NULL OR upi.is_visited = false)))
      ORDER BY p.confidence DESC, p.rating DESC NULLS LAST
      LIMIT CASE
        WHEN viewport_area_km2_calc > 50000 THEN result_limit * 30
        WHEN viewport_area_km2_calc > 1000 THEN result_limit * 4
        ELSE result_limit * 2
      END
    ),
    clustered_places AS (
      SELECT
        fp.*,
        ST_ClusterDBSCAN(fp.geom, cluster_distance_meters, 3) OVER () as cluster_id_calc
      FROM filtered_places fp
    ),
    cluster_summary AS (
      SELECT
        cluster_id_calc,
        COUNT(*) as place_count,
        ST_Transform(ST_Centroid(ST_Collect(geom)), 4326)::geography(point,4326) as center_point,
        ST_Transform(ST_ConvexHull(ST_Collect(geom)), 4326)::geometry(polygon,4326) as bounds,
        AVG(confidence)::numeric(3,2) as avg_confidence,
        AVG(rating)::numeric(2,1) as avg_rating
      FROM clustered_places
      WHERE cluster_id_calc IS NOT NULL
      GROUP BY cluster_id_calc
      HAVING COUNT(*) >= 3
    ),
    single_places AS (
      SELECT cp.* FROM clustered_places cp WHERE cp.cluster_id_calc IS NULL
    )
    -- Return clusters with NATIVE GEOMETRY TYPES (no ST_AsGeoJSON conversion)
    SELECT
      true::boolean,
      cs.cluster_id_calc::integer,
      cs.place_count::integer,
      cs.center_point::geography(point,4326),
      cs.bounds::geometry(polygon,4326),
      gen_random_uuid(),
      ('🏪 ' || cs.place_count || ' places')::text,
      cs.center_point::geography(point,4326),
      'cluster'::text,
      ARRAY['cluster']::text[],
      cs.avg_confidence,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::char(2),
      NULL::text, NULL::text, NULL::text, NULL::jsonb, NULL::integer,
      cs.avg_rating, 0::integer, false::boolean,
      viewport_area_km2_calc,
      cs.place_count::float / GREATEST(viewport_area_km2_calc, 1.0),
      true::boolean
    FROM cluster_summary cs

    UNION ALL

    -- Return individual places with NATIVE GEOMETRY TYPES
    SELECT
      false::boolean,
      NULL::integer, NULL::integer,
      NULL::geography(point,4326), NULL::geometry(polygon,4326),
      sp.id, sp.name, sp.location::geography(point,4326),
      sp.primary_category, sp.categories, sp.confidence,
      sp.street_address, sp.locality, sp.region, sp.postcode, sp.country_code,
      sp.phone, sp.website, sp.email, sp.hours, sp.price_level, sp.rating,
      sp.review_count, sp.is_verified,
      viewport_area_km2_calc,
      total_places::float / GREATEST(viewport_area_km2_calc, 1.0),
      true::boolean
    FROM single_places sp;

  ELSE
    -- Return individual places when count is low with NATIVE GEOMETRY TYPES
    RETURN QUERY
    SELECT
      false::boolean,
      NULL::integer, NULL::integer,
      NULL::geography(point,4326), NULL::geometry(polygon,4326),
      p.id, p.name, p.location::geography(point,4326),
      p.primary_category, p.categories, p.confidence,
      p.street_address, p.locality, p.region, p.postcode, p.country_code,
      p.phone, p.website, p.email, p.hours, p.price_level, p.rating,
      p.review_count, p.is_verified,
      viewport_area_km2_calc, total_places::float / GREATEST(viewport_area_km2_calc, 1.0),
      false::boolean
    FROM places p
    LEFT JOIN user_place_interactions upi ON (p.id = upi.place_id AND upi.user_id = filter_user_id)
    WHERE p.location && ST_MakeEnvelope(west_bound, south_bound, east_bound, north_bound, 4326)
      AND p.is_active = true
      AND p.confidence >= 0.5
      AND (category_filter IS NULL OR p.primary_category = ANY(category_filter))
      AND (min_rating IS NULL OR p.rating >= min_rating)
      AND (visit_status_filter IS NULL OR
           (visit_status_filter = 'visited' AND upi.is_visited = true) OR
           (visit_status_filter = 'unvisited' AND (upi.is_visited IS NULL OR upi.is_visited = false)))
    ORDER BY p.confidence DESC, p.rating DESC NULLS LAST
    LIMIT result_limit;
  END IF;

END;
$function$;
