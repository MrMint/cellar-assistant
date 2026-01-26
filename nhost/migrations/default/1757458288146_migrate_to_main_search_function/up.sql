-- Migrate to main search function implementation
-- This migration makes the PostGIS native geometry implementation the main function

-- Drop the old search_places_adaptive_cluster function (returns text JSON)
DROP FUNCTION IF EXISTS public.search_places_adaptive_cluster(
  west_bound FLOAT8,
  south_bound FLOAT8,
  east_bound FLOAT8,
  north_bound FLOAT8,
  category_filter TEXT[],
  min_rating FLOAT8,
  visit_status_filter TEXT,
  filter_user_id UUID,
  result_limit INTEGER
);

-- Drop the search_places_adaptive_cluster_geojson function
DROP FUNCTION IF EXISTS public.search_places_adaptive_cluster_geojson(
  west_bound FLOAT8,
  south_bound FLOAT8,
  east_bound FLOAT8,
  north_bound FLOAT8,
  category_filter TEXT[],
  min_rating FLOAT8,
  visit_status_filter TEXT,
  filter_user_id UUID,
  result_limit INTEGER
);

-- Rename the v2 function to be the main function
ALTER FUNCTION public.search_places_adaptive_cluster_v2(
  west_bound FLOAT8,
  south_bound FLOAT8,
  east_bound FLOAT8,
  north_bound FLOAT8,
  category_filter TEXT[],
  min_rating FLOAT8,
  visit_status_filter TEXT,
  filter_user_id UUID,
  result_limit INTEGER
) RENAME TO search_places_adaptive_cluster;