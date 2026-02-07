-- Density-aware clustering + progressive confidence floor
--
-- Two improvements for filtered/sparse map views:
--
-- 1. Density-aware cluster distance: SQRT(place_count / result_limit) factor
--    shrinks cluster radius when fewer places match, so sparse results don't
--    get unnecessarily grouped.
--
-- 2. Progressive confidence floor: when a category filter is active, the
--    confidence threshold scales with viewport size:
--      close zoom (≤10 km²)  → 0.5  (show everything)
--      city zoom  (~100 km²) → 0.9  (only standout places)
--    This gives a curated "what jumps out" view at city level, with full
--    detail revealed as you zoom in. Without a filter, floor stays at 0.5.

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
  density_factor FLOAT;
  confidence_floor FLOAT;
  total_places INTEGER;
  input_limit INTEGER;
  noise_limit INTEGER;
  scale_factor FLOAT;
  bounded_count INTEGER;
  table_total_estimate FLOAT;
  bbox geometry;
  grid_cells INTEGER;
  per_cell_limit INTEGER;
BEGIN
  -- Pre-compute bounding box to avoid repeated construction
  bbox := ST_MakeEnvelope(west_bound, south_bound, east_bound, north_bound, 4326);

  -- Calculate viewport area in km²
  SELECT ST_Area(bbox::geography) / 1000000 INTO viewport_area_km2_calc;

  -- Skip query entirely at world-view zoom (viewport > 50M km²)
  IF viewport_area_km2_calc > 50000000 THEN
    RETURN;
  END IF;

  -- ============================================================
  -- Progressive confidence floor when filtering by category
  -- At city zoom, show only standout places. As you zoom in,
  -- progressively reveal lower-confidence ones.
  --   ~1 km²   → 0.50 (show everything)
  --   ~25 km²  → 0.60
  --   ~50 km²  → 0.70
  --   ~100 km² → 0.90 (only high-confidence)
  -- Without a category filter, always use 0.5.
  -- ============================================================
  IF category_filter IS NOT NULL THEN
    confidence_floor := GREATEST(0.5, LEAST(0.9,
      0.5 + 0.4 * LEAST(1.0, viewport_area_km2_calc / 100.0)
    ));
  ELSE
    confidence_floor := 0.5;
  END IF;

  -- Input limit scales with viewport but stays manageable
  input_limit := CASE
    WHEN viewport_area_km2_calc > 1000000 THEN result_limit           -- 500 at continent
    WHEN viewport_area_km2_calc > 100000  THEN result_limit * 2       -- 1000 at multi-state
    WHEN viewport_area_km2_calc > 10000   THEN result_limit * 3       -- 1500 at state
    ELSE result_limit * 2                                              -- 1000 at local
  END;

  -- Cap on unclustered/noise points returned
  noise_limit := CASE
    WHEN viewport_area_km2_calc > 100000 THEN 50
    WHEN viewport_area_km2_calc > 10000  THEN 100
    ELSE result_limit
  END;

  -- ============================================================
  -- Bounded count instead of full COUNT(*)
  -- ============================================================
  IF visit_status_filter IS NOT NULL AND filter_user_id IS NOT NULL THEN
    SELECT count(*) INTO bounded_count FROM (
      SELECT 1 FROM places p
      LEFT JOIN user_place_interactions upi ON (p.id = upi.place_id AND upi.user_id = filter_user_id)
      WHERE p.location && bbox
        AND p.is_active = true
        AND p.confidence >= confidence_floor
        AND (category_filter IS NULL OR p.primary_category = ANY(category_filter))
        AND (min_rating IS NULL OR p.rating >= min_rating)
        AND (visit_status_filter = 'visited' AND upi.is_visited = true
          OR visit_status_filter = 'unvisited' AND (upi.is_visited IS NULL OR upi.is_visited = false))
      LIMIT input_limit + 1
    ) sub;
  ELSE
    SELECT count(*) INTO bounded_count FROM (
      SELECT 1 FROM places p
      WHERE p.location && bbox
        AND p.is_active = true
        AND p.confidence >= confidence_floor
        AND (category_filter IS NULL OR p.primary_category = ANY(category_filter))
        AND (min_rating IS NULL OR p.rating >= min_rating)
      LIMIT input_limit + 1
    ) sub;
  END IF;

  -- ============================================================
  -- Estimate total from table stats when over limit
  -- ============================================================
  IF bounded_count > input_limit THEN
    SELECT reltuples INTO table_total_estimate
    FROM pg_class WHERE relname = 'places';

    total_places := GREATEST(
      bounded_count,
      (table_total_estimate * LEAST(1.0, viewport_area_km2_calc / 150000000.0))::integer
    );
  ELSE
    total_places := bounded_count;
  END IF;

  -- Scale factor to estimate true cluster counts from sampled data
  scale_factor := GREATEST(1.0, total_places::float / GREATEST(input_limit, 1)::float);

  -- ============================================================
  -- Density-aware cluster distance
  -- Fewer places → smaller radius so sparse results stay unclustered.
  -- density_factor ranges from ~0.14 (10 places) to 1.0 (500+ places)
  -- ============================================================
  density_factor := LEAST(1.0, SQRT(bounded_count::float / GREATEST(result_limit, 1)::float));
  cluster_distance_meters := GREATEST(50, LEAST(500000, SQRT(viewport_area_km2_calc) * 50 * density_factor));

  -- Always cluster if we have more than 20 places
  IF bounded_count > 20 THEN

    -- Calculate grid dimensions for large viewports
    grid_cells := CASE
      WHEN viewport_area_km2_calc > 100000 THEN 5  -- 5x5 = 25 cells
      ELSE 1                                        -- No grid (single cell = standard query)
    END;
    per_cell_limit := CASE
      WHEN grid_cells > 1 THEN GREATEST(4, input_limit / (grid_cells * grid_cells))
      ELSE input_limit
    END;

    RETURN QUERY
    WITH filtered_places AS (
      SELECT
        p.id, p.name, p.location, p.primary_category, p.categories, p.confidence,
        p.street_address, p.locality, p.region, p.postcode, p.country_code,
        p.phone, p.website, p.email, p.hours, p.price_level, p.rating,
        p.review_count, p.is_verified,
        ST_Transform(p.location::geometry, 3857) as geom
      FROM generate_series(0, grid_cells - 1) gx
      CROSS JOIN generate_series(0, grid_cells - 1) gy
      CROSS JOIN LATERAL (
        SELECT
          p2.id, p2.name, p2.location, p2.primary_category, p2.categories, p2.confidence,
          p2.street_address, p2.locality, p2.region, p2.postcode, p2.country_code,
          p2.phone, p2.website, p2.email, p2.hours, p2.price_level, p2.rating,
          p2.review_count, p2.is_verified
        FROM places p2
        LEFT JOIN user_place_interactions upi
          ON visit_status_filter IS NOT NULL
          AND filter_user_id IS NOT NULL
          AND p2.id = upi.place_id
          AND upi.user_id = filter_user_id
        WHERE p2.location && ST_MakeEnvelope(
          west_bound  + (east_bound - west_bound) * gx::float / grid_cells,
          south_bound + (north_bound - south_bound) * gy::float / grid_cells,
          west_bound  + (east_bound - west_bound) * (gx + 1)::float / grid_cells,
          south_bound + (north_bound - south_bound) * (gy + 1)::float / grid_cells,
          4326
        )
          AND p2.is_active = true
          AND p2.confidence >= confidence_floor
          AND (category_filter IS NULL OR p2.primary_category = ANY(category_filter))
          AND (min_rating IS NULL OR p2.rating >= min_rating)
          AND (visit_status_filter IS NULL OR
               (visit_status_filter = 'visited' AND upi.is_visited = true) OR
               (visit_status_filter = 'unvisited' AND (upi.is_visited IS NULL OR upi.is_visited = false)))
        ORDER BY
          CASE WHEN grid_cells = 1 THEN p2.confidence ELSE NULL END DESC,
          CASE WHEN grid_cells = 1 THEN p2.rating ELSE NULL END DESC NULLS LAST
        LIMIT per_cell_limit
      ) p
    ),
    clustered_places AS (
      SELECT
        fp.*,
        ST_ClusterDBSCAN(fp.geom, cluster_distance_meters, 2) OVER () as cluster_id_calc
      FROM filtered_places fp
    ),
    cluster_summary AS (
      SELECT
        cluster_id_calc,
        COUNT(*) as place_count,
        ST_Transform(ST_Centroid(ST_Collect(geom)), 4326)::geography(point,4326) as center_point,
        ST_Transform(
          ST_Buffer(ST_ConvexHull(ST_Collect(geom)), GREATEST(cluster_distance_meters * 0.1, 100)),
          4326
        )::geometry(polygon,4326) as bounds,
        AVG(confidence)::numeric(3,2) as avg_confidence,
        AVG(rating)::numeric(2,1) as avg_rating
      FROM clustered_places
      WHERE cluster_id_calc IS NOT NULL
      GROUP BY cluster_id_calc
      HAVING COUNT(*) >= 2
    ),
    single_places AS (
      SELECT cp.* FROM clustered_places cp
      WHERE cp.cluster_id_calc IS NULL
      ORDER BY cp.confidence DESC, cp.rating DESC NULLS LAST
      LIMIT noise_limit
    )
    -- Return clusters with estimated true counts
    SELECT
      true::boolean,
      cs.cluster_id_calc::integer,
      ROUND(cs.place_count * scale_factor)::integer,
      cs.center_point::geography(point,4326),
      cs.bounds::geometry(polygon,4326),
      gen_random_uuid(),
      ('🏪 ' || ROUND(cs.place_count * scale_factor) || ' places')::text,
      cs.center_point::geography(point,4326),
      'cluster'::text,
      ARRAY['cluster']::text[],
      cs.avg_confidence,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::char(2),
      NULL::text, NULL::text, NULL::text, NULL::jsonb, NULL::integer,
      cs.avg_rating, 0::integer, false::boolean,
      viewport_area_km2_calc,
      ROUND(cs.place_count * scale_factor)::float / GREATEST(viewport_area_km2_calc, 1.0),
      true::boolean
    FROM cluster_summary cs

    UNION ALL

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
    -- Return individual places when count is low
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
    LEFT JOIN user_place_interactions upi
      ON visit_status_filter IS NOT NULL
      AND filter_user_id IS NOT NULL
      AND p.id = upi.place_id
      AND upi.user_id = filter_user_id
    WHERE p.location && bbox
      AND p.is_active = true
      AND p.confidence >= confidence_floor
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
