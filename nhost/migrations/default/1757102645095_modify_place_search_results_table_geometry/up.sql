-- Alter the table to use text for geometry fields
ALTER TABLE place_search_results 
  ALTER COLUMN cluster_center TYPE text USING ST_AsGeoJSON(cluster_center),
  ALTER COLUMN cluster_bounds TYPE text USING ST_AsGeoJSON(cluster_bounds),
  ALTER COLUMN location TYPE text USING ST_AsGeoJSON(location);
