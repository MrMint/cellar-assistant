-- Revert the migration
-- Rename the function back to v2
ALTER FUNCTION public.search_places_adaptive_cluster(
  west_bound FLOAT8,
  south_bound FLOAT8,
  east_bound FLOAT8,
  north_bound FLOAT8,
  category_filter TEXT[],
  min_rating FLOAT8,
  visit_status_filter TEXT,
  filter_user_id UUID,
  result_limit INTEGER
) RENAME TO search_places_adaptive_cluster_v2;

-- Note: We're not recreating the old functions in the down migration
-- as they are being permanently retired in favor of the PostGIS native implementation