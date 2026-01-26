-- Restore original geometry types (this might fail if data is incompatible)
ALTER TABLE place_search_results 
  ALTER COLUMN cluster_center TYPE geography(point,4326) USING ST_GeomFromGeoJSON(cluster_center),
  ALTER COLUMN cluster_bounds TYPE geometry USING ST_GeomFromGeoJSON(cluster_bounds),
  ALTER COLUMN location TYPE geography(point,4326) USING ST_GeomFromGeoJSON(location);
