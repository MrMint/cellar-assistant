-- Revert to previous versions of map search functions
-- (from 1770800000000_add_tier_list_filter_to_map_functions)

-- ============================================================
-- 0. Restore the old 9-param overload of search_places_adaptive_cluster
--    (dropped by up.sql to work around Hasura's no-overload limitation)
-- ============================================================

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
  viewport_max_dim_km FLOAT;
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
  bbox := ST_MakeEnvelope(west_bound, south_bound, east_bound, north_bound, 4326);
  SELECT ST_Area(bbox::geography) / 1000000 INTO viewport_area_km2_calc;

  viewport_max_dim_km := GREATEST(
    ST_Distance(
      ST_SetSRID(ST_MakePoint(west_bound, (north_bound + south_bound) / 2.0), 4326)::geography,
      ST_SetSRID(ST_MakePoint(east_bound, (north_bound + south_bound) / 2.0), 4326)::geography
    ) / 1000.0,
    ST_Distance(
      ST_SetSRID(ST_MakePoint((west_bound + east_bound) / 2.0, south_bound), 4326)::geography,
      ST_SetSRID(ST_MakePoint((west_bound + east_bound) / 2.0, north_bound), 4326)::geography
    ) / 1000.0
  );

  IF viewport_area_km2_calc > 50000000 THEN
    RETURN;
  END IF;

  IF category_filter IS NOT NULL THEN
    confidence_floor := GREATEST(0.5, LEAST(0.9,
      0.5 + 0.4 * LEAST(1.0, viewport_area_km2_calc / 100.0)
    ));
  ELSE
    confidence_floor := 0.5;
  END IF;

  input_limit := CASE
    WHEN viewport_area_km2_calc > 1000000 THEN result_limit
    WHEN viewport_area_km2_calc > 100000  THEN result_limit * 2
    WHEN viewport_area_km2_calc > 10000   THEN result_limit * 3
    ELSE result_limit * 2
  END;

  noise_limit := CASE
    WHEN viewport_area_km2_calc > 100000 THEN 50
    WHEN viewport_area_km2_calc > 10000  THEN 100
    ELSE result_limit
  END;

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

  scale_factor := GREATEST(1.0, total_places::float / GREATEST(input_limit, 1)::float);

  density_factor := LEAST(1.0, SQRT(bounded_count::float / GREATEST(result_limit, 1)::float));
  cluster_distance_meters := GREATEST(50, LEAST(500000, viewport_max_dim_km * 50 * density_factor));

  IF bounded_count > 20 THEN

    grid_cells := CASE
      WHEN viewport_area_km2_calc > 100000 THEN 5
      ELSE 1
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

-- ============================================================
-- 1. search_places_adaptive_cluster 10-param version (revert)
-- ============================================================

CREATE OR REPLACE FUNCTION public.search_places_adaptive_cluster(
  west_bound FLOAT8,
  south_bound FLOAT8,
  east_bound FLOAT8,
  north_bound FLOAT8,
  category_filter TEXT[] DEFAULT NULL,
  min_rating FLOAT8 DEFAULT NULL,
  visit_status_filter TEXT DEFAULT NULL,
  filter_user_id UUID DEFAULT NULL,
  result_limit INTEGER DEFAULT 500,
  tier_list_ids UUID[] DEFAULT NULL
)
RETURNS SETOF place_search_results
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  viewport_area_km2_calc FLOAT;
  viewport_max_dim_km FLOAT;
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
  bbox := ST_MakeEnvelope(west_bound, south_bound, east_bound, north_bound, 4326);
  SELECT ST_Area(bbox::geography) / 1000000 INTO viewport_area_km2_calc;

  viewport_max_dim_km := GREATEST(
    ST_Distance(
      ST_SetSRID(ST_MakePoint(west_bound, (north_bound + south_bound) / 2.0), 4326)::geography,
      ST_SetSRID(ST_MakePoint(east_bound, (north_bound + south_bound) / 2.0), 4326)::geography
    ) / 1000.0,
    ST_Distance(
      ST_SetSRID(ST_MakePoint((west_bound + east_bound) / 2.0, south_bound), 4326)::geography,
      ST_SetSRID(ST_MakePoint((west_bound + east_bound) / 2.0, north_bound), 4326)::geography
    ) / 1000.0
  );

  IF viewport_area_km2_calc > 50000000 THEN
    RETURN;
  END IF;

  IF category_filter IS NOT NULL THEN
    confidence_floor := GREATEST(0.5, LEAST(0.9,
      0.5 + 0.4 * LEAST(1.0, viewport_area_km2_calc / 100.0)
    ));
  ELSE
    confidence_floor := 0.5;
  END IF;

  input_limit := CASE
    WHEN viewport_area_km2_calc > 1000000 THEN result_limit
    WHEN viewport_area_km2_calc > 100000  THEN result_limit * 2
    WHEN viewport_area_km2_calc > 10000   THEN result_limit * 3
    ELSE result_limit * 2
  END;

  noise_limit := CASE
    WHEN viewport_area_km2_calc > 100000 THEN 50
    WHEN viewport_area_km2_calc > 10000  THEN 100
    ELSE result_limit
  END;

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
        AND (tier_list_ids IS NULL OR p.id IN (SELECT tli.place_id FROM tier_list_items tli WHERE tli.tier_list_id = ANY(tier_list_ids)))
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
        AND (tier_list_ids IS NULL OR p.id IN (SELECT tli.place_id FROM tier_list_items tli WHERE tli.tier_list_id = ANY(tier_list_ids)))
      LIMIT input_limit + 1
    ) sub;
  END IF;

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

  scale_factor := GREATEST(1.0, total_places::float / GREATEST(input_limit, 1)::float);

  density_factor := LEAST(1.0, SQRT(bounded_count::float / GREATEST(result_limit, 1)::float));
  cluster_distance_meters := GREATEST(50, LEAST(500000, viewport_max_dim_km * 50 * density_factor));

  IF bounded_count > 20 THEN

    grid_cells := CASE
      WHEN viewport_area_km2_calc > 100000 THEN 5
      ELSE 1
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
          AND (tier_list_ids IS NULL OR p2.id IN (SELECT tli.place_id FROM tier_list_items tli WHERE tli.tier_list_id = ANY(tier_list_ids)))
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
      AND (tier_list_ids IS NULL OR p.id IN (SELECT tli.place_id FROM tier_list_items tli WHERE tli.tier_list_id = ANY(tier_list_ids)))
    ORDER BY p.confidence DESC, p.rating DESC NULLS LAST
    LIMIT result_limit;
  END IF;

END;
$function$;

-- ============================================================
-- 2. search_places_hybrid (revert)
-- ============================================================

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
BEGIN
  has_categories := matched_categories IS NOT NULL AND array_length(matched_categories, 1) > 0;
  has_text_query := search_query IS NOT NULL AND length(trim(search_query)) > 0;

  IF has_text_query THEN
    tsquery_val := websearch_to_tsquery('simple', search_query);
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
      AND (tier_list_ids IS NULL OR p.id IN (SELECT tli.place_id FROM tier_list_items tli WHERE tli.tier_list_id = ANY(tier_list_ids)))
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
