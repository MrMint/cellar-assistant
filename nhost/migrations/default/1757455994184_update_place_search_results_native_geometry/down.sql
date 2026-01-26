ALTER TABLE place_search_results ALTER COLUMN cluster_center TYPE text USING ST_AsGeoJSON(cluster_center);
ALTER TABLE place_search_results ALTER COLUMN cluster_bounds TYPE text USING ST_AsGeoJSON(cluster_bounds);
ALTER TABLE place_search_results ALTER COLUMN location TYPE text USING ST_AsGeoJSON(location);
