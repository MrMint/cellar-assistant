ALTER TABLE place_search_results ALTER COLUMN cluster_center TYPE geography(POINT,4326) USING ST_GeomFromGeoJSON(cluster_center);
ALTER TABLE place_search_results ALTER COLUMN cluster_bounds TYPE geometry(POLYGON,4326) USING ST_GeomFromGeoJSON(cluster_bounds);
ALTER TABLE place_search_results ALTER COLUMN location TYPE geography(POINT,4326) USING ST_GeomFromGeoJSON(location);
