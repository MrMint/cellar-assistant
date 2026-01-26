-- ==========================================
-- Complete Clustering System
-- Creates table and function for adaptive clustering
-- ==========================================

-- Step 1: Create result table for custom function return type (required by Hasura)
CREATE TABLE place_search_results (
  -- Discriminator field
  is_cluster BOOLEAN NOT NULL,
  
  -- Cluster fields (NULL for individual places)
  cluster_id INTEGER,
  cluster_count INTEGER,
  cluster_center GEOGRAPHY(POINT),
  cluster_bounds GEOMETRY,
  
  -- Individual place fields (NULL for clusters)
  id UUID,
  name TEXT,
  location GEOGRAPHY(POINT),
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
  
  -- Metadata fields
  viewport_area_km2 FLOAT,
  density_per_km2 FLOAT,
  clustering_applied BOOLEAN DEFAULT false,
  
  -- Add constraints
  CONSTRAINT place_search_results_cluster_check 
    CHECK ((is_cluster = true AND cluster_id IS NOT NULL) OR 
           (is_cluster = false AND id IS NOT NULL))
);

-- Indexes for result table performance
CREATE INDEX idx_place_search_results_cluster ON place_search_results (is_cluster, cluster_id);

-- Step 2: Grant permissions
GRANT SELECT ON place_search_results TO nhost_hasura;

-- Step 3: Create the adaptive clustering function
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
  
  -- Adaptive clustering distance based on viewport size (smaller viewport = tighter clustering)
  -- Optimized for better cluster distribution at metro level
  -- Range: 50m (very zoomed in) to 20km (very zoomed out)
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
      -- Adaptive input limit: more places for larger viewports that need clustering
      LIMIT CASE 
        WHEN viewport_area_km2 > 50000 THEN result_limit * 30  -- State+ level: 15000 places
        WHEN viewport_area_km2 > 1000 THEN result_limit * 4     -- City level: 2000 places  
        ELSE result_limit * 2                                   -- Local level: 1000 places
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
      HAVING COUNT(*) >= 3  -- At least 3 places to form a cluster
    ),
    single_places AS (
      SELECT cp.* FROM clustered_places cp WHERE cp.cluster_id IS NULL
    )
    -- Return clusters
    SELECT 
      true::boolean,                                    -- is_cluster
      cs.cluster_id::integer,                           -- cluster_id  
      cs.place_count::integer,                          -- cluster_count
      cs.center_point,                                  -- cluster_center
      cs.bounds,                                        -- cluster_bounds
      gen_random_uuid(),                                -- id
      ('🏪 ' || cs.place_count || ' places')::text,      -- name
      cs.center_point,                                  -- location  
      'cluster'::text,                                  -- primary_category
      ARRAY['cluster']::text[],                         -- categories
      cs.avg_confidence,                                -- confidence
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::char(2), -- address fields
      NULL::text, NULL::text, NULL::text, NULL::jsonb, NULL::integer, -- contact fields
      cs.avg_rating, 0::integer, false::boolean,        -- rating fields
      viewport_area_km2,                                -- viewport_area_km2
      cs.place_count::float / GREATEST(viewport_area_km2, 1.0), -- density_per_km2
      true::boolean                                     -- clustering_applied
    FROM cluster_summary cs
    
    UNION ALL
    
    -- Return individual places that didn't cluster
    SELECT 
      false::boolean,                                   -- is_cluster
      NULL::integer, NULL::integer,                     -- cluster fields
      NULL::geography(point,4326), NULL::geometry(polygon,4326), -- cluster geo
      sp.id, sp.name, sp.location, sp.primary_category, sp.categories, sp.confidence,
      sp.street_address, sp.locality, sp.region, sp.postcode, sp.country_code,
      sp.phone, sp.website, sp.email, sp.hours, sp.price_level, sp.rating,
      sp.review_count, sp.is_verified,
      viewport_area_km2, 
      total_places::float / GREATEST(viewport_area_km2, 1.0), -- density_per_km2
      true::boolean                                     -- clustering_applied
    FROM single_places sp;

  ELSE
    -- Return individual places when count is low
    RETURN QUERY
    SELECT 
      false::boolean,                                   -- is_cluster
      NULL::integer, NULL::integer,                     -- cluster fields
      NULL::geography(point,4326), NULL::geometry(polygon,4326), -- cluster geo
      p.id, p.name, p.location, p.primary_category, p.categories, p.confidence,
      p.street_address, p.locality, p.region, p.postcode, p.country_code,
      p.phone, p.website, p.email, p.hours, p.price_level, p.rating,
      p.review_count, p.is_verified,
      viewport_area_km2, total_places::float / GREATEST(viewport_area_km2, 1.0),
      false::boolean                                    -- clustering_applied
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

-- Step 4: Grant function permissions
GRANT EXECUTE ON FUNCTION search_places_adaptive_cluster TO nhost_hasura;